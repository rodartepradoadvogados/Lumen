"use server";

// Um arquivo "use server" só pode exportar funções async — maxDuration para createCase/
// createCaseMobile (que podem levar mais de 10s finalizando vários anexos em sequência) fica
// nas rotas que os chamam: app/(app)/processos/novo/page.tsx e app/m/processos/novo/page.tsx.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { isClientInOffice, isUserInOffice, isCaseInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { renameDriveFolder } from "@/lib/storageProvider";
import { sendEmailReply } from "@/lib/gmailSend";
import { linkPublicationToCase } from "@/lib/actions/publications";

// Convenção de nomenclatura: sempre que o(s) NOSSO(s) cliente(s) e a(s) parte(s) do outro lado
// estiverem cadastrados, o título do processo é "{Clientes} x {Partes}" — nunca um meio-termo
// (ex. só cliente, ou cliente com "x" sem parte) para não ficar um título quebrado. Sem os dois
// lados, mantém o título informado manualmente (ex.: Atendimento/Consultivo sem parte adversa
// não tem por que forçar esse formato). Em litisconsórcio, cada lado vira "A e B" — a lista
// completa de nomes já vem montada por quem chama (ver joinNames).
function computeCaseTitle(clientNames: string[], partyNames: string[], fallback: string): string {
  if (clientNames.length > 0 && partyNames.length > 0) return `${joinNames(clientNames)} x ${joinNames(partyNames)}`;
  return fallback;
}

function joinNames(names: string[]): string {
  const clean = names.filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  return `${clean.slice(0, -1).join(", ")} e ${clean[clean.length - 1]}`;
}

// Um cliente ou uma parte informados no cadastro/edição do processo — cada linha do array vira
// um CaseClient/CaseParty próprio (ver createCase/updateCase). Cliente pode ser um Client já
// cadastrado (clientId) ou um nome novo, criado na hora (newClientName) — mesma lógica que já
// existia para o cliente único, só que agora repetida por entrada.
type ClientInput = { clientId?: string; newClientName?: string; role?: string };
type PartyInput = { name: string; document?: string; address?: string; role?: string };

async function assertCaseRelationsInOffice(
  data: { clientId?: string; responsibleId?: string; assessoriaId?: string },
  officeId: string
): Promise<void> {
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.assessoriaId && !(await isAssessoriaInOffice(data.assessoriaId, officeId))) throw new Error("Assessoria não encontrada.");
}

// Resolve cada entrada de cliente (existente ou novo) em um { id, name, role } real, criando o
// Client novo quando necessário — usado tanto na criação quanto na edição do processo. Entradas
// sem clientId nem newClientName são descartadas (linha em branco deixada no formulário).
async function resolveClientInputs(
  inputs: ClientInput[] | undefined,
  officeId: string
): Promise<{ id: string; name: string; role: string | null }[]> {
  if (!inputs || inputs.length === 0) return [];
  const resolved: { id: string; name: string; role: string | null }[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    let id = input.clientId || "";
    let name = "";
    if (id) {
      if (!(await isClientInOffice(id, officeId))) throw new Error("Cliente não encontrado.");
      const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
      if (!client) continue;
      name = client.name;
    } else if (input.newClientName?.trim()) {
      const client = await prisma.client.create({ data: { name: input.newClientName.trim(), type: "PF", officeId } });
      id = client.id;
      name = client.name;
    } else {
      continue;
    }
    if (seen.has(id)) continue; // mesmo cliente selecionado duas vezes — mantém só a primeira
    seen.add(id);
    resolved.push({ id, name, role: input.role || null });
  }
  return resolved;
}

function resolvePartyInputs(inputs: PartyInput[] | undefined): PartyInput[] {
  if (!inputs) return [];
  return inputs.filter((p) => p.name?.trim()).map((p) => ({ ...p, name: p.name.trim() }));
}

// Grava as linhas de CaseClient/CaseParty para um processo já criado — chamado por createCase/
// createCaseMobile (caso novo, sem nada a apagar antes) e por updateCase (substituindo a lista
// inteira, mais simples e seguro do que tentar diffar entrada a entrada).
async function writeCaseClientsAndParties(
  caseId: string,
  clients: { id: string; name: string; role: string | null }[],
  parties: PartyInput[]
): Promise<void> {
  if (clients.length > 0) {
    await prisma.caseClient.createMany({
      data: clients.map((c) => ({ caseId, clientId: c.id, role: c.role })),
      skipDuplicates: true,
    });
  }
  if (parties.length > 0) {
    await prisma.caseParty.createMany({
      data: parties.map((p) => ({
        caseId,
        name: p.name,
        document: p.document || null,
        address: p.address || null,
        role: p.role || "OUTRO",
      })),
    });
  }
}

