"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { isClientInOffice, isUserInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { renameDriveFolder } from "@/lib/storageProvider";

// Convenção de nomenclatura: sempre que o NOSSO cliente e a parte adversa estiverem
// cadastrados, o título do processo é "{Cliente} x {Parte Adversa}" — nunca um meio-termo (ex.
// só cliente, ou cliente com "x" sem adversa) para não ficar um título quebrado. Sem os dois
// dados, mantém o título informado manualmente (ex.: Atendimento/Consultivo sem parte adversa
// não tem por que forçar esse formato).
function computeCaseTitle(clientName: string | null, opposingPartyName: string | null, fallback: string): string {
  if (clientName && opposingPartyName) return `${clientName} x ${opposingPartyName}`;
  return fallback;
}

async function assertCaseRelationsInOffice(
  data: { clientId?: string; responsibleId?: string; assessoriaId?: string },
  officeId: string
): Promise<void> {
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.assessoriaId && !(await isAssessoriaInOffice(data.assessoriaId, officeId))) throw new Error("Assessoria não encontrada.");
}

// Anexos que o usuário já subiu pro Vercel Blob enquanto preenchia o formulário de criação (ver
// components/NewCaseAttachmentsField.tsx) — o caso ainda não existia, então falta só a etapa 2
// (finalizeAttachmentUpload: baixa do Blob, manda pro Drive e cria o Attachment de verdade), que
// só dá pra fazer agora que o caso tem um id real.
type StagedAttachment = { blobUrl: string; name: string; contentType: string; docType?: string };

async function finalizeStagedAttachments(staged: StagedAttachment[] | undefined, caseId: string): Promise<void> {
  if (!staged || staged.length === 0) return;
  for (const att of staged) {
    await finalizeAttachmentUpload({
      blobUrl: att.blobUrl,
      name: att.name,
      contentType: att.contentType,
      docType: att.docType || "OUTRO",
      caseId,
    });
  }
}

export async function createCase(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clientId?: string;
  newClientName?: string;
  clientRole?: string;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  opposingPartyDocument?: string;
  opposingPartyAddress?: string;
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
  tribunalSigla?: string;
  tribunalNome?: string;
  tribunalSistema?: string;
  tribunalLink?: string;
  stagedAttachments?: StagedAttachment[];
}) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice(data, viewer.officeId);

  let clientId = data.clientId || null;
  let clientName: string | null = data.newClientName || null;
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({ data: { name: data.newClientName, type: "PF", officeId: viewer.officeId } });
    clientId = client.id;
  } else if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    clientName = client?.name ?? null;
  }

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(clientName, data.opposingPartyName || null, data.title),
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId,
      clientRole: data.clientRole || null,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      opposingPartyDocument: data.opposingPartyDocument || null,
      opposingPartyAddress: data.opposingPartyAddress || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
      officeId: viewer.officeId,
    },
  });
  await finalizeStagedAttachments(data.stagedAttachments, created.id);
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  redirect(`/processos/${created.id}`);
}

// Edição completa do card de Processo (aba Visão Geral) — cobre os mesmos campos hoje
// read-only ali, mais os 4 campos de tribunal (ver EditCaseModal.tsx). Reaproveita
// assertCaseRelationsInOffice (mesma checagem de segurança de createCase) para clientId e
// responsibleId; não valida assessoriaId porque esse vínculo não faz parte deste modal.
export async function updateCase(
  caseId: string,
  data: {
    clientId?: string;
    opposingPartyName?: string;
    opposingPartyRole?: string;
    responsibleId?: string;
    court?: string;
    caseValue?: string;
    tribunalSigla?: string;
    tribunalNome?: string;
    tribunalSistema?: string;
    tribunalLink?: string;
  }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const existing = await prisma.case.findFirst({
    where: { id: caseId, officeId: viewer.officeId },
    select: { id: true, title: true, driveFolderId: true },
  });
  if (!existing) return { error: "Processo não encontrado." };

  try {
    await assertCaseRelationsInOffice({ clientId: data.clientId, responsibleId: data.responsibleId }, viewer.officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }

  // Reaplica a convenção "Cliente x Parte Adversa" se a edição deixou os dois dados
  // disponíveis — mesmo se o título ainda não seguia o padrão (ex.: processo antigo). Sem os
  // dois, mantém o título já salvo (nunca apaga um título manual por falta de um dos dois).
  let clientName: string | null = null;
  if (data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: data.clientId }, select: { name: true } });
    clientName = client?.name ?? null;
  }
  const newTitle = computeCaseTitle(clientName, data.opposingPartyName || null, existing.title);

  await prisma.case.update({
    where: { id: caseId },
    data: {
      title: newTitle,
      clientId: data.clientId || null,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      responsibleId: data.responsibleId || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
    },
  });

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
  clientId?: string;
  newClientName?: string;
  clientRole?: string;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  opposingPartyDocument?: string;
  opposingPartyAddress?: string;
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
  tribunalSigla?: string;
  tribunalNome?: string;
  tribunalSistema?: string;
  tribunalLink?: string;
  stagedAttachments?: StagedAttachment[];
}): Promise<{ id: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice(data, viewer.officeId);

  let clientId = data.clientId || null;
  let clientName: string | null = data.newClientName || null;
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({ data: { name: data.newClientName, type: "PF", officeId: viewer.officeId } });
    clientId = client.id;
  } else if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    clientName = client?.name ?? null;
  }

  const created = await prisma.case.create({
    data: {
      title: computeCaseTitle(clientName, data.opposingPartyName || null, data.title),
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId,
      clientRole: data.clientRole || null,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      opposingPartyDocument: data.opposingPartyDocument || null,
      opposingPartyAddress: data.opposingPartyAddress || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      tribunalSigla: data.tribunalSigla || null,
      tribunalNome: data.tribunalNome || null,
      tribunalSistema: data.tribunalSistema || null,
      tribunalLink: data.tribunalLink || null,
      officeId: viewer.officeId,
    },
  });
  await finalizeStagedAttachments(data.stagedAttachments, created.id);
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  return { id: created.id };
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
