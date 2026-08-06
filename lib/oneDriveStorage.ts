// Armazenamento de anexos via OneDrive (Microsoft Graph API v1.0) — espelha o SUBCONJUNTO de
// lib/googleDrive.ts usado para armazenamento (estrutura de pastas + upload/exclusão/renomeação/
// movimentação de arquivo). NÃO cobre preenchimento de modelo de documento (Google Docs API) —
// isso é específico do Google e continua Google-only, sem equivalente aqui (ver
// lib/actions/generateDocument.ts, que não muda nesta entrega).
//
// Reaproveita de lib/microsoftGraph.ts o fluxo OAuth já existente e testado no lado e-mail
// (exchangeMicrosoftCodeForTokens, getMicrosoftAccessToken, getMicrosoftAuthUrl) — só a parte de
// arquivo (Files.ReadWrite) é nova aqui, o escopo já era pedido no consentimento desde a Fase 1.
//
// Limitação conhecida: o upload simples do Graph (`PUT .../content`) só aceita arquivos até 4MB.
// Acima disso seria necessário criar uma upload session (`POST .../createUploadSession`) e enviar
// em pedaços — este arquivo NÃO implementa isso (ver uploadBufferToFolder abaixo); lança um erro
// claro em vez de falhar silenciosamente quando o Graph recusar por tamanho.
import { prisma } from "@/lib/prisma";
import { getMicrosoftAuthUrl, exchangeMicrosoftCodeForTokens, getMicrosoftAccessToken } from "@/lib/microsoftGraph";
import { naturezaOf } from "@/lib/caseNatureza";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const ROOT_FOLDER_NAME = "Lúmen";

export const getOneDriveAuthUrl = getMicrosoftAuthUrl;

// Conecta a conta Microsoft "principal" (armazenamento) DESTE escritório — mesma regra de
// lib/googleDrive.ts:saveTokensFromCode: a mesma conta não pode virar a conta principal de dois
// escritórios diferentes (accountEmail é único GLOBALMENTE, ver schema). Uma mesma conta pode já
// ter uma linha conectada só para e-mail (isPrimaryDrive: false) — nesse caso, vira a mesma linha,
// só liga isPrimaryDrive: true nela (nunca cria linha duplicada pelo mesmo e-mail).
export async function saveOneDriveTokensFromCode(code: string, officeId: string): Promise<void> {
  const { accountEmail, refreshToken } = await exchangeMicrosoftCodeForTokens(code);

  const existingByEmail = await prisma.microsoftCredential.findUnique({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Microsoft já está conectada a outro escritório na plataforma.");
  }

  const existingPrimary = await prisma.microsoftCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (existingPrimary && existingPrimary.accountEmail !== accountEmail) {
    await prisma.microsoftCredential.update({
      where: { id: existingPrimary.id },
      data: { isPrimaryDrive: false },
    });
  }

  await prisma.microsoftCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, isPrimaryDrive: true, officeId },
    create: { accountEmail, refreshToken, isPrimaryDrive: true, officeId },
  });
}

export async function getOneDriveStatus(officeId: string): Promise<{ connected: boolean; accountEmail?: string }> {
  const cred = await prisma.microsoftCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (!cred) return { connected: false };
  return { connected: true, accountEmail: cred.accountEmail };
}

async function getPrimaryCredential(officeId: string) {
  const cred = await prisma.microsoftCredential.findFirst({ where: { officeId, isPrimaryDrive: true } });
  if (!cred) {
    throw new Error("OneDrive não conectado. Vá em Configurações e conecte a conta Microsoft do seu escritório.");
  }
  return cred;
}

async function getAccessTokenForOffice(officeId: string): Promise<string> {
  const cred = await getPrimaryCredential(officeId);
  return getMicrosoftAccessToken(cred.refreshToken);
}

async function graphFetch(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
  });
}

