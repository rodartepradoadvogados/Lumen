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

// Pasta de um Parecer (Assessoria/{empresa}/Pareceres/{nome do parecer}) — ver model Parecer.
export async function getOrCreateParecerFolder(parecerId: string, companyName: string, parecerName: string, officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.getOrCreateParecerFolder(parecerId, companyName, parecerName, officeId);
    case "DROPBOX":
      return dropboxStorage.getOrCreateParecerFolder(parecerId, companyName, parecerName, officeId);
    default:
      return googleDrive.getOrCreateParecerFolder(parecerId, companyName, parecerName, officeId);
  }
}

// Raiz "Lúmen - Financeiro - Despesas"/"Lúmen - Financeiro - Receitas" — comprovante de
// pagamento/recebimento (Payable/Receivable). Ver lib/financeReceiptNaming.ts para o nome do
// arquivo dentro dela; a pasta em si é flat, sem subpasta por conta.
export async function getFinanceReceiptsFolderId(kind: "PAYABLE" | "RECEIVABLE", officeId: string): Promise<string> {
  const provider = await providerFor(officeId);
  const impl = provider === "ONEDRIVE" ? oneDriveStorage : provider === "DROPBOX" ? dropboxStorage : googleDrive;
  return kind === "PAYABLE" ? impl.getFinanceDespesasRootFolderId(officeId) : impl.getFinanceReceitasRootFolderId(officeId);
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

// Alias de renameDriveFolder acima — nos três provedores, renomear é um PATCH/move genérico do
// item pelo id (Google files.update, OneDrive PATCH /items/{id}, Dropbox move_v2 para o mesmo
// pai com nome novo — ver as implementações "*renomear pasta*" em cada arquivo de provedor), sem
// distinção real entre arquivo e pasta. Existe como nome próprio só para não confundir quem lê
// uma chamada como "renameDriveFolder(receiptFileId, ...)" — é o comprovante (arquivo) do
// Financeiro sendo renomeado quando descrição/fornecedor/data de pagamento mudam (ver
// lib/actions/financeiro.ts), não uma pasta.
export const renameDriveFile = renameDriveFolder;

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

// Cria uma subpasta com nome exato dentro de outra pasta (por id), a pedido do usuário — nunca
// reaproveita uma homônima já existente (ao contrário de getOrCreateCategoryFolder acima). Usado
// por lib/actions/driveFolders.ts (criar pasta a pedido em processo/caso). Ver
// createNamedDriveFolder em lib/googleDrive.ts para o equivalente Google (reaproveitado aqui, não
// duplicado) e createNamedFolder em lib/oneDriveStorage.ts/lib/dropboxStorage.ts para os outros
// dois provedores.
export async function createNamedFolder(parentFolderId: string, name: string, officeId: string): Promise<{ id: string }> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE":
      return oneDriveStorage.createNamedFolder(parentFolderId, name, officeId);
    case "DROPBOX":
      return dropboxStorage.createNamedFolder(parentFolderId, name, officeId);
    default: {
      const id = await googleDrive.createNamedDriveFolder(parentFolderId, name, officeId);
      return { id };
    }
  }
}

// ============ STATUS DE CONEXÃO (agnóstico de provedor) ============
// Google, OneDrive e Dropbox cada um tem seu próprio getStatus (accountEmail + connected) — esta
// função escolhe o certo pelo provedor DESTE escritório e devolve um formato único. Existe porque
// a área de arrastar do produto inteiro hoje é liberada por `driveConnected`, que é sempre
// `getDriveStatus(...).connected` — específico do Google (ver lib/googleDrive.ts) — então um
// escritório em OneDrive/Dropbox nunca vê onde soltar arquivo, mesmo com a conta perfeitamente
// conectada. As páginas que hoje calculam `driveConnected` não são posse desta entrega (ver
// relatório para a lista exata de arquivos de UI que precisam trocar a chamada por esta aqui) —
// esta função só fica pronta, tipada, esperando a troca.
export type StorageConnectionStatus = { connected: boolean; provider: StorageProvider; accountEmail?: string; message?: string };

export async function getStorageConnectionStatus(officeId: string): Promise<StorageConnectionStatus> {
  const provider = await providerFor(officeId);
  switch (provider) {
    case "ONEDRIVE": {
      const s = await oneDriveStorage.getOneDriveStatus(officeId);
      return { connected: s.connected, provider, accountEmail: s.accountEmail };
    }
    case "DROPBOX": {
      const s = await dropboxStorage.getDropboxStatus(officeId);
      return { connected: s.connected, provider, accountEmail: s.accountEmail };
    }
    default: {
      // getDriveStatus valida de verdade (renova o token, confere escopo — ver lib/googleDrive.ts)
      // em vez de só checar se existe linha no banco.
      const s = await googleDrive.getDriveStatus(officeId);
      return { connected: s.connected, provider, accountEmail: s.accountEmail, message: s.message };
    }
  }
}

// Atalho booleano pro caso comum (gate de UI: mostra ou esconde a área de arrastar).
export async function isStorageConnected(officeId: string): Promise<boolean> {
  return (await getStorageConnectionStatus(officeId)).connected;
}