// Mapeia o polo de uma parte (que pode ser TERCEIRO_INTERESSADO, só existente na lista nova) para
// o valor equivalente mais próximo do enum legado (AUTOR | REU | OUTRO) usado em
// Case.opposingPartyRole — Terceiro Interessado não tem polo, então cai em OUTRO.
function legacyOpposingPartyRole(role: string | null | undefined): string | null {
  if (role === "AUTOR" || role === "REU") return role;
  if (!role) return null;
  return "OUTRO";
}

// Anexos que o usuário já subiu pro Vercel Blob enquanto preenchia o formulário de criação (ver
// components/NewCaseAttachmentsField.tsx) — o caso ainda não existia, então falta só a etapa 2
// (finalizeAttachmentUpload: baixa do Blob, manda pro Drive e cria o Attachment de verdade), que
// só dá pra fazer agora que o caso tem um id real.
type StagedAttachment = { blobUrl: string; name: string; contentType: string; docType?: string };

// Publicação de origem: quando "Cadastrar novo processo" é aberto de dentro de uma publicação
// (LinkPublicationMenu, dentro de PublicationRow.tsx/MobilePublicationCard.tsx), o link carrega
// ?publicationId=... e o formulário repassa esse id até aqui — vincula automaticamente a
// publicação ao processo recém-criado, sem o usuário precisar voltar à tela de Publicações pra
// vincular à mão (pedido do dono do escritório). Reaproveita linkPublicationToCase (mesma ação
// usada por "Vincular a processo já existente"), que já confere no servidor que a publicação
// pertence ao escritório do usuário — nenhuma checagem paralela é feita aqui.
//
// Só opera sobre UMA publicação (o item "primary" do card/grupo, ver lib/publicationGrouping.ts)
// porque linkPublicationToCase em si só vincula uma publicação por chamada — mesmo comportamento
// que "Vincular a processo já existente" já tinha antes desta função existir; as demais fontes do
// mesmo processo (DJEN/Datajud/e-mail do Jusbrasil), se houver, continuam vinculáveis abrindo cada
// uma via o "+N outras fontes" do card.
//
// Nunca lança: o processo acabou de ser criado com todos os dados que o usuário digitou — uma
// falha ao vincular a publicação (id inválido, publicação de outro escritório, publicação já
// vinculada a outro processo etc.) não pode derrubar a criação do processo, só fica sem o vínculo
// automático (o usuário ainda pode vincular à mão pela tela de Publicações).
async function linkOriginPublicationBestEffort(publicationId: string | undefined, caseId: string): Promise<void> {
  if (!publicationId) return;
  try {
    await linkPublicationToCase(publicationId, caseId);
  } catch (e) {
    console.error(`[cases] falha ao vincular a publicação de origem ${publicationId} ao processo recém-criado ${caseId}:`, e);
  }
}

// Cada item isolado no seu próprio try/catch: sem isso, um item que falhasse no meio da lista
// (Drive lento, rate limit, timeout da function) derrubava a promise inteira e abortava TODOS os
// itens seguintes sem processar — bug real relatado ("juntei vários documentos... só subiram 3").
// Sequencial de propósito (não Promise.all): document upload no Drive não deve disparar N
// chamadas simultâneas para a mesma pasta (getOrCreateCategoryFolder tem uma janela de
// find-or-create que pode duplicar pasta sob concorrência). Devolve quantos falharam, pra quem
// chamou poder avisar o usuário em vez de fingir que deu tudo certo.
async function finalizeStagedAttachments(staged: StagedAttachment[] | undefined, caseId: string): Promise<number> {
  if (!staged || staged.length === 0) return 0;
  let falhas = 0;
  for (const att of staged) {
    try {
      const result = await finalizeAttachmentUpload({
        blobUrl: att.blobUrl,
        name: att.name,
        contentType: att.contentType,
        docType: att.docType || "OUTRO",
        caseId,
      });
      if (result.error) {
        falhas++;
        console.error(`[finalizeStagedAttachments] falha ao anexar "${att.name}" no caso ${caseId}: ${result.error}`);
      }
    } catch (e) {
      falhas++;
      const message = e instanceof Error ? e.message : "erro desconhecido";
      console.error(`[finalizeStagedAttachments] falha ao anexar "${att.name}" no caso ${caseId}: ${message}`);
    }
  }
  return falhas;
}

