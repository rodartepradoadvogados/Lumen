"use server";

// Ação administrativa avulsa e ÚNICA (roda uma vez por escritório, não é um cron), mesmo espírito
// de lib/actions/driveFolderMigration.ts (que já existe e serve de molde: etapa de conferência
// obrigatória antes de mexer em qualquer coisa). Cobre dois pontos que driveFolderMigration.ts
// não cobre:
//
//   (a) mover as nove raízes "Lúmen - *" que hoje nascem soltas direto em 'root' (ver
//       lib/googleDrive.ts:getOrCreateRootFolder) para dentro da nova pasta-mãe "Lúmen"
//       (GoogleCredential.rootFolderId) — mesmo desenho que OneDrive/Dropbox já usam;
//
//   (b) auditar as pastas antigas "RP Financeiro - *" (nome do produto antes de virar Lúmen):
//       para cada arquivo/pasta dentro delas, verifica se corresponde a um registro do sistema
//       (Case.driveFolderId, Attendance.driveFolderId, Assessoria.driveFolderId,
//       Parecer.driveFolderId, Attachment.storageFileId, AssessoriaDocumento.storageFileId). O
//       que casa, MOVE para o lugar certo dentro de "Lúmen". O que não casa, só RELATA — nunca
//       apaga nada (o dono do escritório acredita que nada ali é necessário, mas a decisão de
//       apagar de verdade é sempre humana, feita direto no Drive).
//
// Como em driveFolderMigration.ts: usa trashDriveFile (Lixeira, reversível por 30 dias) e NUNCA
// deleteDriveFile nesta migração — mesmo quando decide mover algo, o máximo que acontece com um
// item "no caminho" (ex.: pasta duplicada vazia no destino) é ir para a Lixeira, nunca some de
// vez.
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { naturezaOf } from "@/lib/caseNatureza";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import {
  hasPrimaryDriveCredential,
  listDriveChildren,
  moveDriveFile,
  trashDriveFile,
  extractDriveFileId,
  getLumenParentFolderId,
  getProcessosRootFolderId,
  getCasosRootFolderId,
  getAtendimentosRootFolderId,
  getAssessoriaRootFolderId,
  getAssessoriaPareceresContainerFolderId,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
  getOrCreateAssessoriaCompanyFolder,
  getOrCreateParecerFolder,
  ASSESSORIA_DOC_TYPE_FOLDERS,
  ALL_ROOT_FOLDER_NAMES,
  DRIVE_FOLDER_MIME_TYPE,
  type DriveChildEntry,
} from "@/lib/googleDrive";

type EntityKind = "CASE" | "ATTENDANCE" | "ASSESSORIA" | "PARECER" | "ATTACHMENT" | "ASSESSORIA_DOCUMENTO";

export type LumenMigrationMovedEntry = {
  kind: EntityKind;
  entityId: string;
  label: string; // título/assunto/nome da empresa ou do parecer/nome do anexo, pra exibir na tela
  driveFileId: string;
  path: string; // breadcrumb dentro da raiz legada, pra dar contexto no relatório
  action: "MOVER" | "CONFLITO";
  detail: string; // explicação em português, pro usuário ler
};

export type LumenMigrationUnmatchedEntry = {
  driveFileId: string;
  name: string;
  path: string;
  isFolder: boolean;
  webViewLink?: string | null;
};

export type LumenMigrationResult = {
  simulacao: boolean;
  raizesLumenEncontradasSoltas: string[]; // raízes "Lúmen - X" que estavam soltas em 'root'
  raizesLumenMovidas: string[]; // as que efetivamente foram movidas (só quando !simulacao)
  raizesLegadasEncontradas: string[]; // raízes "RP Financeiro - X" encontradas
  movidos: LumenMigrationMovedEntry[];
  naoIdentificados: LumenMigrationUnmatchedEntry[];
  truncado: boolean; // true se a varredura parou antes de terminar (proteção contra Drive gigante)
  totalMovidos: number;
  totalConflitos: number;
  totalNaoIdentificados: number;
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "erro desconhecido";
}

