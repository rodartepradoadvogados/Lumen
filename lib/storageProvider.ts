// Dispatcher fino de armazenamento de anexos — decide, por Office.storageProvider, se cada
// operação (upload/pasta/exclusão/renomeação/movimentação) vai para o Google Drive, o OneDrive ou
// o Dropbox deste escritório. Os 5 pontos de chamada que hoje importavam direto de
// lib/googleDrive.ts (lib/actions/attachments.ts, lib/actions/driveReorg.ts,
// lib/actions/assessoria.ts, lib/actions/attendance.ts,
// app/api/assessoria/documentos/upload/route.ts) passam a importar daqui — a lógica de negócio
// de cada um não muda, só o import.
//
// Default GOOGLE_DRIVE preserva o comportamento de todo escritório já existente sem nenhuma ação
// da parte deles — só passa a ser ONEDRIVE/DROPBOX se o escritório escolher isso explicitamente
// em Configurações (ver lib/actions/settings.ts:setStorageProvider).
//
// NÃO cobre uploadDocumentTemplateFile/copyAndFillTemplate/isGoogleDocFile (preenchimento de
// modelo via Google Docs API, usado só por Peticionar) — esses continuam Google-only, importados
// direto de lib/googleDrive.ts, sem equivalente aqui.
import { prisma } from "@/lib/prisma";
import * as googleDrive from "@/lib/googleDrive";
import * as oneDriveStorage from "@/lib/oneDriveStorage";
import * as dropboxStorage from "@/lib/dropboxStorage";

export type StorageProvider = "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX";

async function providerFor(officeId: string): Promise<StorageProvider> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } });
  if (office?.storageProvider === "ONEDRIVE") return "ONEDRIVE";
  if (office?.storageProvider === "DROPBOX") return "DROPBOX";
  return "GOOGLE_DRIVE";
}

// Exportado para quem precisa decidir ANTES de agir se uma operação é possível — hoje só
// Protocolos (lib/actions/protocolos.ts): a pasta-espelho com atalhos é recurso exclusivo do
// Google Drive (OneDrive/Dropbox não têm atalho equivalente), então o lote funciona igual no
// site nos três provedores, mas só gera a pasta espelho quando este escritório usa Google.
export async function getStorageProvider(officeId: string): Promise<StorageProvider> {
  return providerFor(officeId);
}

export type UploadResult = { id: string; webViewLink: string; storageProvider: StorageProvider };

export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  officeId: string
): Promise<UploadResult> {
  const provider = await providerFor(officeId);
  let result: { id: string; webViewLink: string };
  switch (provider) {
    case "ONEDRIVE":
      result = await oneDriveStorage.uploadFileToOneDrive(fileName, mimeType, buffer, officeId);
      break;
    case "DROPBOX":
      result = await dropboxStorage.uploadFileToDropbox(fileName, mimeType, buffer, officeId);
      break;
    default:
      result = await googleDrive.uploadFileToDrive(fileName, mimeType, buffer, officeId);
  }
  return { ...result, storageProvider: provider };
}

export async function uploadFileToDriveFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<UploadResult> {
  const provider = await providerFor(officeId);
  let result: { id: string; webViewLink: string };
  switch (provider) {
    case "ONEDRIVE":
      result = await oneDriveStorage.uploadFileToOneDriveFolder(fileName, mimeType, buffer, folderId, officeId);
      break;
    case "DROPBOX":
      result = await dropboxStorage.uploadFileToDropboxFolder(fileName, mimeType, buffer, folderId, officeId);
      break;
    default:
      result = await googleDrive.uploadFileToDriveFolder(fileName, mimeType, buffer, folderId, officeId);
  }
  return { ...result, storageProvider: provider };
}

export async function getOrCreateCaseFolder(caseId: string, caseTitle: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.getOrCreateCaseFolder(caseId, caseTitle, officeId);
    case "DROPBOX":
      return dropboxStorage.getOrCreateCaseFolder(caseId, caseTitle, officeId);
    default:
      return googleDrive.getOrCreateCaseFolder(caseId, caseTitle, officeId);
  }
}