export async function createCase(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clients?: ClientInput[];
  parties?: PartyInput[];
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
  tribunalSigla?: string;
  tribunalNome?: string;
  tribunalSistema?: string;
  tribunalLink?: string;
  // Só fazem sentido quando type === "ADMINISTRATIVO" (ver lib/caseNatureza.ts) — em qualquer
  // outro type são sempre gravados como null (ver isAdministrativo abaixo), pra nunca sobrar
  // esfera/matéria de um cadastro administrativo num processo judicial editado depois.
  adminEsfera?: string;
  adminMateria?: string;
  stagedAttachments?: StagedAttachment[];
  // Ver linkOriginPublicationBestEffort acima.
  publicationId?: string;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice({ responsibleId: data.responsibleId, assessoriaId: data.assessoriaId }, viewer.officeId);

  const resolvedClients = await resolveClientInputs(data.clients, viewer.officeId);
  const resolvedParties = resolvePartyInputs(data.parties);
  const primaryClient = resolvedClients[0];
  const primaryParty = resolvedParties[0];
  const isAdministrativo = data.type === "ADMINISTRATIVO";

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(resolvedClients.map((c) => c.name), resolvedParties.map((p) => p.name), data.title),
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId: primaryClient?.id || null,
      clientRole: primaryClient?.role || null,
      opposingPartyName: primaryParty?.name || null,
      opposingPartyRole: legacyOpposingPartyRole(primaryParty?.role),
      opposingPartyDocument: primaryParty?.document || null,
      opposingPartyAddress: primaryParty?.address || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
      adminEsfera: isAdministrativo ? data.adminEsfera || null : null,
      adminMateria: isAdministrativo ? data.adminMateria || null : null,
      officeId: viewer.officeId,
    },
  });
  await writeCaseClientsAndParties(created.id, resolvedClients, resolvedParties);
  const anexosComErro = await finalizeStagedAttachments(data.stagedAttachments, created.id);
  await linkOriginPublicationBestEffort(data.publicationId, created.id);
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  redirect(`/processos/${created.id}${anexosComErro > 0 ? `?anexosFalhos=${anexosComErro}` : ""}`);
}

// Edição completa do card de Processo (aba Visão Geral) — cobre os mesmos campos hoje
// read-only ali, mais os 4 campos de tribunal (ver EditCaseModal.tsx). Reaproveita
// assertCaseRelationsInOffice (mesma checagem de segurança de createCase) para clientId e
// responsibleId; não valida assessoriaId porque esse vínculo não faz parte deste modal.
export async function updateCase(
  caseId: string,
  data: {
    clients?: ClientInput[];
    parties?: PartyInput[];
    responsibleId?: string;
    court?: string;
    caseValue?: string;
    convictionValue?: string;
    economicBenefitValue?: string;
    tribunalSigla?: string;
    tribunalNome?: string;
    tribunalSistema?: string;
    tribunalLink?: string;
    // type raramente muda aqui (hoje nenhuma tela do site desktop deixa editar — só existe pra
    // não travar uma correção pontual de cadastro futura); quando ausente, mantém o type já
    // salvo. adminEsfera/adminMateria seguem o type EFETIVO (o novo, se veio, senão o existente):
    // mesma regra null-nos-dois-fora-de-ADMINISTRATIVO de createCase, ver isAdministrativo abaixo.
    type?: string;
    adminEsfera?: string;
    adminMateria?: string;
  }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const existing = await prisma.case.findFirst({
    where: { id: caseId, officeId: viewer.officeId },
    select: { id: true, title: true, driveFolderId: true, type: true },
  });
  if (!existing) return { error: "Processo não encontrado." };
  const isAdministrativo = (data.type || existing.type) === "ADMINISTRATIVO";

  let resolvedClients: { id: string; name: string; role: string | null }[];
  let resolvedParties: PartyInput[];
  try {
    await assertCaseRelationsInOffice({ responsibleId: data.responsibleId }, viewer.officeId);
    resolvedClients = await resolveClientInputs(data.clients, viewer.officeId);
    resolvedParties = resolvePartyInputs(data.parties);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }
  const primaryClient = resolvedClients[0];
  const primaryParty = resolvedParties[0];

  // Reaplica a convenção "Cliente(s) x Parte(s)" se a edição deixou os dois lados disponíveis —
  // mesmo se o título ainda não seguia o padrão (ex.: processo antigo). Sem os dois, mantém o
  // título já salvo (nunca apaga um título manual por falta de um dos lados).
  const newTitle = computeCaseTitle(
    resolvedClients.map((c) => c.name),
    resolvedParties.map((p) => p.name),
    existing.title
  );

  // Substitui a lista inteira de clientes/partes em vez de tentar diffar item a item — mais
  // simples e não corre risco de deixar linha órfã de uma edição anterior.
  await prisma.caseClient.deleteMany({ where: { caseId } });
  await prisma.caseParty.deleteMany({ where: { caseId } });

  await prisma.case.update({
    where: { id: caseId },
    data: {
      title: newTitle,
      ...(data.type ? { type: data.type } : {}),
      clientId: primaryClient?.id || null,
      clientRole: primaryClient?.role || null,
      opposingPartyName: primaryParty?.name || null,
      opposingPartyRole: legacyOpposingPartyRole(primaryParty?.role),
      opposingPartyDocument: primaryParty?.document || null,
      opposingPartyAddress: primaryParty?.address || null,
      responsibleId: data.responsibleId || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      convictionValue: data.convictionValue ? parseFloat(data.convictionValue) : null,
      economicBenefitValue: data.economicBenefitValue ? parseFloat(data.economicBenefitValue) : null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
      adminEsfera: isAdministrativo ? data.adminEsfera || null : null,
      adminMateria: isAdministrativo ? data.adminMateria || null : null,
    },
  });
  await writeCaseClientsAndParties(caseId, resolvedClients, resolvedParties);

  // A pasta do processo no Drive é nomeada com o título (ver getOrCreateCaseFolder) — se o
  // título mudou e a pasta já existe, renomeia junto pra não destoar. Best-effort: uma falha
  // aqui (ex. credencial revogada) não deve impedir a atualização do processo em si — o sync
  // reverso diário (lib/driveSync.ts) detecta e alerta qualquer divergência que sobrar.
  if (newTitle !== existing.title && existing.driveFolderId) {
    try {
      await renameDriveFolder(existing.driveFolderId, newTitle, viewer.officeId);
    } catch (e) {
      console.error(`[cases] falha ao renomear a pasta do processo ${caseId} no armazenamento:`, e);
    }
  }

  revalidatePath(`/processos/${caseId}`);
  return {};
}