// Mesma ideia de normalizarNome em lib/actions/driveFolderMigration.ts (comparação de nome de
// pasta ignorando acento/caixa/espaço) — não importado de lá porque não é exportado; versão local
// enxuta, usada só para detectar duplicata homônima no destino antes de mover.
function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// ============ ETAPA (a): raízes "Lúmen - *" soltas em 'root' -> pasta-mãe "Lúmen" ============

async function encontrarRaizesLumenSoltas(officeId: string): Promise<DriveChildEntry[]> {
  const topLevel = await listDriveChildren(officeId, "root");
  return topLevel.filter((f) => f.mimeType === DRIVE_FOLDER_MIME_TYPE && ALL_ROOT_FOLDER_NAMES.includes(f.name));
}

async function moverRaizesLumenSoltas(officeId: string, soltas: DriveChildEntry[], simulacao: boolean): Promise<string[]> {
  if (simulacao || soltas.length === 0) return [];
  const parentId = await getLumenParentFolderId(officeId);
  const movidas: string[] = [];
  for (const f of soltas) {
    try {
      await moveDriveFile(f.id, parentId, officeId);
      movidas.push(f.name);
    } catch {
      // Uma raiz que falhar não derruba a migração das demais — fica solta pra ser tentada de
      // novo na próxima rodada (idempotente: rodar de novo não duplica nada).
    }
  }
  return movidas;
}

// ============ ETAPA (b): auditoria das raízes legadas "RP Financeiro - *" ============

async function encontrarRaizesLegadas(officeId: string): Promise<DriveChildEntry[]> {
  const topLevel = await listDriveChildren(officeId, "root");
  return topLevel.filter((f) => f.mimeType === DRIVE_FOLDER_MIME_TYPE && f.name.toLowerCase().startsWith("rp financeiro"));
}

type CaseRow = { id: string; title: string; type: string; driveFolderId: string | null };
type AttendanceRow = { id: string; subject: string; driveFolderId: string | null };
type AssessoriaRow = { id: string; driveFolderId: string | null; client: { name: string } };
type ParecerRow = { id: string; name: string; driveFolderId: string | null; assessoria: { client: { name: string } } };
type AttachmentRow = {
  id: string;
  name: string;
  storageFileId: string | null;
  driveUrl: string;
  storageProvider: string;
  docType: string;
  caseId: string | null;
  attendanceId: string | null;
  case: { title: string } | null;
  attendance: { subject: string } | null;
};
type AssessoriaDocRow = {
  id: string;
  name: string;
  storageFileId: string | null;
  driveUrl: string;
  storageProvider: string;
  docType: string;
  assessoriaId: string;
  parecerId: string | null;
  assessoria: { client: { name: string } };
  parecer: { name: string } | null;
};

type LegacyMaps = {
  caseById: Map<string, CaseRow>;
  attendanceById: Map<string, AttendanceRow>;
  assessoriaById: Map<string, AssessoriaRow>;
  parecerById: Map<string, ParecerRow>;
  attachmentByFileId: Map<string, AttachmentRow>;
  assessoriaDocByFileId: Map<string, AssessoriaDocRow>;
};

