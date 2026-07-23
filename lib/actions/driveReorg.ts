"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import {
  extractDriveFileId,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
  moveDriveFile,
} from "@/lib/googleDrive";
import { getDocumentTypeLabel } from "@/lib/documentTypes";

export type ReorgResult = { moved: number; skipped: number; errors: string[] };

// Ação administrativa avulsa: reorganiza os Anexos de Processo/Atendimento já existentes no
// Drive, movendo cada arquivo pra pasta do processo/atendimento + subpasta da categoria — a
// mesma estrutura que uploads novos já usam (ver app/api/attachments/upload/route.ts). Só
// move o que realmente está no nosso Drive (link colado de outro serviço como Dropbox/OneDrive
// é ignorado — não tem como mover um arquivo que não está lá). Idempotente: pode rodar de novo
// sem problema, arquivos já na pasta certa só têm o parent reafirmado.
export async function reorganizeExistingAttachments(): Promise<ReorgResult> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { moved: 0, skipped: 0, errors: ["Apenas administradores podem rodar esta ação."] };

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
