// Armazenamento de anexos via Dropbox (API v2) — espelha o SUBCONJUNTO de lib/googleDrive.ts
// usado para armazenamento (estrutura de pastas + upload/exclusão/renomeação/movimentação de
// arquivo), mesmo padrão de organização de código de lib/oneDriveStorage.ts. NÃO cobre
// preenchimento de modelo de documento (Google Docs API) nem nenhuma sincronização de e-mail —
// Dropbox neste projeto é só armazenamento de anexo (ver lib/actions/generateDocument.ts, que não
// muda nesta entrega, e lib/dropbox.ts, que cobre só OAuth/conta).
//
// Diferença estrutural do OneDrive/Google: a API do Dropbox é baseada em CAMINHO completo (não só
// id) para criar pasta/mover/deletar — mas aceita o formato "id:XXXXXXXX" na maioria dos
// parâmetros `path` no lugar de um caminho literal, e todo arquivo/pasta já recebe um id nesse
// formato em `.id`/`.metadata.id` na criação. Por isso este arquivo persiste/reaproveita SEMPRE
// esse formato "id:..." nos mesmos campos Case.driveFolderId/Attendance.driveFolderId/
// Assessoria.driveFolderId que os outros dois provedores já usam (só uma string opaca) — evita ter
// que rastrear/reconstruir caminho completo em toda chamada subsequente. Só a CRIAÇÃO de uma pasta
// exige o caminho completo (create_folder_v2 não aceita "id do pai + nome"), então
// getOrCreateChildFolder resolve o caminho do pai via `get_metadata` (path_display) antes de
// compor "${caminhoDoPai}/${nome}" — uma chamada HTTP a mais por pasta nova, mas mantém o resto do
// código (e a assinatura das funções expostas) idêntico ao padrão do Google/OneDrive.
//
// asIdPath() normaliza qualquer id armazenado para o formato "id:XXXXX" antes de usá-lo como
// `path` — a Dropbox já devolve `.id` nesse formato, então isso é um no-op na prática, mas deixa o
// código resiliente e autodocumentado em vez de depender de um detalhe implícito da API.
import { prisma } from "@/lib/prisma";
import { getDropboxAccessToken, exchangeDropboxCodeForTokens } from "@/lib/dropbox";
import { ASSESSORIA_DOC_TYPE_FOLDERS } from "@/lib/oneDriveStorage";
import { naturezaOf } from "@/lib/caseNatureza";

const API_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";
const ROOT_FOLDER_NAME = "Lúmen";

export { ASSESSORIA_DOC_TYPE_FOLDERS };

function asIdPath(id: string): string {
  return id.startsWith("id:") ? id : `id:${id}`;
}

async function getCredential(officeId: string) {
  const cred = await prisma.dropboxCredential.findUnique({ where: { officeId } });
  if (!cred) {
    throw new Error("Dropbox não conectado. Vá em Configurações e conecte a conta Dropbox do seu escritório.");
  }
  return cred;
}

async function getAccessTokenForOffice(officeId: string): Promise<string> {
  const cred = await getCredential(officeId);
  return getDropboxAccessToken(cred.refreshToken);
}

// Chamada RPC genérica (api.dropboxapi.com) — upload de conteúdo usa content.dropboxapi.com à
// parte (ver uploadBufferToFolder), diferente do Microsoft Graph que usa um único domínio.
async function dbxFetch(path: string, accessToken: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : "null",
  });
}

// A Dropbox sinaliza "já existe" (pasta/link) com HTTP 409 e um corpo estruturado
// (error_summary contém algo como "path/conflict/folder/..." ou "shared_link_already_exists/...").
// Checagem por substring no texto bruto evita depender do formato exato de cada variante de erro.
function bodyIndicates(bodyText: string, needle: string): boolean {
  try {
    const data = JSON.parse(bodyText) as { error_summary?: string };
    return typeof data.error_summary === "string" && data.error_summary.includes(needle);
  } catch {
    return bodyText.includes(needle);
  }
}

async function getMetadata(path: string, accessToken: string): Promise<{ id: string; name: string; path_display: string }> {
  const res = await dbxFetch("/files/get_metadata", accessToken, { path });
  if (!res.ok) throw new Error(`Falha ao buscar metadados no Dropbox (${res.status}): ${await res.text()}`);
  return res.json();
}

