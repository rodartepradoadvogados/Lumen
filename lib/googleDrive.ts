import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"];
const FOLDER_NAME = "RP Financeiro - Anexos";

function getOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function saveTokensFromCode(code: string) {
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

  const existing = await prisma.googleCredential.findFirst();
  if (existing) {
    await prisma.googleCredential.update({
      where: { id: existing.id },
      data: { accountEmail: data.email || "", refreshToken: tokens.refresh_token },
    });
  } else {
    await prisma.googleCredential.create({
      data: { accountEmail: data.email || "", refreshToken: tokens.refresh_token },
    });
  }
}

export async function getDriveStatus(): Promise<{ connected: boolean; accountEmail?: string }> {
  const cred = await prisma.googleCredential.findFirst();
  if (!cred) return { connected: false };
  return { connected: true, accountEmail: cred.accountEmail };
}

async function getDriveClient() {
  const cred = await prisma.googleCredential.findFirst();
  if (!cred) throw new Error("Google Drive não conectado. Vá em Configurações e conecte a conta do Google.");
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: cred.refreshToken });
  return { drive: google.drive({ version: "v3", auth: client }), cred };
}

async function getOrCreateFolderId(): Promise<string> {
  const { drive, cred } = await getDriveClient();
  if (cred.folderId) return cred.folderId;

  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
  });
  let folderId = res.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    folderId = created.data.id ?? undefined;
  }
  if (!folderId) throw new Error("Não foi possível criar a pasta no Google Drive.");
  await prisma.googleCredential.update({ where: { id: cred.id }, data: { folderId } });
  return folderId;
}

export async function uploadFileToDrive(fileName: string, mimeType: string, buffer: Buffer): Promise<{ id: string; webViewLink: string }> {
  const { drive } = await getDriveClient();
  const folderId = await getOrCreateFolderId();

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
