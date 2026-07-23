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
  anexos: { name: "Lúmen - Anexos", field: "folderId" as const },
  modelos: { name: "Lúmen - Modelos de Documento", field: "templatesFolderId" as const },
  gerados: { name: "Lúmen - Documentos Gerados", field: "generatedFolderId" as const },
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

// Conecta a conta Google "principal" DESTE escritório (Drive/Docs + opcionalmente Jusbrasil).
// Cada escritório tem a sua própria (isPrimaryDrive é único por officeId, não mais global) —
// esse é um dos pontos que era hardcoded pra um único escritório no sistema original.
export async function saveTokensFromCode(code: string, officeId: string) {
  const { accountEmail, refreshToken } = await exchangeCodeForTokens(code);

  // A mesma conta Google não pode virar a conta principal de dois escritórios diferentes —
  // accountEmail continua único GLOBALMENTE (ver schema). Se já pertence a OUTRO escritório,
  // recusa em vez de "roubar" a credencial silenciosamente.
  const existingByEmail = await prisma.googleCredential.findUnique({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Google já está conectada a outro escritório na plataforma.");
  }

  const existingPrimary = await prisma.googleCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (existingPrimary) {
    await prisma.googleCredential.update({
      where: { id: existingPrimary.id },
      data: { accountEmail, refreshToken },
    });
    return;
  }
  await prisma.googleCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, isPrimaryDrive: true, officeId },
    create: { accountEmail, refreshToken, isPrimaryDrive: true, officeId },
  });
}

// Conecta uma conta Google adicional só para leitura de e-mail (Jusbrasil),
// vinculada ao usuário logado que clicou em "conectar meu e-mail".
export async function saveJusbrasilTokensFromCode(code: string, userId: string, officeId: string) {
  const { accountEmail, refreshToken } = await exchangeCodeForTokens(code);

  const existingByEmail = await prisma.googleCredential.findUnique({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Google já está conectada a outro escritório na plataforma.");
  }

  await prisma.googleCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, syncJusbrasil: true, userId, officeId },
    create: { accountEmail, refreshToken, syncJusbrasil: true, userId, officeId },
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

export async function getDriveStatus(officeId: string): Promise<{ connected: boolean; accountEmail?: string }> {
  const cred = await prisma.googleCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (!cred) return { connected: false };
  return { connected: true, accountEmail: cred.accountEmail };
}

export async function listGoogleAccounts(officeId: string) {
  const creds = await prisma.googleCredential.findMany({
    where: { officeId },
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

async function getDriveClient(officeId: string) {
  const cred = await prisma.googleCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (!cred) throw new Error("Google Drive não conectado. Vá em Configurações e conecte a conta do Google do seu escritório.");
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: cred.refreshToken });
  return { drive: google.drive({ version: "v3", auth: client }), docs: google.docs({ version: "v1", auth: client }), cred };
}

async function getOrCreateFolderId(kind: keyof typeof FOLDERS, officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
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
  officeId: string,
  folder: keyof typeof FOLDERS = "anexos"
): Promise<{ id: string; webViewLink: string }> {
  const { drive } = await getDriveClient(officeId);
  const folderId = await getOrCreateFolderId(folder, officeId);
  return uploadBufferToFolder(drive, fileName, mimeType, buffer, folderId);
}

// Igual a uploadFileToDrive, mas envia para uma pasta específica do Drive (por id) em vez de
// uma das pastas fixas de FOLDERS — usado para subir arquivo direto na pasta de uma empresa em
// Assessoria (Assessoria.driveFolderId).
export async function uploadFileToDriveFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  const { drive } = await getDriveClient(officeId);
  return uploadBufferToFolder(drive, fileName, mimeType, buffer, folderId);
}

export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const WORD_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
];

// Upload específico para Modelos de Documento (Configurações → Modelos & Integrações): ao
// contrário de uploadFileToDrive (que preserva o formato original do arquivo, certo para
// anexos comuns), um MODELO de documento precisa ser um Google Docs nativo — é o único formato
// em que a Google Docs API consegue localizar e substituir os placeholders {{CHAVE}} na hora de
// gerar o documento (ver lib/actions/generateDocument.ts). Por isso: Word (.doc/.docx) é
// convertido automaticamente para Google Docs no upload; PDF é recusado (não tem como preencher
// campos automaticamente num PDF por essa via).
export async function uploadDocumentTemplateFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  if (mimeType === "application/pdf") {
    throw new Error(
      "Arquivos PDF não podem ser usados como modelo de documento — não há como preencher os dados automaticamente num PDF. Salve o modelo como arquivo do Word (.docx) e envie novamente, ou crie/edite-o direto no Google Docs e cole o link."
    );
  }

  const { drive } = await getDriveClient(officeId);
  const folderId = await getOrCreateFolderId("modelos", officeId);
  const isWord = WORD_MIME_TYPES.includes(mimeType);

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      // Presente APENAS quando é Word: dispara a conversão automática do Drive pra Google Docs.
      mimeType: isWord ? GOOGLE_DOC_MIME : undefined,
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao enviar arquivo para o Google Drive.");

  await drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" } });
  const file = await drive.files.get({ fileId, fields: "id, webViewLink" });
  if (!file.data.webViewLink) throw new Error("Arquivo enviado, mas o link não pôde ser obtido.");
  return { id: fileId, webViewLink: file.data.webViewLink };
}

// Confere se um link de Drive colado (fluxo "colar link já existente") aponta pra um Google Docs
// nativo — se não for, a geração de documento vai "funcionar" tecnicamente mas não vai preencher
// nada (a Docs API só localiza/substitui texto em Google Docs). Usado por createDocumentTemplateLink.
export async function isGoogleDocFile(fileId: string, officeId: string): Promise<boolean> {
  const { drive } = await getDriveClient(officeId);
  const file = await drive.files.get({ fileId, fields: "mimeType" });
  return file.data.mimeType === GOOGLE_DOC_MIME;
}