// Cria (se ainda não existir) a pasta raiz "Lúmen" na raiz do Dropbox da conta conectada deste
// escritório, e cacheia o id (formato "id:XXXXX") em DropboxCredential.rootFolderId — mesmo padrão
// de cache do Google (GoogleCredential.folderId) e do OneDrive (MicrosoftCredential.rootFolderId).
export async function getOrCreateRootFolder(officeId: string): Promise<string> {
  const cred = await getCredential(officeId);
  if (cred.rootFolderId) return cred.rootFolderId;

  const accessToken = await getDropboxAccessToken(cred.refreshToken);
  const rootPath = `/${ROOT_FOLDER_NAME}`;
  const createRes = await dbxFetch("/files/create_folder_v2", accessToken, { path: rootPath, autorename: false });

  let folderId: string;
  if (createRes.ok) {
    const created = (await createRes.json()) as { metadata: { id: string } };
    folderId = created.metadata.id;
  } else {
    const bodyText = await createRes.text();
    if (!bodyIndicates(bodyText, "conflict")) {
      throw new Error(`Falha ao criar a pasta raiz "${ROOT_FOLDER_NAME}" no Dropbox (${createRes.status}): ${bodyText}`);
    }
    const existing = await getMetadata(rootPath, accessToken);
    folderId = existing.id;
  }

  folderId = asIdPath(folderId);
  await prisma.dropboxCredential.update({ where: { id: cred.id }, data: { rootFolderId: folderId } });
  return folderId;
}

// Busca (por caminho, dentro do pai) ou cria uma subpasta — usada tanto para a estrutura fixa por
// entidade (Processos/{título}, Atendimentos/{assunto}, Assessoria/{empresa}/{subpasta}) quanto
// para a subpasta de categoria de documento dentro de um processo/atendimento.
export async function getOrCreateChildFolder(parentFolderId: string, name: string, officeId: string): Promise<string> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const parentMeta = await getMetadata(asIdPath(parentFolderId), accessToken);
  const childPath = `${parentMeta.path_display}/${name}`;

  const createRes = await dbxFetch("/files/create_folder_v2", accessToken, { path: childPath, autorename: false });
  if (createRes.ok) {
    const created = (await createRes.json()) as { metadata: { id: string } };
    return asIdPath(created.metadata.id);
  }

  const bodyText = await createRes.text();
  if (!bodyIndicates(bodyText, "conflict")) {
    throw new Error(`Falha ao criar a pasta "${name}" no Dropbox (${createRes.status}): ${bodyText}`);
  }
  const existing = await getMetadata(childPath, accessToken);
  return asIdPath(existing.id);
}

const PROCESSOS_ROOT_NAME = "Lúmen - Processos";
const ATENDIMENTOS_ROOT_NAME = "Lúmen - Atendimentos";
const ASSESSORIA_ROOT_NAME = "Lúmen - Assessoria";
// Raiz nova para Case cuja natureza é "CASO" (ver lib/caseNatureza.ts e o mesmo ponto em
// lib/googleDrive.ts) — mesma regra, mesmo comentário de fundo, só o provedor muda.
const CASOS_ROOT_NAME = "Lúmen - Casos";

async function getOrCreateNamedRootFolder(rootName: string, officeId: string): Promise<string> {
  const lumenRootId = await getOrCreateRootFolder(officeId);
  return getOrCreateChildFolder(lumenRootId, rootName, officeId);
}

