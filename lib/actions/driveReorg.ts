"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { extractDriveFileId, ASSESSORIA_DOC_TYPE_FOLDERS, getDriveFileInfo } from "@/lib/googleDrive";
import {
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
  getOrCreateAssessoriaCompanyFolder,
  getOrCreateParecerFolder,
  moveDriveFile,
} from "@/lib/storageProvider";
import { getDocumentTypeLabel } from "@/lib/documentTypes";

export type ReorgResult = { moved: number; skipped: number; errors: string[] };

export type ReorgPlanItem = {
  kind: "ATTACHMENT" | "ASSESSORIA_DOCUMENTO";
  id: string;
  name: string;
  fileId: string;
  targetFolderId: string;
  destino: string; // rótulo legível — "Título do processo/atendimento/empresa → Categoria"
};

export type ReorgPlan = { itens: ReorgPlanItem[]; naoMovivel: number } | { error: string };

async function resolverDestinoAttachment(
  att: { id: string; name: string; docType: string; driveUrl: string; case: { id: string; title: string } | null; attendance: { id: string; subject: string } | null },
  officeId: string
): Promise<{ fileId: string; targetFolderId: string; destino: string } | null> {
  const fileId = extractDriveFileId(att.driveUrl);
  if (!fileId) return null;
  let containerFolderId: string;
  let containerLabel: string;
  if (att.case) {
    containerFolderId = await getOrCreateCaseFolder(att.case.id, att.case.title, officeId);
    containerLabel = att.case.title;
  } else if (att.attendance) {
    containerFolderId = await getOrCreateAttendanceFolder(att.attendance.id, att.attendance.subject, officeId);
    containerLabel = att.attendance.subject;
  } else {
    return null;
  }
  const categoryLabel = getDocumentTypeLabel(att.docType);
  const targetFolderId = await getOrCreateCategoryFolder(containerFolderId, categoryLabel, officeId);
  return { fileId, targetFolderId, destino: `${containerLabel} → ${categoryLabel}` };
}

async function resolverDestinoAssessoriaDocumento(
  doc: {
    id: string;
    name: string;
    docType: string;
    driveUrl: string;
    storageFileId: string | null;
    parecerId: string | null;
    assessoria: { client: { name: string } };
    parecer: { id: string; name: string } | null;
  },
  officeId: string
): Promise<{ fileId: string; targetFolderId: string; destino: string } | null> {
  const fileId = doc.storageFileId || extractDriveFileId(doc.driveUrl);
  if (!fileId) return null;
  const companyName = doc.assessoria.client.name;
  if (doc.parecer) {
    const targetFolderId = await getOrCreateParecerFolder(doc.parecerId!, companyName, doc.parecer.name, officeId);
    return { fileId, targetFolderId, destino: `${companyName} → Pareceres → ${doc.parecer.name}` };
  }
  const companyFolderId = await getOrCreateAssessoriaCompanyFolder(companyName, officeId);
  // OUTRO/ACAO_VINCULADA não têm subpasta própria por desenho (ver lib/googleDrive.ts,
  // ASSESSORIA_DOC_TYPE_FOLDERS) — ficam soltos na raiz da empresa, de propósito.
  const subName = ASSESSORIA_DOC_TYPE_FOLDERS[doc.docType];
  const targetFolderId = subName ? await getOrCreateCategoryFolder(companyFolderId, subName, officeId) : companyFolderId;
  return { fileId, targetFolderId, destino: subName ? `${companyName} → ${subName}` : companyName };
}

// Monta o plano do que a reorganização mudaria — SEM mover nada. Cada item que já está na pasta
// certa fica de fora (pedido: "o que já está no lugar certo não precisa aparecer"); essa
// checagem só é possível no Google Drive (getDriveFileInfo lê os parents atuais do arquivo, sem
// equivalente hoje no dispatcher multi-provedor) — em OneDrive/Dropbox o item entra no plano
// mesmo que já esteja correto (mover um arquivo pro parent que ele já tem é inofensivo, só
// reafirma; só não dá pra pré-filtrar como "já certo" com a mesma precisão do Google).
export async function planoReorganizacao(): Promise<ReorgPlan> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };
  const officeId = user.officeId;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } });
  const podeChecarJaCorreto = office?.storageProvider === "GOOGLE_DRIVE";

  const [attachments, documentos] = await Promise.all([
    prisma.attachment.findMany({
      where: { officeId, OR: [{ caseId: { not: null } }, { attendanceId: { not: null } }] },
      include: { case: { select: { id: true, title: true } }, attendance: { select: { id: true, subject: true } } },
    }),
    prisma.assessoriaDocumento.findMany({
      where: { officeId },
      include: { assessoria: { select: { client: { select: { name: true } } } }, parecer: { select: { id: true, name: true } } },
    }),
  ]);

  const itens: ReorgPlanItem[] = [];
  let naoMovivel = 0;

  for (const att of attachments) {
    const resolved = await resolverDestinoAttachment(att, officeId);
    if (!resolved) {
      naoMovivel++;
      continue;
    }
    if (podeChecarJaCorreto) {
      const info = await getDriveFileInfo(resolved.fileId, officeId);
      if (!info || info.parents.includes(resolved.targetFolderId)) continue; // já correto, ou some do Drive (nada a mover)
    }
    itens.push({ kind: "ATTACHMENT", id: att.id, name: att.name, fileId: resolved.fileId, targetFolderId: resolved.targetFolderId, destino: resolved.destino });
  }

  for (const doc of documentos) {
    const resolved = await resolverDestinoAssessoriaDocumento(doc, officeId);
    if (!resolved) {
      naoMovivel++;
      continue;
    }
    if (podeChecarJaCorreto) {
      const info = await getDriveFileInfo(resolved.fileId, officeId);
      if (!info || info.parents.includes(resolved.targetFolderId)) continue;
    }
    itens.push({ kind: "ASSESSORIA_DOCUMENTO", id: doc.id, name: doc.name, fileId: resolved.fileId, targetFolderId: resolved.targetFolderId, destino: resolved.destino });
  }

  return { itens, naoMovivel };
}

// Aplica só os itens marcados (checkbox) na tela — recebe de volta o `fileId`/`targetFolderId`
// já resolvidos pelo plano, sem precisar re-resolver nada: o plano é a fonte da verdade do que
// será feito, o operador só decide QUAIS linhas dele valem.
export async function aplicarReorganizacaoSelecionada(
  itens: { kind: "ATTACHMENT" | "ASSESSORIA_DOCUMENTO"; id: string; fileId: string; targetFolderId: string }[]
): Promise<ReorgResult> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { moved: 0, skipped: 0, errors: ["Apenas administradores podem rodar esta ação."] };

  let moved = 0;
  const errors: string[] = [];
  for (const item of itens) {
    try {
      await moveDriveFile(item.fileId, item.targetFolderId, user.officeId);
      moved++;
    } catch (e) {
      errors.push(`${item.id}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }
  return { moved, skipped: 0, errors };
}
