"use server";

// Um arquivo "use server" só pode exportar funções async — maxDuration para createCase/
// createCaseMobile (que podem levar mais de 10s finalizando vários anexos em sequência) fica
// nas rotas que os chamam: app/(app)/processos/novo/page.tsx e app/m/processos/novo/page.tsx.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { isClientInOffice, isUserInOffice, isCaseInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { sanitizeExternalUrl } from "@/lib/urlSafety";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { renameDriveFolder } from "@/lib/storageProvider";
import { sendEmailReply } from "@/lib/gmailSend";
import { linkPublicationToCase } from "@/lib/actions/publications";
import { deriveArea } from "@/lib/caseMaterias";
import { instanciaLabel } from "@/lib/caseInstance";

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
// newClientDocument/newClientAddress: mesmos dois campos que já existiam pra parte adversa
// (PartyInput abaixo) — pedido explícito para o cliente cadastrado na hora, direto do formulário
// do processo (ver ClientPicker.tsx), evitando que ele nascesse incompleto e precisasse ser
// completado depois na tela de Clientes.
type ClientInput = { clientId?: string; newClientName?: string; newClientDocument?: string; newClientAddress?: string; role?: string };
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
      const client = await prisma.client.create({
        data: {
          name: input.newClientName.trim(),
          type: "PF",
          officeId,
          document: input.newClientDocument?.trim() || null,
          address: input.newClientAddress?.trim() || null,
        },
      });
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
  // Matérias (multi-select, ver lib/caseMaterias.ts) — `area` (acima) segue aceito por
  // compatibilidade (chamadores antigos), mas quando materias vem preenchido ele manda: area
  // final = deriveArea(materias). Ambos preenchidos ao mesmo tempo não deveria acontecer nas
  // telas atuais (só uma delas manda o campo), mas se acontecer materias vence.
  materias?: string[];
  assuntos?: string[];
  distributedAt?: string;
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
  const materias = (data.materias || []).filter(Boolean);
  const assuntos = (data.assuntos || []).filter(Boolean);

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(resolvedClients.map((c) => c.name), resolvedParties.map((p) => p.name), data.title),
      type: data.type,
      area: materias.length > 0 ? deriveArea(materias) : data.area || null,
      materias,
      assuntos,
      distributedAt: data.distributedAt ? new Date(data.distributedAt) : null,
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
      tribunalLink: sanitizeExternalUrl(data.tribunalLink),
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
    // Ver comentário em EditCaseModal.tsx (CaseData.title): só sobrepõe a convenção automática
    // "Cliente(s) x Parte(s)" quando o texto vier DIFERENTE do que ela geraria a partir dos
    // clients/parties enviados junto — deixar o campo como veio do formulário (sem editar) produz
    // o mesmo texto que computeCaseTitle já geraria, então o comportamento de sempre não muda.
    title?: string;
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
    // Classificação (ver proposta aprovada em 2026-08-07) — description já existia no schema mas
    // nunca foi editável por aqui (só no cadastro); materias/assuntos/distributedAt são novos.
    description?: string;
    materias?: string[];
    assuntos?: string[];
    distributedAt?: string;
    // Instância atual (ver lib/caseInstance.ts) e câmara/turma — a troca de TRIBUNAL em si
    // continua só pelos 4 campos tribunalSigla/Nome/Sistema/Link acima; escalar/retornar de
    // verdade (com o par origem/atual) é feito por escalarTribunalSuperior/
    // retornarInstanciaAnterior, não por aqui, mas o <select> de instância/câmara-turma fica
    // dentro do MESMO form de edição, por isso os dois campos entram no updateCase comum.
    currentInstance?: string;
    currentInstanceDetail?: string;
  }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const existing = await prisma.case.findFirst({
    where: { id: caseId, officeId: viewer.officeId },
    select: { id: true, title: true, driveFolderId: true, type: true, caseValue: true, convictionValue: true, economicBenefitValue: true },
  });
  if (!existing) return { error: "Processo não encontrado." };
  const isAdministrativo = (data.type || existing.type) === "ADMINISTRATIVO";

  // SEGURANÇA (achado V2, auditoria de 05/09/2026): caseValue/convictionValue/
  // economicBenefitValue são exatamente as "bases" que createHonorarioLancamento usa para
  // calcular o valor devido pelo cliente num honorário percentual (ver lib/actions/apuracao.ts,
  // lib/honorarioLancamento.ts) — sem este gate, qualquer usuário com acesso normal de editar o
  // cadastro do processo (não precisa de financeAccess) poderia inflar/reduzir esses valores e
  // afetar quanto o financeiro cobra do cliente depois. O fluxo pensado para alterar essas bases
  // depois de definidas é apurarHonorario (exige acesso financeiro) — updateCase (edição de
  // cadastro) não deveria poder mexer nelas por trás.
  const novoCaseValue = data.caseValue ? parseFloat(data.caseValue) : null;
  const novoConvictionValue = data.convictionValue ? parseFloat(data.convictionValue) : null;
  const novoEconomicBenefitValue = data.economicBenefitValue ? parseFloat(data.economicBenefitValue) : null;
  const mudouBaseFinanceira =
    novoCaseValue !== existing.caseValue ||
    novoConvictionValue !== existing.convictionValue ||
    novoEconomicBenefitValue !== existing.economicBenefitValue;
  if (mudouBaseFinanceira && !viewer.isAdmin && !viewer.financeAccess) {
    return { error: "Alterar valor da causa, da condenação ou do proveito econômico exige acesso ao Financeiro." };
  }

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
  const autoTitle = computeCaseTitle(
    resolvedClients.map((c) => c.name),
    resolvedParties.map((p) => p.name),
    existing.title
  );
  const manualTitle = data.title?.trim();
  const newTitle = manualTitle && manualTitle !== autoTitle ? manualTitle : autoTitle;

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
      caseValue: novoCaseValue,
      convictionValue: novoConvictionValue,
      economicBenefitValue: novoEconomicBenefitValue,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: sanitizeExternalUrl(data.tribunalLink),
      adminEsfera: isAdministrativo ? data.adminEsfera || null : null,
      adminMateria: isAdministrativo ? data.adminMateria || null : null,
      description: data.description || null,
      ...(data.materias ? { materias: data.materias.filter(Boolean), area: deriveArea(data.materias.filter(Boolean)) } : {}),
      ...(data.assuntos ? { assuntos: data.assuntos.filter(Boolean) } : {}),
      distributedAt: data.distributedAt ? new Date(data.distributedAt) : null,
      ...(data.currentInstance !== undefined ? { currentInstance: data.currentInstance || null } : {}),
      ...(data.currentInstanceDetail !== undefined ? { currentInstanceDetail: data.currentInstanceDetail || null } : {}),
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

