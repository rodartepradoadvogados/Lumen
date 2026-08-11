"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { extractDriveFileId, ASSESSORIA_DOC_TYPE_FOLDERS } from "@/lib/googleDrive";
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

// Ação administrativa avulsa: reorganiza os Anexos de Processo/Atendimento já existentes no
// Drive, movendo cada arquivo pra pasta do processo/atendimento + subpasta da categoria — a
// mesma estrutura que uploads novos já usam (ver lib/actions/attachments.ts:finalizeAttachmentUpload). Só
// move o que realmente está no nosso Drive (link colado de outro serviço como Dropbox/OneDrive
// é ignorado — não tem como mover um arquivo que não está lá). Idempotente: pode rodar de novo
// sem problema, arquivos já na pasta certa só têm o parent reafirmado.
export async function reorganizeExistingAttachments(): Promise<ReorgResult> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { moved: 0, skipped: 0, errors: ["Apenas administradores podem rodar esta ação."] };

  const attachments = await prisma.attachment.findMany({
    where: { officeId: user.officeId, OR: [{ caseId: { not: null } }, { attendanceId: { not: null } }] },
    include: {
      case: { select: { id: true, title: true } },
      attendance: { select: { id: true, subject: true } },
    },
  });

  let moved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const att of attachments) {
    const fileId = extractDriveFileId(att.driveUrl);
    if (!fileId) {
      skipped++;
      continue;
    }
    try {
      let containerFolderId: string;
      if (att.case) {
        containerFolderId = await getOrCreateCaseFolder(att.case.id, att.case.title, user.officeId);
      } else if (att.attendance) {
        containerFolderId = await getOrCreateAttendanceFolder(att.attendance.id, att.attendance.subject, user.officeId);
      } else {
        skipped++;
        continue;
      }
      const categoryFolderId = await getOrCreateCategoryFolder(containerFolderId, getDocumentTypeLabel(att.docType), user.officeId);
      await moveDriveFile(fileId, categoryFolderId, user.officeId);
      moved++;
    } catch (e) {
      errors.push(`${att.name}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }

  return { moved, skipped, errors };
}

// Mesma ideia de reorganizeExistingAttachments acima, mas para os documentos da Assessoria
// (AssessoriaDocumento) — antes desta entrega, esta ação só cobria Anexo de Processo/Atendimento;
// a árvore de Assessoria (empresa/categoria/parecer) ficava de fora, mesmo lacuna que
// lib/driveSync.ts tinha no sentido contrário (ver syncAssessoriaTree lá). Só move o que realmente
// está no nosso Drive/OneDrive/Dropbox (link colado de outro serviço é ignorado). Idempotente.
export async function reorganizeExistingAssessoriaDocuments(): Promise<ReorgResult> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { moved: 0, skipped: 0, errors: ["Apenas administradores podem rodar esta ação."] };

  const documentos = await prisma.assessoriaDocumento.findMany({
    where: { officeId: user.officeId },
    include: {
      assessoria: { select: { client: { select: { name: true } } } },
      parecer: { select: { id: true, name: true } },
    },
  });

  let moved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of documentos) {
    const fileId = doc.storageFileId || extractDriveFileId(doc.driveUrl);
    if (!fileId) {
      skipped++;
      continue;
    }
    try {
      const companyName = doc.assessoria.client.name;
      let targetFolderId: string;
      if (doc.parecer) {
        targetFolderId = await getOrCreateParecerFolder(doc.parecerId!, companyName, doc.parecer.name, user.officeId);
      } else {
        const companyFolderId = await getOrCreateAssessoriaCompanyFolder(companyName, user.officeId);
        // OUTRO/ACAO_VINCULADA não têm subpasta própria por desenho (ver comentário em
        // lib/googleDrive.ts, ASSESSORIA_DOC_TYPE_FOLDERS) — ficam soltos na raiz da empresa, de
        // propósito, não é um "esqueceu de categorizar".
        const subName = ASSESSORIA_DOC_TYPE_FOLDERS[doc.docType];
        targetFolderId = subName ? await getOrCreateCategoryFolder(companyFolderId, subName, user.officeId) : companyFolderId;
      }
      await moveDriveFile(fileId, targetFolderId, user.officeId);
      moved++;
    } catch (e) {
      errors.push(`${doc.name}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }

  return { moved, skipped, errors };
}