// Pasta própria de um processo/caso no Dropbox ("Lúmen/Lúmen - Processos/{título}" ou
// "Lúmen/Lúmen - Casos/{título}", conforme Case.type — ver naturezaOf), criada sob demanda no
// primeiro anexo — persiste no MESMO campo Case.driveFolderId que Google/OneDrive usam. officeId
// garante que só se busca/atualiza um Case do PRÓPRIO escritório.
//
// Mesmo ponto crítico documentado em lib/googleDrive.ts:getOrCreateCaseFolder — a escolha de raiz
// só roda quando existing.driveFolderId ainda é nulo; um Case que já tem pasta devolve ela direto,
// sem olhar pra type. Mover pasta de caso já existente é trabalho de
// scripts/migrar-pastas-casos.ts, não desta função.
export async function getOrCreateCaseFolder(caseId: string, caseTitle: string, officeId: string): Promise<string> {
  const existing = await prisma.case.findFirst({ where: { id: caseId, officeId }, select: { driveFolderId: true, type: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const rootName = existing && naturezaOf(existing.type) === "CASO" ? CASOS_ROOT_NAME : PROCESSOS_ROOT_NAME;
  const rootId = await getOrCreateNamedRootFolder(rootName, officeId);
  const folderId = await getOrCreateChildFolder(rootId, caseTitle, officeId);
  await prisma.case.updateMany({ where: { id: caseId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Mesma ideia, para um Atendimento ("Lúmen/Lúmen - Atendimentos/{assunto}").
export async function getOrCreateAttendanceFolder(attendanceId: string, subject: string, officeId: string): Promise<string> {
  const existing = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const rootId = await getOrCreateNamedRootFolder(ATENDIMENTOS_ROOT_NAME, officeId);
  const folderId = await getOrCreateChildFolder(rootId, subject, officeId);
  await prisma.attendance.updateMany({ where: { id: attendanceId, officeId }, data: { driveFolderId: folderId } });
  return folderId;
}

// Ids das raízes "Lúmen - Processos"/"Lúmen - Casos" deste escritório (cria se ainda não existir)
// — exportados para scripts/migrar-pastas-casos.ts (Tarefa B), mesmo papel de
// getProcessosRootFolderId/getCasosRootFolderId em lib/googleDrive.ts e lib/oneDriveStorage.ts.
export async function getProcessosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateNamedRootFolder(PROCESSOS_ROOT_NAME, officeId);
}

export async function getCasosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateNamedRootFolder(CASOS_ROOT_NAME, officeId);
}

// Lê id + nome + caminho do PAI atual de um item do Dropbox (arquivo ou pasta) — usado só por
// scripts/migrar-pastas-casos.ts para descobrir em qual raiz uma pasta de caso está de verdade
// antes de decidir se precisa mover. Devolve null (em vez de lançar) quando o item não existe mais
// (get_metadata sem include_deleted não enxerga item apagado — mesmo efeito prático do 404 do
// Google/OneDrive: pula a pasta, sem tentar recriá-la).
export type DropboxItemInfo = { id: string; name: string; pathDisplay: string; parentPath: string };

export async function getDropboxItemInfo(fileId: string, officeId: string): Promise<DropboxItemInfo | null> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await dbxFetch("/files/get_metadata", accessToken, { path: asIdPath(fileId) });
  if (!res.ok) {
    const bodyText = await res.text();
    if (bodyIndicates(bodyText, "not_found")) return null;
    throw new Error(`Falha ao buscar metadados no Dropbox (${res.status}): ${bodyText}`);
  }
  const data = (await res.json()) as { id: string; name: string; path_display: string };
  const idx = data.path_display.lastIndexOf("/");
  const parentPath = idx > 0 ? data.path_display.slice(0, idx) : "/";
  return { id: asIdPath(data.id), name: data.name, pathDisplay: data.path_display, parentPath };
}

// Cria (se ainda não existir) a estrutura de pastas de uma empresa em Assessoria:
// "Lúmen/Lúmen - Assessoria/{empresa}/{Contratos,Pareceres,Licitações,Regimentos Internos}".
// Reaproveita o mesmo mapa ASSESSORIA_DOC_TYPE_FOLDERS de lib/oneDriveStorage.ts (reexportado
// acima) — é só um Record<string,string> sem dependência de provedor.
export async function getOrCreateAssessoriaCompanyFolder(companyName: string, officeId: string): Promise<string> {
  const rootId = await getOrCreateNamedRootFolder(ASSESSORIA_ROOT_NAME, officeId);
  const companyFolderId = await getOrCreateChildFolder(rootId, companyName, officeId);
  for (const subName of Object.values(ASSESSORIA_DOC_TYPE_FOLDERS)) {
    await getOrCreateChildFolder(companyFolderId, subName, officeId);
  }
  return companyFolderId;
}

// Pasta de um Parecer (ver model Parecer, prisma/schema.prisma) em
// "Lúmen/Lúmen - Assessoria/{empresa}/Pareceres/{nome do parecer}" — mesmo padrão de cache do
// lado Google/OneDrive (getOrCreateParecerFolder em lib/googleDrive.ts / lib/oneDriveStorage.ts).
export async function getOrCreateParecerFolder(parecerId: string, companyName: string, parecerName: string, officeId: string): Promise<string> {
  const existing = await prisma.parecer.findFirst({ where: { id: parecerId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const rootId = await getOrCreateNamedRootFolder(ASSESSORIA_ROOT_NAME, officeId);
  const companyFolderId = await getOrCreateChildFolder(rootId, companyName, officeId);
  const pareceresFolderId = await getOrCreateChildFolder(companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.PARECER, officeId);
  const folderId = await getOrCreateChildFolder(pareceresFolderId, parecerName, officeId);
  await prisma.parecer.updateMany({ where: { id: parecerId, officeId }, data: { driveFolderId: folderId, storageProvider: "DROPBOX" } });
  return folderId;
}

// Subpasta de categoria dentro da pasta de um processo/atendimento (ex: "Petição", "Procuração").
export async function getOrCreateCategoryFolder(parentFolderId: string, categoryLabel: string, officeId: string): Promise<string> {
  return getOrCreateChildFolder(parentFolderId, categoryLabel, officeId);
}

// Busca (ou cria) o link compartilhável de um arquivo recém-enviado. Se já existir um link para
// aquele arquivo (erro shared_link_already_exists — ex.: reenvio do mesmo id, incomum mas
// possível), busca o existente em vez de falhar.
async function createOrGetSharedLink(fileId: string, accessToken: string): Promise<string> {
  const linkRes = await dbxFetch("/sharing/create_shared_link_with_settings", accessToken, {
    path: fileId,
    settings: { requested_visibility: "public" },
  });
  if (linkRes.ok) {
    const data = (await linkRes.json()) as { url: string };
    return data.url;
  }

  const bodyText = await linkRes.text();
  if (!bodyIndicates(bodyText, "shared_link_already_exists")) {
    throw new Error(`Arquivo enviado, mas o link não pôde ser obtido (${linkRes.status}): ${bodyText}`);
  }
  const listRes = await dbxFetch("/sharing/list_shared_links", accessToken, { path: fileId, direct_only: true });
  if (!listRes.ok) throw new Error(`Arquivo enviado, mas o link não pôde ser obtido (${listRes.status}): ${await listRes.text()}`);
  const listData = (await listRes.json()) as { links: { url: string }[] };
  const existingUrl = listData.links[0]?.url;
  if (!existingUrl) throw new Error("Arquivo enviado, mas o link não pôde ser obtido.");
  return existingUrl;
}

// Baixa o conteúdo real de um arquivo do Dropbox — usado pelo envio de documentos por e-mail com
// anexo de verdade (ver lib/storageProvider.ts:downloadDriveFile). Endpoint próprio
// (content.dropboxapi.com, igual ao upload) que recebe o `path` (aqui, o id normalizado) via
// header Dropbox-API-Arg em vez de no corpo/query. O Content-Type devolvido pelo Dropbox nesse
// endpoint costuma vir genérico (application/octet-stream) — o chamador
// (lib/actions/documentoEnvios.ts) tem uma inferência por extensão de arquivo como rede de
// segurança para esse caso.
export async function downloadFileFromDropbox(fileId: string, officeId: string): Promise<{ content: Buffer; mimeType: string }> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await fetch(`${CONTENT_BASE}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: asIdPath(fileId) }),
    },
  });
  if (!res.ok) throw new Error(`Falha ao baixar arquivo do Dropbox (${res.status}): ${await res.text()}`);
  const content = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "application/octet-stream";
  return { content, mimeType };
}

async function uploadBufferToFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const folderMeta = await getMetadata(asIdPath(folderId), accessToken);
  const filePath = `${folderMeta.path_display}/${fileName}`;

  // Upload simples (`/2/files/upload`, subdomínio content.dropboxapi.com) — limite de 150MB, bem
  // mais generoso que o do OneDrive (4MB). autorename: true evita erro de nome duplicado (soma um
  // sufixo automático) — diferente de Google/OneDrive, que não fazem isso sozinhos.
  const uploadRes = await fetch(`${CONTENT_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: filePath, mode: "add", autorename: true }),
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    if (uploadRes.status === 413) {
      throw new Error("Arquivo muito grande para o upload direto do Dropbox (limite de 150MB).");
    }
    throw new Error(`Falha ao enviar arquivo para o Dropbox (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const uploaded = (await uploadRes.json()) as { id: string };
  if (!uploaded.id) throw new Error("Falha ao enviar arquivo para o Dropbox.");
  const fileId = asIdPath(uploaded.id);

  const webViewLink = await createOrGetSharedLink(fileId, accessToken);
  return { id: fileId, webViewLink };
}

// Igual a uploadFileToDropbox, mas envia para uma pasta específica do Dropbox (por id) em vez da
// pasta raiz — usado para subir arquivo direto na pasta de uma empresa em Assessoria.
export async function uploadFileToDropboxFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  return uploadBufferToFolder(fileName, mimeType, buffer, folderId, officeId);
}

// Atalho para a pasta raiz "Lúmen" — mesma relação que uploadFileToDrive/uploadFileToDriveFolder
// têm no lado Google/OneDrive.
export async function uploadFileToDropbox(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  const rootId = await getOrCreateRootFolder(officeId);
  return uploadBufferToFolder(fileName, mimeType, buffer, rootId, officeId);
}

export async function deleteDropboxFile(fileId: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await dbxFetch("/files/delete_v2", accessToken, { path: asIdPath(fileId) });
  if (!res.ok) throw new Error(`Falha ao excluir arquivo do Dropbox (${res.status}): ${await res.text()}`);
}

// Dropbox não tem "rename" direto: é um move_v2 para o mesmo pai com nome novo. Resolve o
// caminho do PAI atual via get_metadata no próprio folderId (tudo antes da última barra do
// path_display) e monta o novo caminho com o novo nome no final.
export async function renameDropboxFolder(folderId: string, newName: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const meta = await getMetadata(asIdPath(folderId), accessToken);
  const parentPath = meta.path_display.slice(0, meta.path_display.lastIndexOf("/"));
  const toPath = `${parentPath}/${newName}`;

  const res = await dbxFetch("/files/move_v2", accessToken, { from_path: asIdPath(folderId), to_path: toPath });
  if (!res.ok) throw new Error(`Falha ao renomear pasta no Dropbox (${res.status}): ${await res.text()}`);
}

// "Mover" um arquivo no Dropbox exige o caminho de destino COMPLETO (não só o id do novo pai,
// diferente do Google/OneDrive) — resolve o nome atual do arquivo (get_metadata no próprio
// fileId) e o caminho do novo pai (get_metadata no newParentId) antes de montar to_path. Usado
// pela reorganização de anexos já existentes (lib/actions/driveReorg.ts).
export async function moveDropboxFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const [fileMeta, parentMeta] = await Promise.all([
    getMetadata(asIdPath(fileId), accessToken),
    getMetadata(asIdPath(newParentId), accessToken),
  ]);
  const toPath = `${parentMeta.path_display}/${fileMeta.name}`;

  const res = await dbxFetch("/files/move_v2", accessToken, { from_path: asIdPath(fileId), to_path: toPath });
  if (!res.ok) throw new Error(`Falha ao mover arquivo no Dropbox (${res.status}): ${await res.text()}`);
}

// Conecta a conta Dropbox de armazenamento DESTE escritório — 1-para-1 (mais simples que
// MicrosoftCredential, que é por pessoa): não existe hoje nenhum uso de e-mail via Dropbox, então
// não há "conta principal entre várias", só uma linha por escritório. Mesmo padrão de robustez de
// Google/Microsoft: impede a mesma conta Dropbox (mesmo accountEmail) de virar armazenamento de
// DOIS escritórios diferentes.
export async function saveDropboxTokensFromCode(code: string, officeId: string): Promise<void> {
  const { accountEmail, refreshToken } = await exchangeDropboxCodeForTokens(code);

  const existingByEmail = await prisma.dropboxCredential.findFirst({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Dropbox já está conectada a outro escritório na plataforma.");
  }

  await prisma.dropboxCredential.upsert({
    where: { officeId },
    update: { accountEmail, refreshToken },
    create: { accountEmail, refreshToken, officeId },
  });
}

export async function getDropboxStatus(officeId: string): Promise<{ connected: boolean; accountEmail?: string }> {
  const cred = await prisma.dropboxCredential.findUnique({ where: { officeId } });
  if (!cred) return { connected: false };
  return { connected: true, accountEmail: cred.accountEmail };
}