export type CaseNamingSuggestion = {
  id: string;
  currentTitle: string;
  newTitle: string;
  processNumber: string | null;
};

export type CaseNamingPreview = {
  suggestions: CaseNamingSuggestion[];
  withoutClient: { id: string; title: string; processNumber: string | null }[];
};

// Monta a lista do que a convenção "Cliente x Parte Adversa" mudaria, SEM gravar nada — é o que
// abastece a tabela "nome atual / como ficará" da janela de revisão em
// components/RenameCasesToConventionButton.tsx. Mesmo critério de elegibilidade de sempre (precisa
// de cliente E parte adversa cadastrados) mais o filtro novo: processo marcado como
// `namingConventionIgnored` (usuário já disse "descartar sugestão futura" numa rodada anterior)
// nunca mais aparece aqui, mesmo que o título ainda destoe do padrão.
export async function previewClientOpponentNamingConvention(): Promise<CaseNamingPreview | { error: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Apenas administradores podem fazer isso." };

  const cases = await prisma.case.findMany({
    where: { officeId: viewer.officeId, namingConventionIgnored: false },
    select: {
      id: true,
      title: true,
      processNumber: true,
      opposingPartyName: true,
      clientId: true,
      client: { select: { name: true } },
    },
    orderBy: { title: "asc" },
  });

  const suggestions: CaseNamingSuggestion[] = [];
  const withoutClient: { id: string; title: string; processNumber: string | null }[] = [];

  for (const c of cases) {
    if (!c.clientId || !c.client) {
      withoutClient.push({ id: c.id, title: c.title, processNumber: c.processNumber });
      continue;
    }
    if (!c.opposingPartyName) continue; // sem parte adversa cadastrada — não dá pra montar "Cliente x Adversa", mantém como está

    const newTitle = `${c.client.name} x ${c.opposingPartyName}`;
    if (newTitle === c.title) continue;

    suggestions.push({ id: c.id, currentTitle: c.title, newTitle, processNumber: c.processNumber });
  }

  return { suggestions, withoutClient };
}

