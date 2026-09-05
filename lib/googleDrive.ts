import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { PROTOCOLOS_FOLDER_NAME } from "@/lib/protocolos";
import { naturezaOf } from "@/lib/caseNatureza";
import { type RaizKey } from "@/lib/driveNaming";
import { nomeacaoDoEscritorio } from "@/lib/driveNamingOffice";

// "drive" (acesso completo), não "drive.file" + "drive.readonly" como antes: drive.file só
// permite ESCREVER (mover, renomear, mandar pra Lixeira) em arquivos que o próprio app criou via
// API — qualquer pasta que já existia antes do Lúmen (ou criada manualmente no Drive) fica de
// fora, mesmo sendo dona a mesma conta que autorizou o app. Isso ficou visível na migração de
// pastas legadas (lib/actions/driveFolderMigration.ts): a LEITURA sempre funcionou (drive.readonly
// enxerga o Drive inteiro), mas mover/trashar a pasta antiga falhava com "the user has not
// granted the app write access to the file" — porque essas pastas nunca foram criadas pela API do
// Lúmen. "drive" cobre leitura e escrita em qualquer arquivo do Drive conectado, sem essa
// restrição. Escritórios que conectaram o Google antes desta mudança precisam reconectar em
// Configurações pra que o novo escopo passe a valer (o consentimento antigo, mais restrito,
// continua ativo até então).
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/gmail.readonly",
  // gmail.send: permite responder o cliente por e-mail de dentro do Atendimento, usando a própria conta do advogado
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

// O NOME de cada pasta vem da configuração do escritório (lib/driveNaming.ts); aqui fica só a
// ligação entre a raiz e o campo da credencial onde o id dela é cacheado.
const FOLDERS = {
  anexos: { raiz: "anexos" as RaizKey, field: "folderId" as const },
  modelos: { raiz: "modelos" as RaizKey, field: "templatesFolderId" as const },
  gerados: { raiz: "gerados" as RaizKey, field: "generatedFolderId" as const },
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
    // Reconectar com uma conta Google DIFERENTE da que já era a principal: os ids de pasta salvos
    // (rootFolderId/folderId/templatesFolderId/generatedFolderId) pertencem à conta ANTIGA — sem
    // zerá-los aqui, todo upload subsequente tentaria escrever em pastas que a conta nova nunca
    // teve acesso (404/403 dentro de uploadFileToDrive etc., silencioso pra quem só vê "conectado"
    // em Configurações). Reconectar com a MESMA conta (accountEmail igual — ex.: renovar consentimento
    // depois que o token expirou) não precisa zerar nada: as pastas continuam sendo as mesmas.
    const trocouDeConta = existingPrimary.accountEmail !== accountEmail;
    await prisma.googleCredential.update({
      where: { id: existingPrimary.id },
      data: {
        accountEmail,
        refreshToken,
        ...(trocouDeConta ? { rootFolderId: null, folderId: null, templatesFolderId: null, generatedFolderId: null } : {}),
      },
    });
    return;
  }
  await prisma.googleCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, isPrimaryDrive: true, officeId },
    create: { accountEmail, refreshToken, isPrimaryDrive: true, officeId },
  });
}