async function preloadMaps(officeId: string): Promise<LegacyMaps> {
  const [cases, attendances, assessorias, pareceres, attachments, assessoriaDocs] = await Promise.all([
    prisma.case.findMany({ where: { officeId, driveFolderId: { not: null } }, select: { id: true, title: true, type: true, driveFolderId: true } }),
    prisma.attendance.findMany({ where: { officeId, driveFolderId: { not: null } }, select: { id: true, subject: true, driveFolderId: true } }),
    prisma.assessoria.findMany({
      where: { officeId, driveFolderId: { not: null } },
      select: { id: true, driveFolderId: true, client: { select: { name: true } } },
    }),
    prisma.parecer.findMany({
      where: { officeId, driveFolderId: { not: null } },
      select: { id: true, name: true, driveFolderId: true, assessoria: { select: { client: { select: { name: true } } } } },
    }),
    prisma.attachment.findMany({
      where: { officeId },
      select: {
        id: true,
        name: true,
        storageFileId: true,
        driveUrl: true,
        storageProvider: true,
        docType: true,
        caseId: true,
        attendanceId: true,
        case: { select: { title: true } },
        attendance: { select: { subject: true } },
      },
    }),
    prisma.assessoriaDocumento.findMany({
      where: { officeId },
      select: {
        id: true,
        name: true,
        storageFileId: true,
        driveUrl: true,
        storageProvider: true,
        docType: true,
        assessoriaId: true,
        parecerId: true,
        assessoria: { select: { client: { select: { name: true } } } },
        parecer: { select: { name: true } },
      },
    }),
  ]);

  const caseById = new Map<string, CaseRow>();
  for (const c of cases) if (c.driveFolderId) caseById.set(c.driveFolderId, c);
  const attendanceById = new Map<string, AttendanceRow>();
  for (const a of attendances) if (a.driveFolderId) attendanceById.set(a.driveFolderId, a);
  const assessoriaById = new Map<string, AssessoriaRow>();
  for (const a of assessorias) if (a.driveFolderId) assessoriaById.set(a.driveFolderId, a);
  const parecerById = new Map<string, ParecerRow>();
  for (const p of pareceres) if (p.driveFolderId) parecerById.set(p.driveFolderId, p);

  // Attachment/AssessoriaDocumento: prioriza storageFileId; sem ele (registro pré-migração desse
  // campo), cai no id extraído da URL — mesmo fallback que
  // lib/actions/attachments.ts:deleteAttachment já usa, e só faz sentido pra GOOGLE_DRIVE
  // (storageProvider default de todo registro anterior a existir um segundo provedor).
  const attachmentByFileId = new Map<string, AttachmentRow>();
  for (const a of attachments) {
    const fid = a.storageFileId || (a.storageProvider === "GOOGLE_DRIVE" ? extractDriveFileId(a.driveUrl) : null);
    if (fid) attachmentByFileId.set(fid, a);
  }
  const assessoriaDocByFileId = new Map<string, AssessoriaDocRow>();
  for (const d of assessoriaDocs) {
    const fid = d.storageFileId || (d.storageProvider === "GOOGLE_DRIVE" ? extractDriveFileId(d.driveUrl) : null);
    if (fid) assessoriaDocByFileId.set(fid, d);
  }

  return { caseById, attendanceById, assessoriaById, parecerById, attachmentByFileId, assessoriaDocByFileId };
}

type Match =
  | { kind: "CASE"; id: string; label: string; folder: true; casoRaiz: "PROCESSOS" | "CASOS" }
  | { kind: "ATTENDANCE"; id: string; label: string; folder: true }
  | { kind: "ASSESSORIA"; id: string; label: string; folder: true }
  | { kind: "PARECER"; id: string; label: string; folder: true; companyName: string }
  | {
      kind: "ATTACHMENT";
      id: string;
      label: string;
      folder: false;
      caseId: string | null;
      caseTitle: string | null;
      attendanceId: string | null;
      attendanceSubject: string | null;
      docType: string;
    }
  | {
      kind: "ASSESSORIA_DOCUMENTO";
      id: string;
      label: string;
      folder: false;
      assessoriaId: string;
      companyName: string;
      parecerId: string | null;
      parecerName: string | null;
      docType: string;
    };

function matchItem(driveId: string, maps: LegacyMaps): Match | null {
  const c = maps.caseById.get(driveId);
  if (c) return { kind: "CASE", id: c.id, label: c.title, folder: true, casoRaiz: naturezaOf(c.type) === "CASO" ? "CASOS" : "PROCESSOS" };
  const a = maps.attendanceById.get(driveId);
  if (a) return { kind: "ATTENDANCE", id: a.id, label: a.subject, folder: true };
  const asr = maps.assessoriaById.get(driveId);
  if (asr) return { kind: "ASSESSORIA", id: asr.id, label: asr.client.name, folder: true };
  const p = maps.parecerById.get(driveId);
  if (p) return { kind: "PARECER", id: p.id, label: p.name, folder: true, companyName: p.assessoria.client.name };
  const att = maps.attachmentByFileId.get(driveId);
  if (att)
    return {
      kind: "ATTACHMENT",
      id: att.id,
      label: att.name,
      folder: false,
      caseId: att.caseId,
      caseTitle: att.case?.title ?? null,
      attendanceId: att.attendanceId,
      attendanceSubject: att.attendance?.subject ?? null,
      docType: att.docType,
    };
  const doc = maps.assessoriaDocByFileId.get(driveId);
  if (doc)
    return {
      kind: "ASSESSORIA_DOCUMENTO",
      id: doc.id,
      label: doc.name,
      folder: false,
      assessoriaId: doc.assessoriaId,
      companyName: doc.assessoria.client.name,
      parecerId: doc.parecerId,
      parecerName: doc.parecer?.name ?? null,
      docType: doc.docType,
    };
  return null;
}