// Ação administrativa avulsa (mesmo padrão de lib/actions/driveReorg.ts:reorganizeExistingAttachments):
// aplica a convenção "Cliente x Parte Adversa" só nos processos que o usuário aprovou na janela de
// revisão — `applyIds` ("Aplicar em tudo" manda todos os sugeridos, "Aplicar nos selecionados" manda
// só os marcados). `discardIds` são os processos com a flag "descartar sugestões futuras" ligada:
// NUNCA são renomeados por esta chamada (mesmo que também estejam em `applyIds` por engano) e saem
// para sempre da conferência seguinte via `namingConventionIgnored`. Os dois conjuntos são
// independentes — dá pra descartar uma sugestão sem aplicar nenhuma outra, só marcando os que quer
// descartar e clicando em qualquer um dos dois botões de aplicar.
export async function applyClientOpponentNamingConvention(
  applyIds: string[],
  discardIds: string[]
): Promise<CaseNamingResult | { error: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Apenas administradores podem fazer isso." };

  const discardSet = new Set(discardIds);
  const idsToRename = applyIds.filter((id) => !discardSet.has(id));

  const cases = idsToRename.length
    ? await prisma.case.findMany({
        where: { id: { in: idsToRename }, officeId: viewer.officeId },
        select: { id: true, title: true, opposingPartyName: true, driveFolderId: true, clientId: true, client: { select: { name: true } } },
      })
    : [];

  let renamed = 0;
  let driveRenameErrors = 0;
  const withoutClient: { id: string; title: string; processNumber: string | null }[] = [];

  for (const c of cases) {
    // Revalida no servidor em vez de confiar cegamente no que o preview mandou — o cadastro pode
    // ter mudado entre a conferência e o clique em aplicar (ex.: outra aba editou o processo).
    if (!c.clientId || !c.client || !c.opposingPartyName) continue;

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

  if (discardIds.length) {
    await prisma.case.updateMany({
      where: { id: { in: discardIds }, officeId: viewer.officeId },
      data: { namingConventionIgnored: true },
    });
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
  materias?: string[];
  assuntos?: string[];
  distributedAt?: string;
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
  const materiasMobile = (data.materias || []).filter(Boolean);
  const assuntosMobile = (data.assuntos || []).filter(Boolean);

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(resolvedClients.map((c) => c.name), resolvedParties.map((p) => p.name), data.title),
      type: data.type,
      area: materiasMobile.length > 0 ? deriveArea(materiasMobile) : data.area || null,
      materias: materiasMobile,
      assuntos: assuntosMobile,
      distributedAt: data.distributedAt ? new Date(data.distributedAt) : null,
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
      tribunalLink: sanitizeExternalUrl(data.tribunalLink),
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

// Faz o processo "subir" para um tribunal superior — disparado pelo pop-up ao anexar um recurso
// (components/processo/RecursoEscalaPrompt.tsx) ou editado à mão a qualquer momento em Editar
// Processo. Toda escalada empilha um registro em CaseInstanceEscalation com o estado ANTES (from*)
// e DEPOIS (to*), e os campos "origem" do Case (instance/tribunalOrigem*) são recalculados pra
// sempre espelhar o topo da pilha — ver retornarInstanciaAnterior abaixo e o comentário de
// `instance` no schema. Isso permite múltiplas escaladas em sequência (1º → 2º → STJ) sem perder
// os hops intermediários: cada uma vira um "retorno" possível, um de cada vez.
export async function escalarTribunalSuperior(
  caseId: string,
  data: {
    tribunalSigla: string;
    tribunalNome: string;
    tribunalSistema?: string;
    tribunalLink?: string;
    currentInstance: string;
    currentInstanceDetail?: string;
  }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const existing = await prisma.case.findFirst({
    where: { id: caseId, officeId: viewer.officeId },
    select: {
      tribunalSigla: true,
      tribunalNome: true,
      tribunalSistema: true,
      tribunalLink: true,
      currentInstance: true,
      currentInstanceDetail: true,
    },
  });
  if (!existing) return { error: "Processo não encontrado." };
  if (!data.tribunalSigla.trim()) return { error: "Selecione o tribunal superior." };

  const fromInstance = existing.currentInstance || "PRIMEIRO_GRAU";
  const previousCount = await prisma.caseInstanceEscalation.count({ where: { caseId } });

  await prisma.caseInstanceEscalation.create({
    data: {
      caseId,
      officeId: viewer.officeId,
      order: previousCount + 1,
      fromInstance,
      fromTribunalSigla: existing.tribunalSigla,
      fromTribunalNome: existing.tribunalNome,
      fromTribunalSistema: existing.tribunalSistema,
      fromTribunalLink: existing.tribunalLink,
      fromInstanceDetail: existing.currentInstanceDetail,
      toInstance: data.currentInstance,
      toTribunalSigla: data.tribunalSigla,
      toTribunalNome: data.tribunalNome,
      toTribunalSistema: data.tribunalSistema || null,
      toTribunalLink: data.tribunalLink || null,
      toInstanceDetail: data.currentInstanceDetail || null,
    },
  });

  await prisma.case.update({
    where: { id: caseId },
    data: {
      tribunalSigla: data.tribunalSigla,
      tribunalNome: data.tribunalNome,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: sanitizeExternalUrl(data.tribunalLink),
      currentInstance: data.currentInstance,
      currentInstanceDetail: data.currentInstanceDetail || null,
      // Origem passa a espelhar o registro que acabamos de empilhar — é o que um próximo
      // "retorno dos autos" desfaria.
      instance: fromInstance,
      tribunalOrigemSigla: existing.tribunalSigla,
      tribunalOrigemNome: existing.tribunalNome,
      tribunalOrigemSistema: existing.tribunalSistema,
      tribunalOrigemLink: existing.tribunalLink,
    },
  });

  const origemLabel = existing.tribunalSigla
    ? `${instanciaLabel(existing.currentInstance)} (${existing.tribunalSigla})`
    : instanciaLabel(existing.currentInstance);
  const destinoLabel = `${instanciaLabel(data.currentInstance)} (${data.tribunalSigla})`;
  await prisma.comment.create({
    data: {
      content: `↑ Processo subiu de instância: ${origemLabel} → ${destinoLabel}${data.currentInstanceDetail ? ` — ${data.currentInstanceDetail}` : ""}`,
      authorId: viewer.id,
      caseId,
      officeId: viewer.officeId,
    },
  });

  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
  return {};
}

// Desfaz a escalada mais recente ainda ativa (topo da pilha de CaseInstanceEscalation — ver
// escalarTribunalSuperior acima) — "autos retornaram à instância anterior". Restaura tribunal/
// instância pro estado from* daquele registro, marca returnedAt nele, e recalcula os campos de
// origem do Case a partir do que sobrou na pilha: se havia uma escalada anterior a esta ainda sem
// retorno, ela vira o novo topo (outro "retorno dos autos" a desfaria em seguida); se não sobrou
// nenhuma, os campos de origem voltam a ficar vazios.
export async function retornarInstanciaAnterior(caseId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, select: { id: true } });
  if (!existing) return { error: "Processo não encontrado." };

  const topFrame = await prisma.caseInstanceEscalation.findFirst({
    where: { caseId, returnedAt: null },
    orderBy: { escalatedAt: "desc" },
  });
  if (!topFrame) return { error: "Este processo não tem uma instância anterior registrada." };

  await prisma.caseInstanceEscalation.update({ where: { id: topFrame.id }, data: { returnedAt: new Date() } });

  const previousFrame = await prisma.caseInstanceEscalation.findFirst({
    where: { caseId, returnedAt: null },
    orderBy: { escalatedAt: "desc" },
  });

  await prisma.case.update({
    where: { id: caseId },
    data: {
      tribunalSigla: topFrame.fromTribunalSigla,
      tribunalNome: topFrame.fromTribunalNome,
      tribunalSistema: topFrame.fromTribunalSistema,
      tribunalLink: topFrame.fromTribunalLink,
      currentInstance: topFrame.fromInstance,
      currentInstanceDetail: topFrame.fromInstanceDetail,
      instance: previousFrame ? previousFrame.fromInstance : null,
      tribunalOrigemSigla: previousFrame ? previousFrame.fromTribunalSigla : null,
      tribunalOrigemNome: previousFrame ? previousFrame.fromTribunalNome : null,
      tribunalOrigemSistema: previousFrame ? previousFrame.fromTribunalSistema : null,
      tribunalOrigemLink: previousFrame ? previousFrame.fromTribunalLink : null,
    },
  });

  await prisma.comment.create({
    data: {
      content: `↓ Autos retornaram: ${instanciaLabel(topFrame.toInstance)} (${topFrame.toTribunalSigla}) → ${instanciaLabel(topFrame.fromInstance)}${topFrame.fromTribunalSigla ? ` (${topFrame.fromTribunalSigla})` : ""}`,
      authorId: viewer.id,
      caseId,
      officeId: viewer.officeId,
    },
  });

  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
  return {};
}

// Histórico completo de escaladas (ativas e já revertidas) pra exibir no Processo — mais recente
// primeiro. Puramente leitura, usado pelo bloco "Histórico de instância" em
// InstanciaTribunalPanel.tsx.
export async function getCaseInstanceHistory(caseId: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, select: { id: true } });
  if (!existing) return [];

  const frames = await prisma.caseInstanceEscalation.findMany({
    where: { caseId },
    orderBy: { escalatedAt: "desc" },
  });
  return frames.map((f) => ({
    id: f.id,
    order: f.order,
    fromInstance: f.fromInstance,
    fromTribunalSigla: f.fromTribunalSigla,
    toInstance: f.toInstance,
    toTribunalSigla: f.toTribunalSigla,
    toInstanceDetail: f.toInstanceDetail,
    escalatedAt: f.escalatedAt.toISOString(),
    returnedAt: f.returnedAt ? f.returnedAt.toISOString() : null,
  }));
}