// Cria (se ainda não existir) a pasta raiz "Lúmen" na raiz do OneDrive da conta conectada deste
// escritório, e cacheia o id em MicrosoftCredential.rootFolderId (mesmo padrão de cache do Google
// em GoogleCredential.folderId) para não refazer a busca a cada chamada.
export async function getOrCreateRootFolder(officeId: string): Promise<string> {
  const cred = await getPrimaryCredential(officeId);
  if (cred.rootFolderId) return cred.rootFolderId;

  const accessToken = await getMicrosoftAccessToken(cred.refreshToken);
  const encodedName = encodeURIComponent(ROOT_FOLDER_NAME);
  const getRes = await graphFetch(`/me/drive/root:/${encodedName}`, accessToken);

  let folderId: string | undefined;
  if (getRes.ok) {
    const data = (await getRes.json()) as { id: string };
    folderId = data.id;
  } else if (getRes.status === 404) {
    const createRes = await graphFetch(`/me/drive/root/children`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ROOT_FOLDER_NAME, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
    });
    if (!createRes.ok) throw new Error(`Falha ao criar a pasta raiz "${ROOT_FOLDER_NAME}" no OneDrive (${createRes.status}): ${await createRes.text()}`);
    const created = (await createRes.json()) as { id: string };
    folderId = created.id;
  } else {
    throw new Error(`Falha ao buscar a pasta raiz "${ROOT_FOLDER_NAME}" no OneDrive (${getRes.status}): ${await getRes.text()}`);
  }

  if (!folderId) throw new Error("Não foi possível criar a pasta raiz no OneDrive.");
  await prisma.microsoftCredential.update({ where: { id: cred.id }, data: { rootFolderId: folderId } });
  return folderId;
}

// Busca (por nome, dentro do pai) ou cria uma subpasta — usada tanto para a estrutura fixa por
// entidade (Processos/{título}, Atendimentos/{assunto}, Assessoria/{empresa}/{subpasta}) quanto
// para a subpasta de categoria de documento dentro de um processo/atendimento.
export async function getOrCreateChildFolder(parentFolderId: string, name: string, officeId: string): Promise<string> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const escapedName = name.replace(/'/g, "''");
  const listRes = await graphFetch(
    `/me/drive/items/${parentFolderId}/children?$filter=${encodeURIComponent(`name eq '${escapedName}'`)}`,
    accessToken
  );
  if (!listRes.ok) throw new Error(`Falha ao listar subpastas do OneDrive (${listRes.status}): ${await listRes.text()}`);
  const listData = (await listRes.json()) as { value: { id: string; name: string }[] };
  const existing = listData.value.find((f) => f.name === name);
  if (existing) return existing.id;

  const createRes = await graphFetch(`/me/drive/items/${parentFolderId}/children`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
  });
  if (!createRes.ok) throw new Error(`Falha ao criar a pasta "${name}" no OneDrive (${createRes.status}): ${await createRes.text()}`);
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

const PROCESSOS_ROOT_NAME = "Lúmen - Processos";
const ATENDIMENTOS_ROOT_NAME = "Lúmen - Atendimentos";
const ASSESSORIA_ROOT_NAME = "Lúmen - Assessoria";
// Raiz nova para Case cuja natureza é "CASO" (ver lib/caseNatureza.ts e o mesmo ponto em
// lib/googleDrive.ts) — mesma regra, mesmo comentário de fundo, só o provedor muda.
const CASOS_ROOT_NAME = "Lúmen - Casos";

// Mesmo mapa de subpasta por tipo de documento do lado Google (lib/googleDrive.ts) — reexportado
// em vez de duplicado, já que o catálogo de tipos (AssessoriaDocumento.docType) é o mesmo
// independente do provedor de armazenamento escolhido.
export const ASSESSORIA_DOC_TYPE_FOLDERS: Record<string, string> = {
  CONTRATO: "Contratos",
  PARECER: "Pareceres",
  LICITACAO: "Licitações",
  REGIMENTO_INTERNO: "Regimentos Internos",
};

async function getOrCreateNamedRootFolder(rootName: string, officeId: string): Promise<string> {
  const lumenRootId = await getOrCreateRootFolder(officeId);
  return getOrCreateChildFolder(lumenRootId, rootName, officeId);
}