export type CaseNamingResult = {
  renamed: number;
  driveRenameErrors: number;
  withoutClient: { id: string; title: string; processNumber: string | null }[];
};

// Ação administrativa avulsa (mesmo padrão de lib/actions/driveReorg.ts:reorganizeExistingAttachments):
// aplica a convenção "Cliente x Parte Adversa" nos processos JÁ EXISTENTES do escritório, pra
// quem cadastrou antes dessa regra existir. Só renomeia quando cliente E parte adversa estão
// cadastrados (senão não tem como montar o "x"); quando não há cliente vinculado, devolve o
// processo na lista withoutClient em vez de tentar adivinhar — quem está rodando a ação decide
// o que fazer (vincular um cliente e rodar de novo, ou deixar como está).
export async function applyClientOpponentNamingConvention(): Promise<CaseNamingResult | { error: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Apenas administradores podem fazer isso." };

  const cases = await prisma.case.findMany({
    where: { officeId: viewer.officeId },
    select: {
      id: true,
      title: true,
      processNumber: true,
      opposingPartyName: true,
      driveFolderId: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });

  let renamed = 0;
  let driveRenameErrors = 0;
  const withoutClient: { id: string; title: string; processNumber: string | null }[] = [];

  for (const c of cases) {
    if (!c.clientId || !c.client) {
      withoutClient.push({ id: c.id, title: c.title, processNumber: c.processNumber });
      continue;
    }
    if (!c.opposingPartyName) continue; // sem parte adversa cadastrada — não dá pra montar "Cliente x Adversa", mantém como está

    const newTitle = `${c.client.name} x ${c.opposingPartyName}`;
    if (newTitle === c.title) continue;

    await prisma.case.update({ where: { id: c.id }, data: { title: newTitle } });
    renamed++;

    if (c.driveFolderId) {
      try {
        await renameDriveFolder(c.driveFolderId, newTitle, viewer.officeId);
      } catch (e) {
        driveRenameErrors++;
        console.error(`[cases] falha ao renomear a pasta do processo ${c.id} no armazenamento (aplicação retroativa da convenção):`, e);
      }
    }
  }

  revalidatePath("/processos");
  return { renamed, driveRenameErrors, withoutClient };
}

// Mesmo cadastro de createCase, mas sem redirect() — o redirect da versão desktop aponta
// pra "/processos/{id}" (fora de /m), então o app mobile precisa navegar ele mesmo, pro
// equivalente "/m/processos/{id}" (ver components/mobile/MobileNewCaseForm.tsx).
export async function createCaseMobile(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clients?: ClientInput[];
  parties?: PartyInput[];
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
  tribunalSigla?: string;
  tribunalNome?: string;
  tribunalSistema?: string;
  tribunalLink?: string;
  adminEsfera?: string;
  adminMateria?: string;
  stagedAttachments?: StagedAttachment[];
  // Ver linkOriginPublicationBestEffort acima.
  publicationId?: string;
}): Promise<{ id: string; anexosComErro?: number }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice({ responsibleId: data.responsibleId, assessoriaId: data.assessoriaId }, viewer.officeId);

  const resolvedClients = await resolveClientInputs(data.clients, viewer.officeId);
  const resolvedParties = resolvePartyInputs(data.parties);
  const primaryClient = resolvedClients[0];
  const primaryParty = resolvedParties[0];
  const isAdministrativo = data.type === "ADMINISTRATIVO";

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(resolvedClients.map((c) => c.name), resolvedParties.map((p) => p.name), data.title),
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId: primaryClient?.id || null,
      clientRole: primaryClient?.role || null,
      opposingPartyName: primaryParty?.name || null,
      opposingPartyRole: legacyOpposingPartyRole(primaryParty?.role),
      opposingPartyDocument: primaryParty?.document || null,
      opposingPartyAddress: primaryParty?.address || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
      adminEsfera: isAdministrativo ? data.adminEsfera || null : null,
      adminMateria: isAdministrativo ? data.adminMateria || null : null,
      officeId: viewer.officeId,
    },
  });
  await writeCaseClientsAndParties(created.id, resolvedClients, resolvedParties);
  const anexosComErro = await finalizeStagedAttachments(data.stagedAttachments, created.id);
  await linkOriginPublicationBestEffort(data.publicationId, created.id);
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  return { id: created.id, anexosComErro: anexosComErro > 0 ? anexosComErro : undefined };
}

