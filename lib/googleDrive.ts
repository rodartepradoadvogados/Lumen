import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
  // drive.readonly: leitura de pastas pré-existentes no Drive (ex: futura pasta de doutrina jurídica)
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  // gmail.send: permite responder o cliente por e-mail de dentro do Atendimento, usando a própria conta do advogado
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

const FOLDERS = {
  anexos: { name: "RP Financeiro - Anexos", field: "folderId" as const },
  modelos: { name: "RP Financeiro - Modelos de Documento", field: "templatesFolderId" as const },
  gerados: { name: "RP Financeiro - Documentos Gerados", field: "generatedFolderId" as const },
};

export function getOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(state?: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

// Conecta a conta Google "principal" do escritório (Drive/Docs + opcionalmente
// Jusbrasil). Continua sendo só uma — é a que guarda as pastas de anexos/modelos.
export async function saveTokensFromCode(code: string) {
  const { accountEmail, refreshToken } = await exchangeCodeForTokens(code);
  const existing = await prisma.googleCredential.findFirst({ where: { isPrimaryDrive: true } });
  if (existing) {
    await prisma.googleCredential.update({
      where: { id: existing.id },
      data: { accountEmail, refreshToken },
    });
    return;
  }
  await prisma.googleCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, isPrimaryDrive: true },
    create: { accountEmail, refreshToken, isPrimaryDrive: true },
  });
}

// Conecta uma conta Google adicional só para leitura de e-mail (Jusbrasil),
// vinculada ao usuário logado que clicou em "conectar meu e-mail".
export async function saveJusbrasilTokensFromCode(code: string, userId: string) {
  const { accountEmail, refreshToken } = await exchangeCodeForTokens(code);
  await prisma.googleCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, syncJusbrasil: true, userId },
    create: { accountEmail, refreshToken, syncJusbrasil: true, userId },
  });
}

async function exchangeCodeForTokens(code: string): Promise<{ accountEmail: string; refreshToken: string }> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "O Google não retornou um refresh_token (isso acontece se a conta já havia autorizado antes). Revogue o acesso em https://myaccount.google.com/permissions e tente conectar novamente."
    );
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Não foi possível obter o e-mail da conta Google.");
  return { accountEmail: data.email, refreshToken: tokens.refresh_token };
}

export async function getDriveStatus(): Promise<{ connected: boolean; accountEmail?: string }> {
  const cred = await prisma.googleCredential.findFirst({ where: { isPrimaryDrive: true } });
  if (!cred) return { connected: false };
  return { connected: true, accountEmail: cred.accountEmail };
}

export async function listGoogleAccounts() {
  const creds = await prisma.googleCredential.findMany({
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
  return creds.map((c) => ({
    id: c.id,
    accountEmail: c.accountEmail,
    isPrimaryDrive: c.isPrimaryDrive,
    syncJusbrasil: c.syncJusbrasil,
    userId: c.userId,
    ownerName: c.user?.name ?? null,
  }));
}

async function getDriveClient() {
  const cred = await prisma.googleCredential.findFirst({ where: { isPrimaryDrive: true } });
  if (!cred) throw new Error("Google Drive não conectado. Vá em Configurações e conecte a conta do Google.");
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: cred.refreshToken });
  return { drive: google.drive({ version: "v3", auth: client }), docs: google.docs({ version: "v1", auth: client }), cred };
}

async function getOrCreateFolderId(kind: keyof typeof FOLDERS): Promise<string> {
  const { drive, cred } = await getDriveClient();
  const { name, field } = FOLDERS[kind];
  const existingId = cred[field];
  if (existingId) return existingId;

  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
  });
  let folderId = res.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    folderId = created.data.id ?? undefined;
  }
  if (!folderId) throw new Error("Não foi possível criar a pasta no Google Drive.");
  await prisma.googleCredential.update({ where: { id: cred.id }, data: { [field]: folderId } });
  return folderId;
}

async function uploadBufferToFolder(
  drive: Awaited<ReturnType<typeof getDriveClient>>["drive"],
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string
): Promise<{ id: string; webViewLink: string }> {
  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao enviar arquivo para o Google Drive.");

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  const file = await drive.files.get({ fileId, fields: "id, webViewLink" });
  if (!file.data.webViewLink) throw new Error("Arquivo enviado, mas o link não pôde ser obtido.");
  return { id: fileId, webViewLink: file.data.webViewLink };
}

