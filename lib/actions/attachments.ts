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
  type StorageProvider,
} from "@/lib/storageProvider";
import { extractDriveFileId, deleteDriveFile as deleteGoogleDriveFile, translateDriveError } from "@/lib/googleDrive";
import { isValidBlobUrl } from "@/lib/blobUrl";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { autoResolvePendenciasForAttachment } from "@/lib/actions/attendancePendencias";

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
  if (data.attendanceId) await autoResolvePendenciasForAttachment(data.attendanceId, data.docType || "OUTRO", user.officeId);
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

  // Mesma validação de app/api/assessoria/documentos/upload/route.ts (achado A63 da revisão
  // gauntlet) — sem isso, um chamador autenticado poderia mandar qualquer URL para o servidor
  // baixar (SSRF), inclusive um endereço de rede interna, e o conteúdo baixado vira Attachment
  // salvo e legível.
  if (!isValidBlobUrl(data.blobUrl)) return { error: "Erro ao processar o arquivo enviado. Tente novamente." };

  const resolvedCaseId = data.caseId || null;
  const resolvedAttendanceId = data.attendanceId || null;

  // Resolve a pasta de destino ANTES de tocar no arquivo — se isso falhar (Drive desconectado,
  // token revogado, escopo insuficiente, pasta apagada fora do sistema), sai aqui, sem baixar
  // nada do Blob e sem criar Attachment nenhum. Antes desta mudança essas chamadas ficavam FORA
  // de qualquer try/catch: uma falha aqui virava uma exceção não tratada no meio de uma Server
  // Action (erro genérico de servidor pro usuário, e nada no log explicando o motivo real).
  let targetFolderId: string | null = null;
  try {
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
  } catch (e) {
    console.error("[finalizeAttachmentUpload] falha ao resolver pasta de destino:", e);
    return { error: translateDriveError(e, "preparar a pasta de destino no Drive") };
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

    if (resolvedAttendanceId) await autoResolvePendenciasForAttachment(resolvedAttendanceId, data.docType, user.officeId);
    if (resolvedCaseId) revalidatePath(`/processos/${resolvedCaseId}`);
    if (resolvedAttendanceId) revalidatePath(`/atendimento/${resolvedAttendanceId}`);

    return { id: attachment.id, name: attachment.name, driveUrl: attachment.driveUrl };
  } catch (e) {
    // Não cria Attachment nenhum aqui — o upload falhou antes do prisma.attachment.create acima
    // rodar, então não há documento "fantasma" no banco apontando pra um arquivo que nunca subiu.
    console.error("[finalizeAttachmentUpload] falha ao enviar arquivo para o provedor de armazenamento:", e);
    return { error: translateDriveError(e, "enviar o documento para o Drive") };
  }
}

// `confirmarProtocolado` só é passado no segundo chamado, depois do usuário confirmar o aviso —
// ver components/AttachmentList.tsx. Sem ele, um documento que faz parte de protocolo concluído
// não é excluído: a action devolve `precisaConfirmar` com a lista de protocolos afetados, pra
// quem está apagando saber exatamente o que vai furar no histórico.
export async function deleteAttachment(
  id: string,
  opts?: { confirmarProtocolado?: boolean }
): Promise<{ error?: string; precisaConfirmar?: boolean; protocolos?: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  const att = await prisma.attachment.findFirst({ where: { id, officeId: user.officeId } });
  if (!att) return { error: "Anexo não encontrado." };

  // Um protocolo já concluído é registro histórico do que foi enviado ao tribunal. Excluir um
  // documento que faz parte dele não é proibido (o dono do escritório manda), mas nunca pode ser
  // um clique distraído. A linha do protocolo sobrevive de qualquer forma — ProtocoloLoteItem
  // guarda nome e tipo em snapshot, e attachmentId vira nulo (ver prisma/schema.prisma).
  if (!opts?.confirmarProtocolado) {
    // try/catch de propósito: a tabela de protocolos é criada por SQL aplicado à mão no Neon
    // (prisma/sql/2026-07-31-protocolos.sql), que pode rodar depois deste código subir. Enquanto
    // ela não existir, a consulta falha — e aí o certo é seguir excluindo como sempre foi, não
    // travar uma funcionalidade que já funcionava. A trava liga sozinha quando a tabela existir.
    const emProtocolos = await prisma.protocoloLoteItem
      .findMany({
        where: { attachmentId: id, lote: { status: "PROTOCOLADO", officeId: user.officeId } },
        select: { lote: { select: { titulo: true, numeroProtocolo: true, protocoladoEm: true } } },
      })
      .catch(() => []);
    if (emProtocolos.length > 0) {
      const protocolos = emProtocolos.map((i) => {
        const dia = i.lote.protocoladoEm ? i.lote.protocoladoEm.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
        const numero = i.lote.numeroProtocolo ? `nº ${i.lote.numeroProtocolo}` : null;
        return [i.lote.titulo, numero, dia].filter(Boolean).join(" · ");
      });
      return { precisaConfirmar: true, protocolos };
    }
  }

  // Apaga o arquivo de verdade no provedor certo (não só o vínculo) — se a exclusão falhar lá,
  // segue removendo o vínculo mesmo assim, pra não travar o usuário por um arquivo já apagado
  // manualmente. Anexos com storageFileId gravado (pós esta entrega) usam o id + provedor
  // explícitos; anexos antigos (pré-migração, storageFileId nulo) só podem ser do Google — mesmo
  // caminho de sempre, adivinhando o id pela URL.
  if (att.storageFileId) {
    const provider: StorageProvider =
      att.storageProvider === "ONEDRIVE" ? "ONEDRIVE" : att.storageProvider === "DROPBOX" ? "DROPBOX" : "GOOGLE_DRIVE";
    await deleteDriveFile(att.storageFileId, user.officeId, provider).catch(() => {});
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
  if (att.attendanceId) await autoResolvePendenciasForAttachment(att.attendanceId, docType, user.officeId);
  if (att.caseId) revalidatePath(`/processos/${att.caseId}`);
  if (att.attendanceId) revalidatePath(`/atendimento/${att.attendanceId}`);
  return {};
}