export async function createCaseQuick(title: string, clientId?: string): Promise<{ id: string; title: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  if (clientId && !(await isClientInOffice(clientId, viewer.officeId))) throw new Error("Cliente não encontrado.");
  const created = await prisma.case.create({
    data: { title, type: "ATENDIMENTO", clientId: clientId || null, officeId: viewer.officeId },
  });
  revalidatePath("/processos");
  return { id: created.id, title: created.title };
}

export async function updateCaseStatus(caseId: string, status: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.case.updateMany({ where: { id: caseId, officeId: viewer.officeId }, data: { status } });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}

export async function promoteCaseToJudicial(caseId: string, data: { processNumber: string; court?: string }) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.case.updateMany({
    where: { id: caseId, officeId: viewer.officeId },
    data: { type: "JUDICIAL", processNumber: data.processNumber, court: data.court || null },
  });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}

// Um advogado escreve um e-mail para outro (ou pra um endereço avulso) direto de dentro do
// processo, e ele sai NA HORA — nunca agendado, e nunca em nome do "sistema": reaproveita
// sendEmailReply (o mesmo mecanismo já usado pra responder cliente no Atendimento), que usa a
// conta Google/Microsoft que o próprio remetente conectou em Configurações, então o e-mail chega
// genuinamente do endereço dele. Sem conta conectada, falha com uma mensagem clara — nunca cai
// silenciosamente numa caixa genérica do escritório, o que quebraria a autoria do remetente.
export async function sendCaseEmail(caseId: string, to: string, subject: string, body: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!(await isCaseInOffice(caseId, viewer.officeId))) return { error: "Processo não encontrado." };

  const toAddress = to.trim();
  const subjectText = subject.trim();
  const bodyText = body.trim();
  if (!toAddress || !subjectText || !bodyText) return { error: "Preencha destinatário, assunto e mensagem antes de enviar." };

  const result = await sendEmailReply(viewer.id, toAddress, subjectText, bodyText);

  // Registra o envio (sucesso ou falha) como um comentário do processo — mesmo lugar onde já
  // aparece o resto da conversa da aba Comentários, sem precisar de um modelo novo só pra isso.
  // Não passa por addComment (que também interpreta @menções) de propósito: o corpo de um
  // e-mail pode conter um "@algumacoisa" incidental que não é uma menção de verdade.
  await prisma.comment.create({
    data: {
      content: result.ok
        ? `📧 E-mail enviado para ${toAddress} — Assunto: "${subjectText}"\n\n${bodyText}`
        : `📧 Falha ao enviar e-mail para ${toAddress} — Assunto: "${subjectText}" (${result.error || "erro desconhecido"})`,
      authorId: viewer.id,
      caseId,
      officeId: viewer.officeId,
    },
  });

  revalidatePath(`/processos/${caseId}`);

  if (!result.ok) return { error: result.error || "Não foi possível enviar o e-mail." };
  return {};
}