export async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folder: keyof typeof FOLDERS = "anexos"
): Promise<{ id: string; webViewLink: string }> {
  const { drive } = await getDriveClient();
  const folderId = await getOrCreateFolderId(folder);
  return uploadBufferToFolder(drive, fileName, mimeType, buffer, folderId);
}

// Igual a uploadFileToDrive, mas envia para uma pasta específica do Drive (por id) em vez de
// uma das pastas fixas de FOLDERS — usado para subir arquivo direto na pasta de uma empresa em
// Assessoria (Assessoria.driveFolderId).
export async function uploadFileToDriveFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string
): Promise<{ id: string; webViewLink: string }> {
  const { drive } = await getDriveClient();
  return uploadBufferToFolder(drive, fileName, mimeType, buffer, folderId);
}

export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Copia um Google Docs modelo, substitui placeholders {{CHAVE}} pelos valores informados
// e devolve o link do novo documento preenchido.
export async function copyAndFillTemplate(
  templateFileId: string,
  newName: string,
  replacements: Record<string, string>
): Promise<{ id: string; webViewLink: string }> {
  const { drive, docs } = await getDriveClient();
  const folderId = await getOrCreateFolderId("gerados");

  const copied = await drive.files.copy({
    fileId: templateFileId,
    requestBody: { name: newName, parents: [folderId] },
    fields: "id",
  });
  const newFileId = copied.data.id;
  if (!newFileId) throw new Error("Não foi possível copiar o modelo.");

  const requests = Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: false },
      replaceText: value || "",
    },
  }));

  if (requests.length > 0) {
    await docs.documents.batchUpdate({ documentId: newFileId, requestBody: { requests } });
  }

  await drive.permissions.create({
    fileId: newFileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  const file = await drive.files.get({ fileId: newFileId, fields: "id, webViewLink" });
  if (!file.data.webViewLink) throw new Error("Documento gerado, mas o link não pôde ser obtido.");
  return { id: newFileId, webViewLink: file.data.webViewLink };
}

const ASSESSORIA_ROOT_NAME = "RP Financeiro - Assessoria";
// Mapeia cada tipo de documento do catálogo da Assessoria (ver prisma/schema.prisma,
// AssessoriaDocumento.docType) para o nome da subpasta correspondente — ACAO_VINCULADA e
// OUTRO não têm pasta própria (a primeira já vive em Processos; a segunda cai na raiz da
// empresa mesmo).
const ASSESSORIA_DOC_TYPE_FOLDERS: Record<string, string> = {
  CONTRATO: "Contratos",
  PARECER: "Pareceres",
  LICITACAO: "Licitações",
  REGIMENTO_INTERNO: "Regimentos Internos",
};

async function findOrCreateChildFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id,name)",
  });
  let id = res.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
    });
    id = created.data.id ?? undefined;
  }
  if (!id) throw new Error(`Não foi possível criar a pasta "${name}" no Google Drive.`);
  return id;
}

// Cria (se ainda não existir) a estrutura de pastas de uma empresa em Assessoria:
// "RP Financeiro - Assessoria/{empresa}/{Contratos,Pareceres,Licitações,Regimentos Internos}".
// Chamado uma única vez, na criação da Assessoria — o id da pasta da empresa fica salvo em
// Assessoria.driveFolderId para nunca precisar refazer essa busca depois.
export async function getOrCreateAssessoriaCompanyFolder(companyName: string): Promise<string> {
  const { drive } = await getDriveClient();

  const rootRes = await drive.files.list({
    q: `name='${ASSESSORIA_ROOT_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: "files(id,name)",
  });
  let rootId = rootRes.data.files?.[0]?.id;
  if (!rootId) {
    const created = await drive.files.create({
      requestBody: { name: ASSESSORIA_ROOT_NAME, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    rootId = created.data.id ?? undefined;
  }
  if (!rootId) throw new Error("Não foi possível criar a pasta raiz de Assessoria no Google Drive.");

  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  for (const subName of Object.values(ASSESSORIA_DOC_TYPE_FOLDERS)) {
    await findOrCreateChildFolder(drive, companyFolderId, subName);
  }
  return companyFolderId;
}
