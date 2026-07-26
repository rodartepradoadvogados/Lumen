// Dispatcher fino de armazenamento de anexos — decide, por Office.storageProvider, se cada
// operação (upload/pasta/exclusão/renomeação/movimentação) vai para o Google Drive ou para o
// OneDrive deste escritório. Os 5 pontos de chamada que hoje importavam direto de
// lib/googleDrive.ts (lib/actions/attachments.ts, lib/actions/driveReorg.ts,
// lib/actions/assessoria.ts, lib/actions/attendance.ts,
// app/api/assessoria/documentos/upload/route.ts) passam a importar daqui — a lógica de negócio
// de cada um não muda, só o import.
//
// Default GOOGLE_DRIVE preserva o comportamento de todo escritório já existente sem nenhuma ação
// da parte deles — só passa a ser ONEDRIVE se o escritório escolher isso explicitamente em
// Configurações (ver lib/actions/settings.ts:setStorageProvider).
//
// NÃO cobre uploadDocumentTemplateFile/copyAndFillTemplate/isGoogleDocFile (preenchimento de
// modelo via Google Docs API, usado só por Peticionar) — esses continuam Google-only, importados
// direto de lib/googleDrive.ts, sem equivalente aqui.
import { prisma } from "@/lib/prisma";
import * as googleDrive from "@/lib/googleDrive";
import * as oneDriveStorage from "@/lib/oneDriveStorage";

export type StorageProvider = "GOOGLE_DRIVE" | "ONEDRIVE";

async function providerFor(officeId: string): Promise<StorageProvider> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } });
  return office?.storageProvider === "ONEDRIVE" ? "ONEDRIVE" : "GOOGLE_DRIVE";
}

export type UploadResult = { id: string; webViewLink: string; storageProvider: StorageProvider };

export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  officeId: string
): Promise<UploadResult> {
  const provider = await providerFor(officeId);
  const result =
    provider === "ONEDRIVE"
      ? await oneDriveStorage.uploadFileToOneDrive(fileName, mimeType, buffer, officeId)
      : await googleDrive.uploadFileToDrive(fileName, mimeType, buffer, officeId);
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
  const result =
    provider === "ONEDRIVE"
      ? await oneDriveStorage.uploadFileToOneDriveFolder(fileName, mimeType, buffer, folderId, officeId)
      : await googleDrive.uploadFileToDriveFolder(fileName, mimeType, buffer, folderId, officeId);
  return { ...result, storageProvider: provider };
}

export async function getOrCreateCaseFolder(caseId: string, caseTitle: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  return provider === "ONEDRIVE"
    ? oneDriveStorage.getOrCreateCaseFolder(caseId, caseTitle, officeId)
    : googleDrive.getOrCreateCaseFolder(caseId, caseTitle, officeId);
}

export async function getOrCreateAttendanceFolder(attendanceId: string, subject: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  return provider === "ONEDRIVE"
    ? oneDriveStorage.getOrCreateAttendanceFolder(attendanceId, subject, officeId)
    : googleDrive.getOrCreateAttendanceFolder(attendanceId, subject, officeId);
}

export async function getOrCreateCategoryFolder(parentFolderId: string, categoryLabel: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  return provider === "ONEDRIVE"
    ? oneDriveStorage.getOrCreateCategoryFolder(parentFolderId, categoryLabel, officeId)
    : googleDrive.getOrCreateCategoryFolder(parentFolderId, categoryLabel, officeId);
}

export async function getOrCreateAssessoriaCompanyFolder(companyName: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  return provider === "ONEDRIVE"
    ? oneDriveStorage.getOrCreateAssessoriaCompanyFolder(companyName, officeId)
    : googleDrive.getOrCreateAssessoriaCompanyFolder(companyName, officeId);
}

// Diferente das demais funções deste dispatcher, recebe o provider EXPLICITAMENTE em vez de
// resolvê-lo por Office.storageProvider — quem chama (lib/actions/attachments.ts:deleteAttachment)
// já sabe qual provedor foi usado no upload original (Attachment.storageProvider), gravado no
// momento do upload. Isso importa porque um escritório pode trocar de provedor DEPOIS de já ter
// anexos no outro — apagar teria que continuar indo pro provedor correto de cada arquivo, não pro
// provedor atual do escritório.
export async function deleteDriveFile(fileId: string, officeId: string, provider: StorageProvider): Promise<void> {
  if (provider === "ONEDRIVE") {
    await oneDriveStorage.deleteOneDriveFile(fileId, officeId);
  } else {
    await googleDrive.deleteDriveFile(fileId, officeId);
  }
}

export async function renameDriveFolder(folderId: string, newName: string, officeId: string): Promise<void> {
  const provider = await providerFor(officeId);
  if (provider === "ONEDRIVE") {
    await oneDriveStorage.renameOneDriveFolder(folderId, newName, officeId);
  } else {
    await googleDrive.renameDriveFolder(folderId, newName, officeId);
  }
}

export async function moveDriveFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const provider = await providerFor(officeId);
  if (provider === "ONEDRIVE") {
    await oneDriveStorage.moveOneDriveFile(fileId, newParentId, officeId);
  } else {
    await googleDrive.moveDriveFile(fileId, newParentId, officeId);
  }
}