export async function getOrCreateAttendanceFolder(attendanceId: string, subject: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.getOrCreateAttendanceFolder(attendanceId, subject, officeId);
    case "DROPBOX":
      return dropboxStorage.getOrCreateAttendanceFolder(attendanceId, subject, officeId);
    default:
      return googleDrive.getOrCreateAttendanceFolder(attendanceId, subject, officeId);
  }
}

export async function getOrCreateCategoryFolder(parentFolderId: string, categoryLabel: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.getOrCreateCategoryFolder(parentFolderId, categoryLabel, officeId);
    case "DROPBOX":
      return dropboxStorage.getOrCreateCategoryFolder(parentFolderId, categoryLabel, officeId);
    default:
      return googleDrive.getOrCreateCategoryFolder(parentFolderId, categoryLabel, officeId);
  }
}

export async function getOrCreateAssessoriaCompanyFolder(companyName: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.getOrCreateAssessoriaCompanyFolder(companyName, officeId);
    case "DROPBOX":
      return dropboxStorage.getOrCreateAssessoriaCompanyFolder(companyName, officeId);
    default:
      return googleDrive.getOrCreateAssessoriaCompanyFolder(companyName, officeId);
  }
}

// Diferente das demais funções deste dispatcher, recebe o provider EXPLICITAMENTE em vez de
// resolvê-lo por Office.storageProvider — quem chama (lib/actions/attachments.ts:deleteAttachment)
// já sabe qual provedor foi usado no upload original (Attachment.storageProvider), gravado no
// momento do upload. Isso importa porque um escritório pode trocar de provedor DEPOIS de já ter
// anexos no outro — apagar teria que continuar indo pro provedor correto de cada arquivo, não pro
// provedor atual do escritório.
// Mesmo espírito de deleteDriveFile logo abaixo: recebe o provider EXPLICITAMENTE (não resolve
// por Office.storageProvider) porque quem chama (lib/actions/documentoEnvios.ts, no envio de
// documentos por e-mail) já sabe, por Attachment.storageProvider, onde aquele arquivo específico
// foi guardado — pode ser diferente do provedor ATUAL do escritório, se ele trocou depois.
export async function downloadDriveFile(fileId: string, officeId: string, provider: StorageProvider): Promise<{ content: Buffer; mimeType: string }> {
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.downloadFileFromOneDrive(fileId, officeId);
    case "DROPBOX":
      return dropboxStorage.downloadFileFromDropbox(fileId, officeId);
    default:
      return googleDrive.downloadFileFromDrive(fileId, officeId);
  }
}

// Mapa simples extensão → mime type, usado como rede de segurança quando o provedor de
// armazenamento não devolve um Content-Type confiável no download (comum no Dropbox, ver
// lib/dropboxStorage.ts:downloadFileFromDropbox) — não precisa ser exaustivo, só cobrir os tipos
// comuns de documento jurídico que passam pelos Anexos do processo.
const EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  txt: "text/plain",
  zip: "application/zip",
};

export function inferMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return (ext && EXTENSION_MIME_TYPES[ext]) || "application/octet-stream";
}

export async function deleteDriveFile(fileId: string, officeId: string, provider: StorageProvider): Promise<void> {
  switch (provider) {
    case "ONEDRIVE":
      await oneDriveStorage.deleteOneDriveFile(fileId, officeId);
      break;
    case "DROPBOX":
      await dropboxStorage.deleteDropboxFile(fileId, officeId);
      break;
    default:
      await googleDrive.deleteDriveFile(fileId, officeId);
  }
}

export async function renameDriveFolder(folderId: string, newName: string, officeId: string): Promise<void> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      await oneDriveStorage.renameOneDriveFolder(folderId, newName, officeId);
      break;
    case "DROPBOX":
      await dropboxStorage.renameDropboxFolder(folderId, newName, officeId);
      break;
    default:
      await googleDrive.renameDriveFolder(folderId, newName, officeId);
  }
}

export async function moveDriveFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      await oneDriveStorage.moveOneDriveFile(fileId, newParentId, officeId);
      break;
    case "DROPBOX":
      await dropboxStorage.moveDropboxFile(fileId, newParentId, officeId);
      break;
    default:
      await googleDrive.moveDriveFile(fileId, newParentId, officeId);
  }
}