// Conecta uma conta Google adicional só para leitura de e-mail (Jusbrasil) — `userId` presente
// é a conexão PESSOAL de um advogado (vinculada a quem clicou em "conectar meu e-mail" em Meu
// Perfil); `userId` nulo é uma caixa COMPARTILHADA que só o admin do escritório conecta (Conexões
// → Arquivos → Google Drive, botão "Adicionar e-mail" — ver app/api/google/callback/route.ts,
// mode "jusbrasil-shared").
export async function saveJusbrasilTokensFromCode(code: string, userId: string | null, officeId: string) {
  const { accountEmail, refreshToken } = await exchangeCodeForTokens(code);

  const existingByEmail = await prisma.googleCredential.findUnique({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Google já está conectada a outro escritório na plataforma.");
  }

  // Um único e-mail por advogado: reconectar com uma conta DIFERENTE da que já estava vinculada
  // a este usuário substitui a antiga (a mesma conta apenas renova o token, via upsert abaixo,
  // sem passar por aqui). Sem isso, o advogado acumularia uma linha por conta que já tentou usar.
  if (userId) {
    const existingOwn = await prisma.googleCredential.findFirst({ where: { userId, officeId } });
    if (existingOwn && existingOwn.accountEmail !== accountEmail) {
      await prisma.googleCredential.delete({ where: { id: existingOwn.id } });
    }
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

// ============ TRADUÇÃO DE ERROS DO GOOGLE (mensagens em pt-BR) ============
// Todo erro que sobe de uma chamada à API do Google (token revogado, escopo insuficiente,
// arquivo/pasta apagados, sem permissão) precisa virar uma mensagem que o advogado entende e
// consegue agir em cima — sem isso, só aparece "Erro ao enviar arquivo." na tela, mesmo quando a
// causa é conhecida e tem correção óbvia (reconectar a conta). Mesmo padrão que
// lib/actions/generateDocument.ts e lib/actions/peticionar.ts já usam (regex sobre a mensagem
// crua) — replicado aqui, exportado, para as rotas de upload usarem (ver
// app/api/assessoria/documentos/upload/route.ts e lib/actions/attachments.ts:finalizeAttachmentUpload).
function errorStatus(e: unknown): number | undefined {
  const err = e as { code?: number | string; response?: { status?: number } };
  const code = typeof err?.code === "number" ? err.code : undefined;
  return code ?? err?.response?.status;
}

function errorBodyText(e: unknown): string {
  const err = e as { message?: string; response?: { data?: unknown } };
  let dataText = "";
  try {
    dataText = JSON.stringify(err?.response?.data ?? "");
  } catch {
    dataText = "";
  }
  return `${err?.message ?? ""} ${dataText}`;
}

// Detecta, a partir de um erro 403 já capturado de uma chamada real à API do Drive, se a causa é
// ESCOPO insuficiente (token antigo, conectado antes de SCOPES pedir "drive" completo — ver
// comentário no topo deste arquivo) — diferente de um 403 de permissão comum (arquivo de outra
// conta, sem compartilhamento). Complementa a checagem PROATIVA de getDriveStatus (via
// tokeninfo, antes de qualquer upload) com uma checagem REATIVA, para o caso de um upload
// específico falhar por escopo mesmo com getDriveStatus tendo dado "conectado" momentos antes
// (ex.: token trocado de escopo entre a checagem e o upload, caso raro mas possível).
export function isInsufficientScopeError(e: unknown): boolean {
  if (errorStatus(e) !== 403) return false;
  return /insufficient.*(scope|permission)|insufficientPermissions|insufficient_scope/i.test(errorBodyText(e));
}

function isInvalidGrantError(e: unknown): boolean {
  return /invalid_grant|invalid_request/i.test(errorBodyText(e));
}

function isNotFoundError(e: unknown): boolean {
  return errorStatus(e) === 404 || /file not found/i.test(errorBodyText(e));
}

function isPermissionError(e: unknown): boolean {
  return errorStatus(e) === 403;
}

// Mensagem final, pronta pra tela — usada pelas rotas/actions de upload deste arquivo em diante.
// `context` é o texto livre que descreve O QUE estava sendo feito (ex.: "enviar o documento para
// o Google Drive"), pra a frase final ficar específica em vez de genérica. Sempre deixa explícito
// que o documento NÃO subiu (nunca "subiu com problema") — ver lib/actions/attachments.ts e
// app/api/assessoria/documentos/upload/route.ts, que garantem (por causa desta mensagem) que
// nenhum registro é criado pela metade quando isto acontece.
export function translateDriveError(e: unknown, context = "acessar o Google Drive"): string {
  if (isInvalidGrantError(e)) {
    return `Não foi possível ${context}: a conexão com a conta Google expirou ou foi revogada. Peça a um administrador para reconectar em Conexões. Enquanto isso, o documento não sobe para o Drive.`;
  }
  if (isInsufficientScopeError(e)) {
    return `Não foi possível ${context}: a conta Google conectada não tem permissão suficiente no Drive (foi conectada antes da liberação de acesso completo). Peça a um administrador para reconectar em Conexões. Enquanto isso, o documento não sobe para o Drive.`;
  }
  if (isNotFoundError(e)) {
    // Sem citar "Google" aqui de propósito — esta função também traduz erro devolvido por
    // uploadFileToDrive/uploadFileToDriveFolder de lib/storageProvider.ts, que despacha pro
    // OneDrive/Dropbox conforme o provedor do escritório (ver lib/storageProvider.ts); só
    // invalid_grant/escopo acima são exclusivos do OAuth do Google.
    return `Não foi possível ${context}: a pasta ou o arquivo não foi encontrado (pode ter sido apagado ou movido manualmente fora do sistema). Avise um administrador.`;
  }
  if (isPermissionError(e)) {
    return `Não foi possível ${context}: a conta conectada não tem permissão sobre esta pasta/arquivo.`;
  }
  const raw = e instanceof Error ? e.message : "";
  return raw ? `Não foi possível ${context}: ${raw}` : `Não foi possível ${context}.`;
}

export type DriveConnectionState = "DESCONECTADO" | "CONECTADO" | "TOKEN_INVALIDO" | "ESCOPO_INSUFICIENTE";

// Valida de verdade a conexão (não só "existe uma linha no banco"): tenta renovar o access token a
// partir do refresh_token salvo e, se conseguir, confere junto ao próprio Google quais escopos
// esse token carrega — contas conectadas ANTES de SCOPES pedir "drive" completo (ver comentário no
// topo deste arquivo) continuam com um refresh_token válido, porém restrito, até reconectar.
// `connected` só é true no estado plenamente utilizável (CONECTADO) — mantém compatibilidade com
// todo `driveStatus.connected` já em uso nas páginas que consomem esta função (fora da posse desta
// entrega — ver relatório), só fica mais rigoroso: antes virava true só por existir a linha no
// banco, mesmo com o token morto.
export async function getDriveStatus(officeId: string): Promise<{
  connected: boolean;
  accountEmail?: string;
  state: DriveConnectionState;
  message?: string;
}> {
  const cred = await prisma.googleCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (!cred) return { connected: false, state: "DESCONECTADO" };

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: cred.refreshToken });

  let accessToken: string | null | undefined;
  try {
    const tokenResponse = await client.getAccessToken();
    accessToken = tokenResponse.token;
  } catch {
    return {
      connected: false,
      accountEmail: cred.accountEmail,
      state: "TOKEN_INVALIDO",
      message: `A conexão com a conta Google (${cred.accountEmail}) expirou ou foi revogada. Reconecte em Conexões.`,
    };
  }
  if (!accessToken) {
    return {
      connected: false,
      accountEmail: cred.accountEmail,
      state: "TOKEN_INVALIDO",
      message: `Não foi possível renovar o acesso à conta Google (${cred.accountEmail}). Reconecte em Conexões.`,
    };
  }

  // Checagem de escopo é best-effort: se o endpoint de tokeninfo do Google não responder (rede,
  // instabilidade), não trava o escritório num falso "escopo insuficiente" — trata como conectado
  // (o token em si já provou ser válido acima; o pior caso é só descobrir a falta de escopo na
  // hora real do upload, que translateDriveError/isInsufficientScopeError também cobrem).
  try {
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { scope?: string };
      const scopes = (info.scope ?? "").split(" ");
      if (!scopes.includes("https://www.googleapis.com/auth/drive")) {
        return {
          connected: false,
          accountEmail: cred.accountEmail,
          state: "ESCOPO_INSUFICIENTE",
          message: `A conta Google (${cred.accountEmail}) foi conectada com um nível de acesso mais restrito ao Drive. Reconecte em Conexões para liberar o acesso completo.`,
        };
      }
    }
  } catch {
    // segue como conectado — ver comentário acima
  }

  return { connected: true, accountEmail: cred.accountEmail, state: "CONECTADO" };
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

// Pasta-mãe que passa a conter TODAS as raízes do sistema (Processos, Casos, Atendimentos,
// Assessoria, Anexos, Modelos, Documentos Gerados, Financeiro-Despesas, Financeiro-Receitas) —
// mesmo desenho que OneDrive/Dropbox já usam (rootFolderId cacheado na credencial de
// armazenamento, ver lib/oneDriveStorage.ts/lib/dropboxStorage.ts). Antes desta entrega, cada uma
// das nove raízes nascia solta direto em 'root' — ver lib/actions/driveParentMigration.ts para a
// ação que move o que já existia pra dentro desta pasta-mãe (com etapa de conferência antes de
// mexer em qualquer coisa).
async function getOrCreateLumenParentFolder(
  drive: ReturnType<typeof google.drive>,
  cred: { id: string; rootFolderId: string | null },
  officeId: string
): Promise<string> {
  // Auto-cura (correção de 05/09/2026, docs/auditoria-pastas-drive-2026-09.md, achado P2): antes,
  // um id cacheado aqui nunca era revalidado — se a pasta-mãe fosse apagada/mandada pra Lixeira
  // manualmente fora do sistema, TODO upload do escritório inteiro (tudo vive dentro dela) parava
  // de funcionar (ou ia parar num lugar órfão) pra sempre, sem nenhum jeito de se corrigir
  // sozinho. Mesmo padrão best-effort de getOrCreateParecerFolder: se a própria checagem falhar
  // (Drive momentaneamente inacessível), devolve o id salvo como antes desta mudança.
  if (cred.rootFolderId) {
    try {
      const info = await getDriveFileInfo(cred.rootFolderId, officeId);
      if (info && !info.trashed) return cred.rootFolderId;
    } catch {
      return cred.rootFolderId;
    }
  }

  const { pastaMae } = await nomeacaoDoEscritorio(officeId);
  const res = await drive.files.list({
    q: `name='${pastaMae}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let parentId = res.data.files?.[0]?.id;
  if (!parentId) {
    const created = await drive.files.create({
      requestBody: { name: pastaMae, mimeType: "application/vnd.google-apps.folder" },
      fields: "id",
      supportsAllDrives: true,
    });
    parentId = created.data.id ?? undefined;
  }
  if (!parentId) throw new Error(`Não foi possível criar a pasta-mãe "${pastaMae}" no Google Drive.`);
  await prisma.googleCredential.update({ where: { id: cred.id }, data: { rootFolderId: parentId } });
  return parentId;
}

async function getOrCreateFolderId(kind: keyof typeof FOLDERS, officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  const { raiz, field } = FOLDERS[kind];
  const name = (await nomeacaoDoEscritorio(officeId)).raizes[raiz];
  const existingId = cred[field];
  // Auto-cura — mesmo raciocínio de getOrCreateLumenParentFolder acima.
  if (existingId) {
    try {
      const info = await getDriveFileInfo(existingId, officeId);
      if (info && !info.trashed) return existingId;
    } catch {
      return existingId;
    }
  }

  // Dentro da pasta-mãe do escritório (ver getOrCreateLumenParentFolder), não mais solta em qualquer
  // lugar do Drive — a busca antiga não filtrava nem por pasta-mãe nem por 'root', então uma
  // pasta homônima criada por acidente em qualquer lugar do Drive conectado seria "encontrada" e
  // reaproveitada por engano.
  const parentId = await getOrCreateLumenParentFolder(drive, cred, officeId);
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let folderId = res.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
    });
    folderId = created.data.id ?? undefined;
  }
  if (!folderId) throw new Error("Não foi possível criar a pasta no Google Drive.");
  await prisma.googleCredential.update({ where: { id: cred.id }, data: { [field]: folderId } });
  return folderId;
}

// Ids das três raízes "flat" do sistema (sem entidade dona — Anexo solto, Modelos de Documento,
// Documentos Gerados) — exportados para lib/actions/driveParentMigration.ts mover pra lá um
// arquivo legado que não tem NENHUM registro no banco para casar (ex.: documento gerado pelo
// Peticionar, que nunca vira Attachment — ver docs/auditoria-pastas-drive-2026-09.md).
export async function getAnexosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateFolderId("anexos", officeId);
}

export async function getModelosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateFolderId("modelos", officeId);
}

export async function getGeradosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateFolderId("gerados", officeId);
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
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao enviar arquivo para o Google Drive.");

  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  const file = await drive.files.get({ fileId, fields: "id, webViewLink", supportsAllDrives: true });
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

// Upload específico para Modelos de Documento (Configurações → Geral): ao
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
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error("Falha ao enviar arquivo para o Google Drive.");

  await drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" }, supportsAllDrives: true });
  const file = await drive.files.get({ fileId, fields: "id, webViewLink", supportsAllDrives: true });
  if (!file.data.webViewLink) throw new Error("Arquivo enviado, mas o link não pôde ser obtido.");
  return { id: fileId, webViewLink: file.data.webViewLink };
}

// Confere se um link de Drive colado (fluxo "colar link já existente") aponta pra um Google Docs
// nativo — se não for, a geração de documento vai "funcionar" tecnicamente mas não vai preencher
// nada (a Docs API só localiza/substitui texto em Google Docs). Usado por createDocumentTemplateLink.
export async function isGoogleDocFile(fileId: string, officeId: string): Promise<boolean> {
  const { drive } = await getDriveClient(officeId);
  const file = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
  return file.data.mimeType === GOOGLE_DOC_MIME;
}

export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Baixa o conteúdo real de um arquivo do Drive — usado pelo envio de documentos por e-mail com
// anexo de verdade (ver lib/actions/documentoEnvios.ts:enviarDocumentosPorEmail via o roteador
// lib/storageProvider.ts:downloadDriveFile). Documento nativo do Google (Docs/Planilhas/
// Apresentações) não tem conteúdo binário para baixar direto (a API recusa alt=media nesses
// casos) — só o caso real hoje (documento gerado a partir de modelo, ver
// lib/actions/generateDocument.ts) é tratado, via export para PDF; Planilha/Apresentação nativa
// lança um erro claro em vez de tentar (não existe hoje nenhum fluxo que gere esses tipos como
// Attachment).
export async function downloadFileFromDrive(fileId: string, officeId: string): Promise<{ content: Buffer; mimeType: string }> {
  const { drive } = await getDriveClient(officeId);
  const meta = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
  const mimeType = meta.data.mimeType || "application/octet-stream";

  if (mimeType.startsWith("application/vnd.google-apps.")) {
    if (mimeType !== GOOGLE_DOC_MIME) {
      throw new Error("Este documento é um arquivo nativo do Google (Planilha/Apresentação) e não pode ser baixado como anexo de e-mail.");
    }
    const exported = await drive.files.export({ fileId, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
    return { content: Buffer.from(exported.data as ArrayBuffer), mimeType: "application/pdf" };
  }

  const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return { content: Buffer.from(res.data as ArrayBuffer), mimeType };
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
    supportsAllDrives: true,
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
    supportsAllDrives: true,
  });

  const file = await drive.files.get({ fileId: newFileId, fields: "id, webViewLink", supportsAllDrives: true });
  if (!file.data.webViewLink) throw new Error("Documento gerado, mas o link não pôde ser obtido.");
  const pdfUrl = `https://docs.google.com/document/d/${newFileId}/export?format=pdf`;
  return { id: newFileId, webViewLink: file.data.webViewLink, pdfUrl, matchedCount };
}

// Mapeia cada tipo de documento do catálogo da Assessoria (ver prisma/schema.prisma,
// AssessoriaDocumento.docType) para o nome da subpasta correspondente — ACAO_VINCULADA e
// OUTRO não têm pasta própria (a primeira já vive em Processos; a segunda cai na raiz da
// empresa mesmo).
// Exportado (além de usado aqui dentro) para lib/actions/driveParentMigration.ts saber em qual
// subpasta de categoria um AssessoriaDocumento legado (docType conhecido) deveria estar.
export const ASSESSORIA_DOC_TYPE_FOLDERS: Record<string, string> = {
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let id = res.data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
    });
    id = created.data.id ?? undefined;
  }
  if (!id) throw new Error(`Não foi possível criar a pasta "${name}" no Google Drive.`);
  return id;
}