// Pasta própria de um processo/caso no OneDrive ("Lúmen/Lúmen - Processos/{título}" ou
// "Lúmen/Lúmen - Casos/{título}", conforme Case.type — ver naturezaOf), criada sob demanda no
// primeiro anexo — persiste no MESMO campo Case.driveFolderId que o Google usa (esse campo já é
// só um id de pasta em texto livre, agnóstico de provedor). officeId garante que só se
// busca/atualiza um Case do PRÓPRIO escritório.
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
// — exportados para scripts/migrar-pastas-casos.ts (Tarefa B) resolver origem/destino da migração
// sem precisar de um Case específico em mãos. Mesmo papel de getProcessosRootFolderId/
// getCasosRootFolderId em lib/googleDrive.ts.
export async function getProcessosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateNamedRootFolder(PROCESSOS_ROOT_NAME, officeId);
}

export async function getCasosRootFolderId(officeId: string): Promise<string> {
  return getOrCreateNamedRootFolder(CASOS_ROOT_NAME, officeId);
}

// Lê id + nome + id do pai atual de um item do OneDrive (arquivo ou pasta) — usado só por
// scripts/migrar-pastas-casos.ts para descobrir em qual raiz uma pasta de caso está de verdade
// antes de decidir se precisa mover. Devolve null (em vez de lançar) quando o item não existe mais
// (404) — mesmo espírito de getDriveFileInfo em lib/googleDrive.ts, embora o OneDrive não exponha
// aqui um campo "trashed" equivalente: um item na Lixeira do OneDrive também costuma responder 404
// pelo id antigo, então o efeito prático (pular a pasta, sem tentar recriá-la) é o mesmo.
export type OneDriveItemInfo = { id: string; name: string; parentId: string | null };

export async function getOneDriveItemInfo(fileId: string, officeId: string): Promise<OneDriveItemInfo | null> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await graphFetch(`/me/drive/items/${fileId}?$select=id,name,parentReference`, accessToken);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar item no OneDrive (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string; name: string; parentReference?: { id?: string } };
  return { id: data.id, name: data.name, parentId: data.parentReference?.id ?? null };
}

// Cria (se ainda não existir) a estrutura de pastas de uma empresa em Assessoria:
// "Lúmen/Lúmen - Assessoria/{empresa}/{Contratos,Pareceres,Licitações,Regimentos Internos}".
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
// lado Google (getOrCreateParecerFolder em lib/googleDrive.ts).
export async function getOrCreateParecerFolder(parecerId: string, companyName: string, parecerName: string, officeId: string): Promise<string> {
  const existing = await prisma.parecer.findFirst({ where: { id: parecerId, officeId }, select: { driveFolderId: true } });
  if (existing?.driveFolderId) return existing.driveFolderId;

  const rootId = await getOrCreateNamedRootFolder(ASSESSORIA_ROOT_NAME, officeId);
  const companyFolderId = await getOrCreateChildFolder(rootId, companyName, officeId);
  const pareceresFolderId = await getOrCreateChildFolder(companyFolderId, ASSESSORIA_DOC_TYPE_FOLDERS.PARECER, officeId);
  const folderId = await getOrCreateChildFolder(pareceresFolderId, parecerName, officeId);
  await prisma.parecer.updateMany({ where: { id: parecerId, officeId }, data: { driveFolderId: folderId, storageProvider: "ONEDRIVE" } });
  return folderId;
}

// Subpasta de categoria dentro da pasta de um processo/atendimento (ex: "Petição", "Procuração").
export async function getOrCreateCategoryFolder(parentFolderId: string, categoryLabel: string, officeId: string): Promise<string> {
  return getOrCreateChildFolder(parentFolderId, categoryLabel, officeId);
}