// Pasta-alvo de um match de PASTA (Case/Attendance/Assessoria/Parecer) — só chama getters "raiz de
// sistema" (idempotentes: criam no máximo um container vazio, nunca tocam em conteúdo real), pelo
// mesmo motivo que lib/actions/driveFolderMigration.ts já chama getProcessosRootFolderId/
// getAtendimentosRootFolderId incondicionalmente: preparar o container de destino não é "mexer" no
// que já existe, mesmo durante a simulação.
async function targetParentForFolderMatch(match: Extract<Match, { folder: true }>, officeId: string): Promise<string> {
  switch (match.kind) {
    case "CASE":
      return match.casoRaiz === "CASOS" ? getCasosRootFolderId(officeId) : getProcessosRootFolderId(officeId);
    case "ATTENDANCE":
      return getAtendimentosRootFolderId(officeId);
    case "ASSESSORIA":
      return getAssessoriaRootFolderId(officeId);
    case "PARECER":
      return getAssessoriaPareceresContainerFolderId(match.companyName, officeId);
  }
}

// Move uma pasta identificada para o lugar certo, mas primeiro confere se já existe uma pasta
// homônima no destino (mesmo raciocínio de lib/actions/driveFolderMigration.ts): se existir E
// estiver vazia, manda a duplicada vazia pra Lixeira (reversível) e move a pasta real pro lugar
// dela; se existir E tiver conteúdo, marca CONFLITO e não mexe em nada — decisão humana.
async function moverPastaComDedupe(
  officeId: string,
  child: DriveChildEntry,
  path: string,
  simulacao: boolean,
  match: Extract<Match, { folder: true }>
): Promise<LumenMigrationMovedEntry> {
  const base = { kind: match.kind, entityId: match.id, label: match.label, driveFileId: child.id, path };
  const targetParentId = await targetParentForFolderMatch(match, officeId);
  const irmas = await listDriveChildren(officeId, targetParentId);
  const homonima = irmas.find((f) => f.mimeType === DRIVE_FOLDER_MIME_TYPE && f.id !== child.id && normalizarNome(f.name) === normalizarNome(child.name));

  if (homonima) {
    const conteudo = await listDriveChildren(officeId, homonima.id);
    if (conteudo.length === 0) {
      if (!simulacao) {
        await trashDriveFile(homonima.id, officeId);
        await moveDriveFile(child.id, targetParentId, officeId);
      }
      return {
        ...base,
        action: "MOVER",
        detail: `Existe uma pasta duplicada VAZIA ("${homonima.name}") no destino — ${
          simulacao ? "será enviada" : "foi enviada"
        } à Lixeira e esta pasta ${simulacao ? "será movida" : "foi movida"} para o lugar dela.`,
      };
    }
    return {
      ...base,
      action: "CONFLITO",
      detail: `Existe uma pasta com o mesmo nome ("${homonima.name}", id ${homonima.id}) no destino, e ela TEM conteúdo (${conteudo.length} item(ns)) — não é seguro decidir automaticamente qual manter. Confira as duas pastas no Drive e mescle manualmente antes de rodar esta ação de novo.`,
    };
  }

  if (!simulacao) await moveDriveFile(child.id, targetParentId, officeId);
  return {
    ...base,
    action: "MOVER",
    detail: simulacao ? "Nenhuma pasta duplicada no destino — será movida diretamente para lá." : "Movida para o lugar correto dentro de \"Lúmen\".",
  };
}