// Raiz de sistema (ex.: "Lúmen - Processos") DENTRO da pasta-mãe "Lúmen" (ver
// getOrCreateLumenParentFolder acima) — antes desta entrega, cada uma nascia solta em 'root'.
async function getOrCreateRootFolder(
  drive: ReturnType<typeof google.drive>,
  cred: { id: string; rootFolderId: string | null },
  raiz: RaizKey,
  officeId: string
): Promise<string> {
  const parentId = await getOrCreateLumenParentFolder(drive, cred, officeId);
  const rootName = (await nomeacaoDoEscritorio(officeId)).raizes[raiz];
  const res = await drive.files.list({
    q: `name='${rootName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let rootId = res.data.files?.[0]?.id;
  if (!rootId) {
    const created = await drive.files.create({
      requestBody: { name: rootName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
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
  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "assessoria", officeId);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  for (const subName of Object.values(ASSESSORIA_DOC_TYPE_FOLDERS)) {
    await findOrCreateChildFolder(drive, companyFolderId, subName);
  }
  return companyFolderId;
}

// Pasta de um Parecer (ver model Parecer, prisma/schema.prisma) dentro de
// "Lúmen - Assessoria/{empresa}/Pareceres/{nome do parecer}" — mesmo padrão de cache de
// getOrCreateCaseFolder logo abaixo: primeiro consulta Parecer.driveFolderId já salvo, só
// caminha o Drive de novo (raiz → empresa → Pareceres → nome do parecer) se ainda não existir.
export async function getOrCreateParecerFolder(parecerId: string, companyName: string, parecerName: string, officeId: string): Promise<string> {
  const existing = await prisma.parecer.findFirst({ where: { id: parecerId, officeId }, select: { driveFolderId: true } });
  // Auto-cura: o id salvo pode apontar pra uma pasta que já não existe mais no Drive (apagada
  // definitivamente ou mandada pra Lixeira fora do sistema) — sem checar, todo upload seguinte
  // falharia com 404 sem explicação. getDriveFileInfo devolve null (apagada) ou trashed=true
  // (Lixeira); nos dois casos, a pasta é recriada do zero e o id é regravado. A checagem em si é
  // best-effort: se ELA falhar (ex.: Drive momentaneamente inacessível), devolve o id salvo como
  // antes desta mudança em vez de travar quem só queria reaproveitar um id que provavelmente
  // ainda é válido — o pior caso nesse cenário raro é um 404 na hora do upload de verdade, não
  // pior do que o comportamento anterior a esta entrega.
  if (existing?.driveFolderId) {
    try {
      const info = await getDriveFileInfo(existing.driveFolderId, officeId);
      // info null (apagada) ou trashed=true (Lixeira): NÃO retorna aqui, cai pro recriar abaixo.
      if (info && !info.trashed) return existing.driveFolderId;
    } catch {
      return existing.driveFolderId;
    }
  }

  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "assessoria", officeId);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  const pareceresFolderId = await findOrCreateChildFolder(drive, companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.PARECER);
  const folderId = await findOrCreateChildFolder(drive, pareceresFolderId, parecerName);
  await prisma.parecer.updateMany({ where: { id: parecerId, officeId }, data: { driveFolderId: folderId, storageProvider: "GOOGLE_DRIVE" } });
  return folderId;
}

// Pasta de uma Licitação (ver model Licitacao, prisma/schema.prisma) dentro de
// "Lúmen - Assessoria/{empresa}/Licitações/{nome da licitação}" — mesmo padrão de cache de
// getOrCreateParecerFolder acima (correção de 05/09/2026: antes desta função existir,
// Attachment.licitacaoId ia direto pra raiz da pasta da empresa, sem pasta própria nenhuma —
// ver docs/auditoria-pastas-drive-2026-09.md).
export async function getOrCreateLicitacaoFolder(licitacaoId: string, companyName: string, licitacaoNome: string, officeId: string): Promise<string> {
  const existing = await prisma.licitacao.findFirst({ where: { id: licitacaoId, officeId }, select: { driveFolderId: true } });
  // Auto-cura: mesmo raciocínio de getOrCreateParecerFolder acima.
  if (existing?.driveFolderId) {
    try {
      const info = await getDriveFileInfo(existing.driveFolderId, officeId);
      if (info && !info.trashed) return existing.driveFolderId;
    } catch {
      return existing.driveFolderId;
    }
  }

  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "assessoria", officeId);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  const licitacoesFolderId = await findOrCreateChildFolder(drive, companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.LICITACAO);
  const folderId = await findOrCreateChildFolder(drive, licitacoesFolderId, licitacaoNome);
  await prisma.licitacao.updateMany({ where: { id: licitacaoId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Subpasta de UMA demanda/tarefa dentro da pasta própria da Licitação —
// "Lúmen - Assessoria/{empresa}/Licitações/{nome da licitação}/{título da demanda}". Chama
// getOrCreateLicitacaoFolder acima para garantir/obter o pai antes de descer mais um nível —
// mesmo raciocínio de getOrCreateCategoryFolder para Processo/Atendimento.
export async function getOrCreateLicitacaoDemandaFolder(
  taskId: string,
  licitacaoId: string,
  companyName: string,
  licitacaoNome: string,
  demandaNome: string,
  officeId: string
): Promise<string> {
  const existing = await prisma.task.findFirst({ where: { id: taskId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) {
    try {
      const info = await getDriveFileInfo(existing.driveFolderId, officeId);
      if (info && !info.trashed) return existing.driveFolderId;
    } catch {
      return existing.driveFolderId;
    }
  }

  const { drive } = await getDriveClient(officeId);
  const licitacaoFolderId = await getOrCreateLicitacaoFolder(licitacaoId, companyName, licitacaoNome, officeId);
  const folderId = await findOrCreateChildFolder(drive, licitacaoFolderId, demandaNome);
  await prisma.task.updateMany({ where: { id: taskId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Subpasta "Licitações" dentro da pasta da empresa (garante a estrutura completa) — mesmo papel
// de getAssessoriaPareceresContainerFolderId abaixo, usado pela migração de pastas legadas para
// saber onde realocar um Licitacao.driveFolderId antigo sem reconsultar a Licitação.
export async function getAssessoriaLicitacoesContainerFolderId(companyName: string, officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "assessoria", officeId);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  return findOrCreateChildFolder(drive, companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.LICITACAO);
}

// Id da raiz "Lúmen - Assessoria" (cria se ainda não existir) — bare root, sem empresa nenhuma.
// Exportado para lib/actions/driveParentMigration.ts mover uma pasta de EMPRESA legada pra dentro
// dela.
export async function getAssessoriaRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "assessoria", officeId);
}

// Subpasta "Pareceres" dentro da pasta da empresa (garante a estrutura completa) — usado pela
// migração de pastas legadas (lib/actions/driveParentMigration.ts) para saber onde realocar um
// Parecer.driveFolderId antigo SEM reconsultar o Parecer: ao contrário de getOrCreateParecerFolder
// acima, que devolve direto o id já salvo sem recriar o caminho, aqui o objetivo é justamente
// descobrir o PAI correto pra mover a pasta que esse id aponta — não reencontrá-la pelo id.
export async function getAssessoriaPareceresContainerFolderId(companyName: string, officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "assessoria", officeId);
  const companyFolderId = await findOrCreateChildFolder(drive, rootId, companyName);
  return findOrCreateChildFolder(drive, companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.PARECER);
}

// Raiz nova (separada de "Lúmen - Processos") para Case cuja natureza é "CASO" — ver
// lib/caseNatureza.ts: qualquer type que não seja JUDICIAL nem ADMINISTRATIVO (EXTRAJUDICIAL, e os
// legados ATENDIMENTO/CONSULTIVO). Antes desta mudança, TODO Case (processo ou caso) caía em
// da raiz de processos; pastas que já existiam lá antes desta entrega só migram para cá através de
// scripts/migrar-pastas-casos.ts (nunca automaticamente) — ver getOrCreateCaseFolder abaixo, que
// só decide a raiz para pasta NOVA (Case.driveFolderId ainda nulo).

// Pasta própria de um processo/caso no Drive ("Lúmen - Processos/{título}" ou "Lúmen -
// Casos/{título}", conforme Case.type — ver naturezaOf), criada sob demanda no primeiro anexo — o
// id fica salvo em Case.driveFolderId pra nunca precisar refazer essa busca depois (mesmo padrão
// de Assessoria.driveFolderId). officeId garante que só se busca/atualiza um Case do PRÓPRIO
// escritório (evita que alguém force um caseId de outro tenant).
//
// PONTO CRÍTICO: a escolha de raiz abaixo só roda quando existing.driveFolderId ainda é nulo — um
// Case que JÁ tem pasta (criada antes desta mudança, possivelmente ainda dentro de "Lúmen -
// Processos") devolve essa pasta direto, na linha seguinte, sem olhar pra type nem para raiz
// nenhuma. Isso é o que garante que este código nunca cria uma pasta duplicada para um Case que já
// tinha uma: mover uma pasta de caso já existente para a raiz nova é trabalho exclusivo de
// scripts/migrar-pastas-casos.ts (Tarefa B), não desta função.
export async function getOrCreateCaseFolder(caseId: string, caseTitle: string, officeId: string): Promise<string> {
  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId }, select: { driveFolderId: true, type: true } });
  // Auto-cura: mesmo raciocínio de getOrCreateParecerFolder acima — um id salvo que já não existe
  // mais no Drive (apagado ou na Lixeira, fora do sistema) é tratado como "ainda não tem pasta",
  // não como erro; a pasta é recriada e o id, regravado. Sem isso, um caso cuja pasta alguém
  // apagou manualmente no Drive ficaria travado, incapaz de receber qualquer anexo novo. A
  // checagem em si é best-effort (ver comentário em getOrCreateParecerFolder) — uma falha nela
  // não deve travar quem só queria reaproveitar o id salvo.
  if (existing?.driveFolderId) {
    try {
      const info = await getDriveFileInfo(existing.driveFolderId, officeId);
      if (info && !info.trashed) return existing.driveFolderId;
    } catch {
      return existing.driveFolderId;
    }
  }

  const { drive, cred } = await getDriveClient(officeId);
  // Fallback conservador (existing null, ex.: caseId inválido — não deveria acontecer, pois quem
  // chama já validou o caseId antes) mantém o comportamento anterior a esta mudança: raiz de
  // Processos.
  const raiz: RaizKey = existing && naturezaOf(existing.type) === "CASO" ? "casos" : "processos";
  const rootId = await getOrCreateRootFolder(drive, cred, raiz, officeId);
  const folderId = await findOrCreateChildFolder(drive, rootId, caseTitle);
  await prisma.case.updateMany({ where: { id: caseId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Mesma ideia, para um Atendimento ("Lúmen - Atendimentos/{assunto}") — se o atendimento virar
// Processo depois, essa MESMA pasta é renomeada e transferida pro Case (ver
// convertAttendanceToCase em lib/actions/attendance.ts), nunca duplicada.
export async function getOrCreateAttendanceFolder(attendanceId: string, subject: string, officeId: string): Promise<string> {
  const existing = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { driveFolderId: true } });
  // Auto-cura — ver comentário em getOrCreateCaseFolder acima.
  if (existing?.driveFolderId) {
    try {
      const info = await getDriveFileInfo(existing.driveFolderId, officeId);
      if (info && !info.trashed) return existing.driveFolderId;
    } catch {
      return existing.driveFolderId;
    }
  }

  const { drive, cred } = await getDriveClient(officeId);
  const rootId = await getOrCreateRootFolder(drive, cred, "atendimentos", officeId);
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
  await drive.files.update({ fileId: folderId, requestBody: { name: newName }, supportsAllDrives: true });
}

// ============ PROTOCOLOS (ver lib/protocolos.ts e lib/actions/protocolos.ts) ============

// Subpasta de sistema "Protocolos" dentro da pasta do processo — reaproveita
// findOrCreateChildFolder (mesmo padrão de getOrCreateCategoryFolder), mas o nome vem de
// PROTOCOLOS_FOLDER_NAME (lib/protocolos.ts) por ser a mesma constante que o sync reverso do
// Drive usa pra ignorar esta pasta (isReservedCaseSubfolder) — nunca dessincronizar os dois nomes.
export async function getOrCreateProtocolosContainerFolder(caseFolderId: string, officeId: string): Promise<string> {
  const { drive } = await getDriveClient(officeId);
  return findOrCreateChildFolder(drive, caseFolderId, PROTOCOLOS_FOLDER_NAME);
}

// Cria uma pasta com nome exato (sem reaproveitar por nome, ao contrário de
// findOrCreateChildFolder) — cada protocolo é um lote novo, então uma pasta homônima de um lote
// anterior (raro, mas possível com títulos repetidos) não deve ser reaproveitada.
export async function createNamedDriveFolder(parentId: string, name: string, officeId: string): Promise<string> {
  const { drive } = await getDriveClient(officeId);
  const created = await drive.files.create({
    requestBody: { name, mimeType: DRIVE_FOLDER_MIME_TYPE, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = created.data.id;
  if (!id) throw new Error(`Não foi possível criar a pasta "${name}" no Google Drive.`);
  return id;
}

// Atalho do Drive: um ponteiro pro arquivo original (targetFileId), não uma cópia — ocupa zero
// espaço e apagá-lo nunca apaga o arquivo apontado. É o mecanismo inteiro por trás de "protocolo
// não duplica documento" (ver lib/protocolos.ts): a pasta do lote só tem atalhos.
export async function createDriveShortcut(parentId: string, name: string, targetFileId: string, officeId: string): Promise<string> {
  const { drive } = await getDriveClient(officeId);
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.shortcut",
      parents: [parentId],
      shortcutDetails: { targetId: targetFileId },
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = created.data.id;
  if (!id) throw new Error(`Não foi possível criar o atalho "${name}" no Google Drive.`);
  return id;
}

export async function deleteDriveFile(fileId: string, officeId: string): Promise<void> {
  const { drive } = await getDriveClient(officeId);
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

// "Mover" um arquivo no Drive é trocar os pais (parents) — não existe operação de move direta.
// Usado pela reorganização de anexos já existentes (lib/actions/driveReorg.ts).
export async function moveDriveFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const { drive } = await getDriveClient(officeId);
  const file = await drive.files.get({ fileId, fields: "parents", supportsAllDrives: true });
  const previousParents = (file.data.parents || []).join(",");
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents || undefined,
    fields: "id, parents",
    supportsAllDrives: true,
  });
}

// ============ SYNC REVERSO (Drive -> banco), ver lib/driveSync.ts ============

export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// Usado pelo sync reverso pra pular, sem erro, escritórios que nunca conectaram o Drive — bem
// diferente de getDriveClient (privado, acima), que LANÇA quando não há credencial, correto
// para uma ação disparada por um usuário clicando em algo, mas errado para um cron que varre
// todos os escritórios da plataforma.
export async function hasPrimaryDriveCredential(officeId: string): Promise<boolean> {
  const cred = await prisma.googleCredential.findFirst({ where: { officeId, isPrimaryDrive: true }, select: { id: true } });
  return Boolean(cred);
}

export type DriveChildEntry = { id: string; name: string; mimeType: string; webViewLink?: string | null };

// Lista TODOS os filhos (arquivos + subpastas, um nível) de uma pasta do Drive, paginando
// conforme necessário — nenhuma outra função deste arquivo lista o conteúdo inteiro de uma
// pasta (as demais só buscam/criam UM filho pontual por nome). Usado só pelo sync reverso, que
// precisa enumerar o que existe de verdade no Drive pra comparar com o que o banco espera.
export async function listDriveChildren(officeId: string, folderId: string): Promise<DriveChildEntry[]> {
  const { drive } = await getDriveClient(officeId);
  const children: DriveChildEntry[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType,webViewLink)",
      pageToken,
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) children.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? "", webViewLink: f.webViewLink });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return children;
}

// Ids das pastas-raiz "Lúmen - Processos"/"Lúmen - Atendimentos" deste escritório (cria se ainda
// não existir, mesmo getOrCreateRootFolder usado por getOrCreateCaseFolder/
// getOrCreateAttendanceFolder) — exportado pro sync reverso listar o conteúdo da raiz sem
// precisar de um Case/Attendance específico em mãos.
export async function getProcessosRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "processos", officeId);
}

export async function getAtendimentosRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "atendimentos", officeId);
}

// Id da raiz "Lúmen - Casos" deste escritório (cria se ainda não existir) — exportado para o sync
// reverso (lib/driveSync.ts) varrer o conteúdo da raiz nova, e para scripts/migrar-pastas-casos.ts
// resolver o destino das pastas de caso movidas.
export async function getCasosRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "casos", officeId);
}

// Comprovantes do Financeiro (Contas a Pagar/Contas a Receber) — duas raízes FLAT, sem pasta por
// conta nem por fornecedor/cliente: o arquivo já nasce catalogado pelo NOME
// ("AAAA-MM-DD-fornecedor-descricao", ver lib/financeReceiptNaming.ts), então uma subpasta por
// conta só acrescentaria clique sem organizar nada a mais — a lista já é ordenável por nome no
// próprio Drive. "Despesas" (Payable) e "Receitas" (Receivable) são raízes SEPARADAS (não uma
// única "Lúmen - Financeiro" com duas subpastas) para ficar no mesmo padrão flat de
// processos/atendimentos/assessoria acima — todas raiz direta da
// pasta-mãe "Lúmen", nenhuma aninhada dentro de outra.

export async function getFinanceDespesasRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "financeiroDespesas", officeId);
}

export async function getFinanceReceitasRootFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateRootFolder(drive, cred, "financeiroReceitas", officeId);
}

// Id da pasta-mãe "Lúmen" (cria se ainda não existir) — exportado para
// lib/actions/driveParentMigration.ts mover as raízes legadas soltas pra dentro dela.
export async function getLumenParentFolderId(officeId: string): Promise<string> {
  const { drive, cred } = await getDriveClient(officeId);
  return getOrCreateLumenParentFolder(drive, cred, officeId);
}

// As nove raízes que nascem dentro da pasta-mãe (ver getOrCreateRootFolder) — usado só pela
// migração (lib/actions/driveParentMigration.ts) para reconhecer, por nome, qualquer uma delas
// que ainda esteja solta direto em 'root' de uma conexão anterior à pasta-mãe existir.
//
// Virou função (antes era uma constante) porque o nome das raízes agora é escolhido por cada
// escritório — ver lib/driveNaming.ts.
export async function allRootFolderNames(officeId: string): Promise<string[]> {
  return (await nomeacaoDoEscritorio(officeId)).todasAsRaizes;
}

// ============ MIGRAÇÃO DE PASTAS LEGADAS (ver lib/actions/driveFolderMigration.ts) ============

export type DriveFileInfo = { id: string; name: string; parents: string[]; trashed: boolean };

// Lê nome + pais (parents) atuais de um arquivo/pasta no Drive pelo id — diferente de todas as
// funções acima, que só CRIAM/buscam um filho pontual por nome, esta lê o estado bruto de um id
// já conhecido de antemão (vindo de Case.driveFolderId/Attendance.driveFolderId). Devolve null
// (em vez de lançar) quando o id não existe mais no Drive — apagado, ou nunca existiu de fato —
// caso normal a se esperar depois de uma migração antiga malfeita, não um erro de programação.
// Usado pela migração de pastas legadas pra descobrir em qual raiz uma pasta está de verdade e
// se o nome dela ainda bate com o título atual da entidade (títulos foram renomeados pra
// convenção "Cliente x Parte Adversa" depois que várias pastas já existiam).
//
// `trashed` vem junto de propósito: uma pasta na Lixeira do Drive ainda responde 200 aqui e
// ainda reporta os `parents` que tinha antes, então sem esse campo uma pasta que alguém jogou
// no lixo pareceria uma pasta viva no lugar errado — e a migração a "resgataria" de volta pra
// raiz nova sem ninguém ter pedido.
export async function getDriveFileInfo(fileId: string, officeId: string): Promise<DriveFileInfo | null> {
  const { drive } = await getDriveClient(officeId);
  try {
    const file = await drive.files.get({ fileId, fields: "id, name, parents, trashed", supportsAllDrives: true });
    return { id: fileId, name: file.data.name ?? "", parents: file.data.parents ?? [], trashed: Boolean(file.data.trashed) };
  } catch (e: unknown) {
    const status = (e as { code?: number; response?: { status?: number } })?.code ?? (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw e;
  }
}

// Manda um arquivo/pasta para a Lixeira do Drive — de propósito NUNCA files.delete (que é
// permanente e não pode ser desfeito por ninguém, nem o dono da conta). Usado só quando uma
// automação está prestes a apagar algo que ela mesma concluiu (com alta confiança) ser um
// duplicado vazio, e mesmo assim precisa continuar reversível por 30 dias pela Lixeira do Drive
// caso a conclusão esteja errada — ver migrarPastasLegadasDoDrive e
// lib/actions/driveParentMigration.ts (auditoria das raízes "RP Financeiro - *").
export async function trashDriveFile(fileId: string, officeId: string): Promise<void> {
  const { drive } = await getDriveClient(officeId);
  await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
}
