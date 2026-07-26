"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { getCurrentUser } from "@/lib/currentUser";
import {
  uploadFileToDrive,
  uploadFileToDriveFolder,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
  deleteDriveFile,
} from "@/lib/storageProvider";
import { extractDriveFileId, deleteDriveFile as deleteGoogleDriveFile } from "@/lib/googleDrive";
import { getDocumentTypeLabel } from "@/lib/documentTypes";

export async function createAttachment(data: {
  name: string;
  driveUrl: string;
  docType?: string;
  caseId?: string;
  attendanceId?: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  // caseId/attendanceId vêm do cliente — precisam pertencer ao escritório do usuário logado
  // antes de virarem o vínculo gravado no Attachment (senão um usuário poderia anexar um link
  // a um processo/atendimento de outro escritório).
  if (data.caseId) {
    const c = await prisma.case.findFirst({ where: { id: data.caseId, officeId: user.officeId }, select: { id: true } });
    if (!c) return { error: "Processo não encontrado." };
  }
  if (data.attendanceId) {
    const a = await prisma.attendance.findFirst({ where: { id: data.attendanceId, officeId: user.officeId }, select: { id: true } });
    if (!a) return { error: "Atendimento não encontrado." };
  }

  await prisma.attachment.create({
    data: {
      name: data.name,
      driveUrl: data.driveUrl,
      docType: data.docType || "OUTRO",
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      uploadedById: user.id,
      officeId: user.officeId,
    },
  });
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  if (data.attendanceId) revalidatePath(`/atendimento/${data.attendanceId}`);
  return {};
}

// Segunda etapa do upload de anexos grandes (ver app/api/attachments/blob-token/route.ts para a
// primeira). O navegador já subiu o arquivo direto pro Vercel Blob — aqui só recebemos a URL do
// Blob (payload pequeno, não trava no limite de corpo da function) e terminamos o fluxo: baixamos
// o conteúdo, mandamos pro Drive (fonte definitiva) e apagamos o Blob temporário.
export async function finalizeAttachmentUpload(data: {
  blobUrl: string;
  name: string;
  contentType: string;
  docType: string;
  caseId?: string;
  attendanceId?: string;
}): Promise<{ id?: string; name?: string; driveUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const resolvedCaseId = data.caseId || null;
  const resolvedAttendanceId = data.attendanceId || null;

  let targetFolderId: string | null = null;
  if (resolvedCaseId) {
    const c = await prisma.case.findFirst({ where: { id: resolvedCaseId, officeId: user.officeId }, select: { title: true } });
    if (!c) return { error: "Processo não encontrado." };
    const containerFolderId = await getOrCreateCaseFolder(resolvedCaseId, c.title, user.officeId);
    targetFolderId = await getOrCreateCategoryFolder(containerFolderId, getDocumentTypeLabel(data.docType), user.officeId);
  } else if (resolvedAttendanceId) {
    const a = await prisma.attendance.findFirst({ where: { id: resolvedAttendanceId, officeId: user.officeId }, select: { subject: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    const containerFolderId = await getOrCreateAttendanceFolder(resolvedAttendanceId, a.subject, user.officeId);
    targetFolderId = await getOrCreateCategoryFolder(containerFolderId, getDocumentTypeLabel(data.docType), user.officeId);
  }

  let buffer: Buffer;
  try {
    const res = await fetch(data.blobUrl);
    if (!res.ok) throw new Error("download falhou");
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return { error: "Erro ao processar o arquivo enviado. Tente novamente." };
  }

  try {
    const contentType = data.contentType || "application/octet-stream";
    const result = targetFolderId
      ? await uploadFileToDriveFolder(data.name, contentType, buffer, targetFolderId, user.officeId)
      : await uploadFileToDrive(data.name, contentType, buffer, user.officeId);

    const attachment = await prisma.attachment.create({
      data: {
        officeId: user.officeId,
        name: data.name,
        driveUrl: result.webViewLink,
        docType: data.docType,
        caseId: resolvedCaseId,
        attendanceId: resolvedAttendanceId,
        uploadedById: user.id,
        storageProvider: result.storageProvider,
        storageFileId: result.id,
      },
    });

    del(data.blobUrl).catch(() => {});

    if (resolvedCaseId) revalidatePath(`/processos/${resolvedCaseId}`);
    if (resolvedAttendanceId) revalidatePath(`/atendimento/${resolvedAttendanceId}`);

    return { id: attachment.id, name: attachment.name, driveUrl: attachment.driveUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao enviar arquivo para o Drive." };
  }
}

export async function deleteAttachment(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  const att = await prisma.attachment.findFirst({ where: { id, officeId: user.officeId } });
  if (!att) return { error: "Anexo não encontrado." };

  // Apaga o arquivo de verdade no provedor certo (não só o vínculo) — se a exclusão falhar lá,
  // segue removendo o vínculo mesmo assim, pra não travar o usuário por um arquivo já apagado
  // manualmente. Anexos com storageFileId gravado (pós esta entrega) usam o id + provedor
  // explícitos; anexos antigos (pré-migração, storageFileId nulo) só podem ser do Google — mesmo
  // caminho de sempre, adivinhando o id pela URL.
  if (att.storageFileId) {
    await deleteDriveFile(att.storageFileId, user.officeId, att.storageProvider === "ONEDRIVE" ? "ONEDRIVE" : "GOOGLE_DRIVE").catch(() => {});
  } else {
    const fileId = extractDriveFileId(att.driveUrl);
    if (fileId) {
      await deleteGoogleDriveFile(fileId, user.officeId).catch(() => {});
    }
  }

  await prisma.attachment.delete({ where: { id } });
  if (att.caseId) revalidatePath(`/processos/${att.caseId}`);
  if (att.attendanceId) revalidatePath(`/atendimento/${att.attendanceId}`);
  return {};
}

export async function updateAttachmentDocType(id: string, docType: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  const att = await prisma.attachment.findFirst({ where: { id, officeId: user.officeId } });
  if (!att) return { error: "Anexo não encontrado." };
  await prisma.attachment.update({ where: { id }, data: { docType } });
  if (att.caseId) revalidatePath(`/processos/${att.caseId}`);
  if (att.attendanceId) revalidatePath(`/atendimento/${att.attendanceId}`);
  return {};
}