async function uploadBufferToFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getAccessTokenForOffice(officeId);

  // Upload simples (PUT .../content) — limite de 4MB do Graph. Arquivos maiores exigiriam upload
  // session (POST .../createUploadSession + PUT em pedaços), NÃO implementado nesta entrega.
  const encodedName = encodeURIComponent(fileName);
  const uploadRes = await graphFetch(`/me/drive/items/${folderId}:/${encodedName}:/content`, accessToken, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    if (uploadRes.status === 413) {
      throw new Error(
        "Arquivo muito grande para o upload direto do OneDrive (limite de 4MB) — upload de arquivos maiores (upload session) ainda não é suportado nesta integração."
      );
    }
    throw new Error(`Falha ao enviar arquivo para o OneDrive (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const uploaded = (await uploadRes.json()) as { id: string };
  const fileId = uploaded.id;
  if (!fileId) throw new Error("Falha ao enviar arquivo para o OneDrive.");

  const linkRes = await graphFetch(`/me/drive/items/${fileId}/createLink`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "view", scope: "anonymous" }),
  });
  if (!linkRes.ok) throw new Error(`Arquivo enviado, mas o link não pôde ser obtido (${linkRes.status}): ${await linkRes.text()}`);
  const linkData = (await linkRes.json()) as { link?: { webUrl?: string } };
  const webViewLink = linkData.link?.webUrl;
  if (!webViewLink) throw new Error("Arquivo enviado, mas o link não pôde ser obtido.");

  return { id: fileId, webViewLink };
}

// Igual a uploadFileToOneDrive, mas envia para uma pasta específica do OneDrive (por id) em vez
// da pasta raiz — usado para subir arquivo direto na pasta de uma empresa em Assessoria.
export async function uploadFileToOneDriveFolder(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  return uploadBufferToFolder(fileName, mimeType, buffer, folderId, officeId);
}

// Atalho para a pasta raiz "Lúmen" — mesma relação que uploadFileToDrive/uploadFileToDriveFolder
// têm no lado Google.
export async function uploadFileToOneDrive(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  officeId: string
): Promise<{ id: string; webViewLink: string }> {
  const rootId = await getOrCreateRootFolder(officeId);
  return uploadBufferToFolder(fileName, mimeType, buffer, rootId, officeId);
}

// Baixa o conteúdo real de um arquivo do OneDrive — usado pelo envio de documentos por e-mail
// com anexo de verdade (ver lib/storageProvider.ts:downloadDriveFile). GET .../content redireciona
// para o blob de armazenamento real; fetch segue o redirect sozinho. O Graph normalmente devolve
// um Content-Type confiável nesse endpoint (ao contrário do Dropbox); mesmo assim o chamador
// (lib/actions/documentoEnvios.ts) tem uma inferência por extensão de arquivo como rede de
// segurança caso venha genérico.
export async function downloadFileFromOneDrive(fileId: string, officeId: string): Promise<{ content: Buffer; mimeType: string }> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await graphFetch(`/me/drive/items/${fileId}/content`, accessToken);
  if (!res.ok) throw new Error(`Falha ao baixar arquivo do OneDrive (${res.status}): ${await res.text()}`);
  const content = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "application/octet-stream";
  return { content, mimeType };
}

export async function deleteOneDriveFile(fileId: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await graphFetch(`/me/drive/items/${fileId}`, accessToken, { method: "DELETE" });
  if (!res.ok) throw new Error(`Falha ao excluir arquivo do OneDrive (${res.status}): ${await res.text()}`);
}

export async function renameOneDriveFolder(folderId: string, newName: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await graphFetch(`/me/drive/items/${folderId}`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(`Falha ao renomear pasta no OneDrive (${res.status}): ${await res.text()}`);
}

// "Mover" um arquivo no OneDrive é trocar o parentReference — igual ao Google Drive (trocar
// parents), só que o Graph aceita um único novo pai direto no PATCH, sem precisar ler o pai atual
// antes. Usado pela reorganização de anexos já existentes (lib/actions/driveReorg.ts).
export async function moveOneDriveFile(fileId: string, newParentId: string, officeId: string): Promise<void> {
  const accessToken = await getAccessTokenForOffice(officeId);
  const res = await graphFetch(`/me/drive/items/${fileId}`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: newParentId } }),
  });
  if (!res.ok) throw new Error(`Falha ao mover arquivo no OneDrive (${res.status}): ${await res.text()}`);
}