// Descreve em palavras onde um match de ARQUIVO (Attachment/AssessoriaDocumento) iria parar, SEM
// chamar nenhum getOrCreate* — ao contrário dos matches de pasta acima, resolver o destino de um
// arquivo pode exigir criar a pasta do PRÓPRIO processo/atendimento/parecer (não só um container
// raiz vazio), o que já conta como "mexer" — evitado de propósito durante a simulação.
function describeFileTarget(match: Extract<Match, { folder: false }>): string {
  if (match.kind === "ATTACHMENT") {
    if (match.caseTitle) return `pasta do processo/caso "${match.caseTitle}" (categoria "${getDocumentTypeLabel(match.docType)}")`;
    if (match.attendanceSubject) return `pasta do atendimento "${match.attendanceSubject}" (categoria "${getDocumentTypeLabel(match.docType)}")`;
    return "não identificado (o anexo não está vinculado a processo nem atendimento)";
  }
  if (match.parecerName) return `pasta do parecer "${match.parecerName}" (empresa "${match.companyName}")`;
  const subName = ASSESSORIA_DOC_TYPE_FOLDERS[match.docType];
  return subName ? `pasta "${match.companyName} / ${subName}"` : `pasta da empresa "${match.companyName}"`;
}

// Resolve (e, se preciso, CRIA) o destino real de um match de ARQUIVO — só chamado quando
// !simulacao, depois da conferência já ter sido aceita.
async function resolveFileTarget(match: Extract<Match, { folder: false }>, officeId: string): Promise<string | null> {
  if (match.kind === "ATTACHMENT") {
    if (match.caseId && match.caseTitle) {
      const containerId = await getOrCreateCaseFolder(match.caseId, match.caseTitle, officeId);
      return getOrCreateCategoryFolder(containerId, getDocumentTypeLabel(match.docType), officeId);
    }
    if (match.attendanceId && match.attendanceSubject) {
      const containerId = await getOrCreateAttendanceFolder(match.attendanceId, match.attendanceSubject, officeId);
      return getOrCreateCategoryFolder(containerId, getDocumentTypeLabel(match.docType), officeId);
    }
    return null;
  }
  if (match.parecerId && match.parecerName) {
    return getOrCreateParecerFolder(match.parecerId, match.companyName, match.parecerName, officeId);
  }
  const companyFolderId = await getOrCreateAssessoriaCompanyFolder(match.companyName, officeId);
  const subName = ASSESSORIA_DOC_TYPE_FOLDERS[match.docType];
  return subName ? getOrCreateCategoryFolder(companyFolderId, subName, officeId) : companyFolderId;
}

const MAX_ITEMS = 4000; // proteção contra um Drive gigante — evita a ação rodar por tempo indefinido
const MAX_DEPTH = 12;

type AuditContext = {
  movidos: LumenMigrationMovedEntry[];
  naoIdentificados: LumenMigrationUnmatchedEntry[];
  itemCount: number;
  truncado: boolean;
};