export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Copia um Google Docs modelo, substitui placeholders {{CHAVE}} pelos valores informados
// e devolve o link do novo documento preenchido (Google Docs + export em PDF), além de quantas
// substituições realmente aconteceram — `matchedCount === 0` sinaliza que o modelo provavelmente
// não tem nenhum placeholder {{...}} no texto (documento gerado, mas nada foi preenchido).
export async function copyAndFillTemplate(
  templateFileId: string,
  newName: string,
  replacements: Record<string, string>,
  officeId: string
): Promise<{ id: string; webViewLink: string; pdfUrl: string; matchedCount: number }> {
  const { drive, docs } = await getDriveClient(officeId);
  const folderId = await getOrCreateFolderId("gerados", officeId);

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

  let matchedCount = 0;
  if (requests.length > 0) {
    const result = await docs.documents.batchUpdate({ documentId: newFileId, requestBody: { requests } });
    matchedCount = (result.data.replies || []).reduce((sum, reply) => sum + (reply.replaceAllText?.occurrencesChanged || 0), 0);
  }

  await drive.permissions.create({
    fileId: newFileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  const file = await drive.files.get({ fileId: newFileId, fields: "id, webViewLink" });
  if (!file.data.webViewLink) throw new Error("Documento gerado, mas o link não pôde ser obtido.");
  const pdfUrl = `https://docs.google.com/document/d/${newFileId}/export?format=pdf`;
  return { id: newFileId, webViewLink: file.data.webViewLink, pdfUrl, matchedCount };
}

const ASSESSORIA_ROOT_NAME = "Lúmen - Assessoria";
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

async function getOrCreateRootFolder(drive: ReturnType<typeof google.drive>, rootName: string): Promise<string> {
  const res = await drive.files.list({
    q: `name='${rootName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: "files(id,name)",
  });
  let rootId = res.data.files?.[0]?.id;
  if (!rootId) {
    const created = await drive.files.create({
      requestBody: { name: rootName, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
    });
    rootId = created.data.id ?? undefined;
  }
  if (!rootId) throw new Error(`Não foi possível criar a pasta raiz "${rootName}" no Google Drive.`);
  return rootId;
}

// Cria (se ainda não existir) a estrutura de pastas de uma empresa em Assessoria:
// "Lúmen - Assessoria/{empresa}/{Contratos,Pareceres,Licitações,Regimentos Internos}", dentro
// do Drive DESTE escritório. Chamado uma única vez, na criação da Assessoria — o id da pasta da
// empresa fica salvo em Assessoria.driveFolderId para nunca precisar refazer essa busca depois.
export async function getOrCreateAssessoriaCompanyFolder(companyName: string, officeId: string): Promise<string> {
  const { drive } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, ASSESSORIA_ROOT_NAME);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  for (const subName of Object.values(ASSESSORIA_DOC_TYPE_FOLDERS)) {
    await findOrCreateChildFolder(drive, companyFolderId, subName);
  }
  return companyFolderId;
}

const PROCESSOS_ROOT_NAME = "Lúmen - Processos";
const ATENDIMENTOS_ROOT_NAME = "Lúmen - Atendimentos";

// Pasta própria de um processo no Drive ("Lúmen - Processos/{título}"), criada sob demanda no
// primeiro anexo — o id fica salvo em Case.driveFolderId pra nunca precisar refazer essa busca
// depois (mesmo padrão de Assessoria.driveFolderId). officeId garante que só se busca/atualiza
// um Case do PRÓPRIO escritório (evita que alguém force um caseId de outro tenant).
export async function getOrCreateCaseFolder(caseId: string, caseTitle: string, officeId: string): Promise<string> {
  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const { drive } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, PROCESSOS_ROOT_NAME);
  const folderId = await findOrCreateChildFolder(drive, rootId, caseTitle);
  await prisma.case.updateMany({ where: { id: caseId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Mesma ideia, para um Atendimento ("Lúmen - Atendimentos/{assunto}") — se o atendimento virar
// Processo depois, essa MESMA pasta é renomeada e transferida pro Case (ver
// convertAttendanceToCase em lib/actions/attendance.ts), nunca duplicada.
export async function getOrCreateAttendanceFolder(attendanceId: string, subject: string, officeId: string): Promise<string> {
  const existing = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const { drive } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, ATENDIMENTOS_ROOT_NAME);
  const folderId = await findOrCreateChildFolder(drive, rootId, subject);
  await prisma.attendance.updateMany({ where: { id: attendanceId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Subpasta de categoria dentro da pasta de um processo/atendimento (ex: "Petição",
// "Procuração" — ver lib/documentTypes.ts), criada só quando o primeiro documento daquele
// tipo é anexado — evita cada processo nascer com dezenas de subpastas vazias.
export async function getOrCreateCategoryFolder(parentFolderId: string, categoryLabel: string, officeId: string): Promise<string> {
  const { drive } = await getDriveClient(officeId);
  return findOrCreateChildFolder(drive, parentFolderId, categoryLabel);
}

export async function renameDriveFolder(folderId: string, newName: string, officeId: string): Promise<void> {
  const { drive } = await getDriveClient(officeId);
  await drive.files.update({ fileId: folderId, requestBody: { name: newName } });
}

// "Mover" um arquivo no Drive é trocar os pais (parents) — não existe operação de move direta.
// Usado pela reorganização de anexos já existentes (lib/actions/driveReorg.ts).
export async function moveDriveFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const { drive } = await getDriveClient(officeId);
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents || undefined,
    fields: "id, parents",
  });
}