// Varre recursivamente uma pasta legada — quando um filho CASA com um registro do sistema, move o
// item inteiro (pasta ou arquivo) e NÃO desce mais dentro dele (o subtree inteiro já foi
// "resolvido" ao mover o pai). Quando não casa e é pasta, desce um nível pra procurar dentro; se
// for arquivo, é relatado como não identificado — nunca apagado, nunca movido "no achismo".
async function auditarPasta(
  officeId: string,
  folderId: string,
  path: string,
  depth: number,
  simulacao: boolean,
  maps: LegacyMaps,
  ctx: AuditContext
): Promise<void> {
  if (ctx.truncado) return;
  if (depth > MAX_DEPTH) {
    ctx.naoIdentificados.push({ driveFileId: folderId, name: `${path} (parou: profundidade máxima)`, path, isFolder: true, webViewLink: null });
    return;
  }

  let children: DriveChildEntry[];
  try {
    children = await listDriveChildren(officeId, folderId);
  } catch (e) {
    ctx.naoIdentificados.push({ driveFileId: folderId, name: `${path} (falha ao ler esta pasta: ${msg(e)})`, path, isFolder: true, webViewLink: null });
    return;
  }

  for (const child of children) {
    if (ctx.itemCount >= MAX_ITEMS) {
      ctx.truncado = true;
      return;
    }
    ctx.itemCount++;
    const childPath = `${path}/${child.name}`;
    const isFolder = child.mimeType === DRIVE_FOLDER_MIME_TYPE;
    const match = matchItem(child.id, maps);

    if (match) {
      try {
        if (match.folder) {
          if (!isFolder) throw new Error("registro do sistema aponta para uma pasta, mas o item encontrado é um arquivo — inconsistência inesperada");
          const entry = await moverPastaComDedupe(officeId, child, childPath, simulacao, match);
          ctx.movidos.push(entry);
        } else {
          const base = { kind: match.kind, entityId: match.id, label: match.label, driveFileId: child.id, path: childPath };
          if (simulacao) {
            ctx.movidos.push({ ...base, action: "MOVER", detail: `Será movido para a ${describeFileTarget(match)}.` });
          } else {
            const targetFolderId = await resolveFileTarget(match, officeId);
            if (!targetFolderId) {
              ctx.naoIdentificados.push({
                driveFileId: child.id,
                name: `${child.name} (registrado no sistema, mas sem processo/atendimento vinculado — destino ambíguo)`,
                path: childPath,
                isFolder: false,
                webViewLink: child.webViewLink,
              });
            } else {
              await moveDriveFile(child.id, targetFolderId, officeId);
              ctx.movidos.push({ ...base, action: "MOVER", detail: `Movido para a ${describeFileTarget(match)}.` });
            }
          }
        }
      } catch (e) {
        ctx.movidos.push({
          kind: match.kind,
          entityId: match.id,
          label: match.label,
          driveFileId: child.id,
          path: childPath,
          action: "CONFLITO",
          detail: `Erro ao mover: ${msg(e)}. Nenhuma alteração foi feita neste item — verifique manualmente.`,
        });
      }
      continue; // subtree já resolvido junto com o pai — não desce mais
    }

    if (isFolder) {
      await auditarPasta(officeId, child.id, childPath, depth + 1, simulacao, maps, ctx);
    } else {
      ctx.naoIdentificados.push({ driveFileId: child.id, name: child.name, path: childPath, isFolder: false, webViewLink: child.webViewLink });
    }
  }
}

// Ponto de entrada. `simulacao: true` (padrão de uso: primeiro clique) só LISTA o que seria feito,
// sem mover nada nem apagar nada — nem sequer manda a Lixeira nenhuma duplicada vazia. Só com
// `simulacao: false` (segundo clique, depois de o usuário conferir o resultado da simulação) as
// ações de fato acontecem. Mesmo contrato de lib/actions/driveFolderMigration.ts:migrarPastasLegadasDoDrive.
export async function migrarPastaMaeLumen(simulacao: boolean): Promise<LumenMigrationResult | { error: string }> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };

  const officeId = user.officeId;
  const connected = await hasPrimaryDriveCredential(officeId);
  if (!connected) {
    return { error: "Google Drive não está conectado para este escritório. Vá em Configurações e conecte a conta do Google antes de rodar esta ação." };
  }

  const raizesLumenSoltas = await encontrarRaizesLumenSoltas(officeId);
  const raizesLumenMovidas = await moverRaizesLumenSoltas(officeId, raizesLumenSoltas, simulacao);

  const raizesLegadas = await encontrarRaizesLegadas(officeId);
  const maps = await preloadMaps(officeId);

  const ctx: AuditContext = { movidos: [], naoIdentificados: [], itemCount: 0, truncado: false };
  for (const raiz of raizesLegadas) {
    await auditarPasta(officeId, raiz.id, raiz.name, 0, simulacao, maps, ctx);
  }

  return {
    simulacao,
    raizesLumenEncontradasSoltas: raizesLumenSoltas.map((r) => r.name),
    raizesLumenMovidas,
    raizesLegadasEncontradas: raizesLegadas.map((r) => r.name),
    movidos: ctx.movidos,
    naoIdentificados: ctx.naoIdentificados,
    truncado: ctx.truncado,
    totalMovidos: ctx.movidos.filter((m) => m.action === "MOVER").length,
    totalConflitos: ctx.movidos.filter((m) => m.action === "CONFLITO").length,
    totalNaoIdentificados: ctx.naoIdentificados.length,
  };
}
