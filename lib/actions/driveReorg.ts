"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { extractDriveFileId, ASSESSORIA_DOC_TYPE_FOLDERS, getDriveFileInfo } from "@/lib/googleDrive";
import {
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
  getOrCreateAssessoriaCompanyFolder,
  getOrCreateParecerFolder,
  getOrCreateLicitacaoFolder,
  getOrCreateLicitacaoDemandaFolder,
  moveDriveFile,
} from "@/lib/storageProvider";
import { getDocumentTypeLabel } from "@/lib/documentTypes";

export type ReorgResult = { moved: number; skipped: number; errors: string[] };

// A QUEM o documento pertence. Era uma frase só — "Título → Categoria" — e o dono apontou o
// efeito em 2026-09-16: numa lista com dezenas de linhas, todo texto fica parecido e não dá para
// saber de que processo se trata. Agora é estrutura, e a tela agrupa por ela, com um cabeçalho
// que identifica o registro do jeito que um advogado identifica: nome, número, tribunal, cliente.
export type ReorgContexto = {
  // Chave de agrupamento — uma seção da tela por valor distinto.
  chave: string;
  // "Processo judicial", "Caso", "Atendimento", "Licitação", "Demanda (parecer)", "Assessoria"
  tipo: string;
  titulo: string;
  numero?: string;
  tribunal?: string;
  cliente?: string;
  // Empresa da Assessoria, quando o registro pertence a uma.
  empresa?: string;
  // Caminho de pasta DENTRO do registro (ex.: "Petições"). O que era o resto da frase.
  pasta: string;
};

export type ReorgPlanItem = {
  kind: "ATTACHMENT" | "ASSESSORIA_DOCUMENTO";
  id: string;
  name: string;
  fileId: string;
  targetFolderId: string;
  contexto: ReorgContexto;
};

export type ReorgPlan = { itens: ReorgPlanItem[]; naoMovivel: number } | { error: string };

// Cache de pastas já resolvidas nesta execução do plano — vários Attachment/AssessoriaDocumento
// costumam apontar para o mesmo processo/atendimento/empresa/licitação, e sem isso cada um
// disparava sua própria cadeia de chamadas ao Drive (getOrCreateCaseFolder etc., cada uma com
// sua checagem de auto-cura) mesmo quando o resultado seria idêntico ao do item anterior. Guarda
// a Promise (não só o resultado) para também deduplicar chamadas concorrentes com a mesma chave.
type FolderCache = Map<string, Promise<string>>;
function cachedFolder(cache: FolderCache, key: string, compute: () => Promise<string>): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = compute();
    cache.set(key, p);
  }
  return p;
}

// Roda `fn` sobre `items` com no máximo `limite` chamadas em voo ao mesmo tempo — reduz o tempo
// total (as chamadas ao Drive são round-trips de rede, ficam a maior parte do tempo só esperando)
// sem disparar tudo de uma vez, o que estouraria limite de taxa da API do Google Drive.
async function mapComConcorrencia<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let proximo = 0;
  async function worker() {
    for (;;) {
      const i = proximo++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return results;
}
const CONCORRENCIA_DRIVE = 6;

// A língua do advogado, não a do banco. Mesmo vocabulário de NATUREZA_LABELS em lib/natureza.ts.
const NATUREZA_CONTEXTO: Record<string, string> = {
  JUDICIAL: "Processo judicial",
  ADMINISTRATIVO: "Processo administrativo",
  EXTRAJUDICIAL: "Caso",
  ATENDIMENTO: "Atendimento",
  CONSULTIVO: "Caso consultivo",
};

async function resolverDestinoAttachment(
  att: {
    id: string;
    name: string;
    docType: string;
    driveUrl: string;
    storageFileId: string | null;
    taskId: string | null;
    case: {
      id: string;
      title: string;
      type: string;
      processNumber: string | null;
      court: string | null;
      tribunalSigla: string | null;
      client: { name: string } | null;
    } | null;
    attendance: { id: string; subject: string; clientName: string } | null;
    licitacao: {
      id: string;
      nome: string | null;
      objeto: string;
      modalidade: string | null;
      orgao: string;
      assessoria: { client: { name: string } };
    } | null;
    task: { id: string; title: string } | null;
  },
  officeId: string,
  cache: FolderCache
): Promise<{ fileId: string; targetFolderId: string; contexto: ReorgContexto } | null> {
  // Correção de 05/09/2026 (docs/auditoria-pastas-drive-2026-09.md, achado P0): Attachment de
  // Licitação usa storageFileId — extractDriveFileId (regex de URL do Google) nunca funcionou
  // para quem já enviou pelo Drive novo (URLs não têm mais o id no formato antigo) nem para
  // OneDrive/Dropbox. Tenta storageFileId primeiro, cai pro regex só pra Attachment bem antigo.
  const fileId = att.storageFileId || extractDriveFileId(att.driveUrl);
  if (!fileId) return null;
  if (att.case) {
    const containerFolderId = await cachedFolder(cache, `case:${att.case.id}`, () => getOrCreateCaseFolder(att.case!.id, att.case!.title, officeId));
    const categoryLabel = getDocumentTypeLabel(att.docType);
    const targetFolderId = await cachedFolder(cache, `case:${att.case.id}:cat:${categoryLabel}`, () => getOrCreateCategoryFolder(containerFolderId, categoryLabel, officeId));
    return {
      fileId,
      targetFolderId,
      contexto: {
        chave: `case:${att.case.id}`,
        tipo: NATUREZA_CONTEXTO[att.case.type] ?? "Processo",
        titulo: att.case.title,
        numero: att.case.processNumber ?? undefined,
        tribunal: att.case.tribunalSigla || att.case.court || undefined,
        cliente: att.case.client?.name ?? undefined,
        pasta: categoryLabel,
      },
    };
  }
  if (att.attendance) {
    const containerFolderId = await cachedFolder(cache, `attendance:${att.attendance.id}`, () => getOrCreateAttendanceFolder(att.attendance!.id, att.attendance!.subject, officeId));
    const categoryLabel = getDocumentTypeLabel(att.docType);
    const targetFolderId = await cachedFolder(cache, `attendance:${att.attendance.id}:cat:${categoryLabel}`, () => getOrCreateCategoryFolder(containerFolderId, categoryLabel, officeId));
    return {
      fileId,
      targetFolderId,
      contexto: {
        chave: `attendance:${att.attendance.id}`,
        tipo: "Atendimento",
        titulo: att.attendance.subject,
        cliente: att.attendance.clientName,
        pasta: categoryLabel,
      },
    };
  }
  if (att.licitacao) {
    const companyName = att.licitacao.assessoria.client.name;
    const licitacaoNome = att.licitacao.nome || att.licitacao.objeto;
    if (att.task) {
      const targetFolderId = await cachedFolder(cache, `licitacao:${att.licitacao.id}:task:${att.task.id}`, () =>
        getOrCreateLicitacaoDemandaFolder(att.task!.id, att.licitacao!.id, companyName, licitacaoNome, att.task!.title, officeId)
      );
      return {
        fileId,
        targetFolderId,
        contexto: {
          chave: `licitacao:${att.licitacao.id}:task:${att.task.id}`,
          tipo: "Demanda de licitação",
          titulo: att.task.title,
          numero: att.licitacao.modalidade ?? undefined,
          tribunal: att.licitacao.orgao,
          empresa: companyName,
          cliente: companyName,
          pasta: `Licitações → ${licitacaoNome}`,
        },
      };
    }
    const targetFolderId = await cachedFolder(cache, `licitacao:${att.licitacao.id}`, () => getOrCreateLicitacaoFolder(att.licitacao!.id, companyName, licitacaoNome, officeId));
    return {
      fileId,
      targetFolderId,
      contexto: {
        chave: `licitacao:${att.licitacao.id}`,
        tipo: "Licitação",
        titulo: licitacaoNome,
        numero: att.licitacao.modalidade ?? undefined,
        tribunal: att.licitacao.orgao,
        empresa: companyName,
        cliente: companyName,
        pasta: "Licitações",
      },
    };
  }
  return null;
}

async function resolverDestinoAssessoriaDocumento(
  doc: {
    id: string;
    name: string;
    docType: string;
    driveUrl: string;
    storageFileId: string | null;
    parecerId: string | null;
    assessoria: { client: { name: string } };
    parecer: { id: string; name: string } | null;
  },
  officeId: string,
  cache: FolderCache
): Promise<{ fileId: string; targetFolderId: string; contexto: ReorgContexto } | null> {
  const fileId = doc.storageFileId || extractDriveFileId(doc.driveUrl);
  if (!fileId) return null;
  const companyName = doc.assessoria.client.name;
  if (doc.parecer) {
    const targetFolderId = await cachedFolder(cache, `parecer:${doc.parecerId}`, () => getOrCreateParecerFolder(doc.parecerId!, companyName, doc.parecer!.name, officeId));
    return {
      fileId,
      targetFolderId,
      contexto: {
        chave: `parecer:${doc.parecerId}`,
        tipo: "Demanda (parecer)",
        titulo: doc.parecer.name,
        empresa: companyName,
        cliente: companyName,
        pasta: "Pareceres",
      },
    };
  }
  const companyFolderId = await cachedFolder(cache, `assessoria:${companyName}`, () => getOrCreateAssessoriaCompanyFolder(companyName, officeId));
  // OUTRO/ACAO_VINCULADA não têm subpasta própria por desenho (ver lib/googleDrive.ts,
  // ASSESSORIA_DOC_TYPE_FOLDERS) — ficam soltos na raiz da empresa, de propósito.
  const subName = ASSESSORIA_DOC_TYPE_FOLDERS[doc.docType];
  const targetFolderId = subName
    ? await cachedFolder(cache, `assessoria:${companyName}:cat:${subName}`, () => getOrCreateCategoryFolder(companyFolderId, subName, officeId))
    : companyFolderId;
  return {
    fileId,
    targetFolderId,
    contexto: {
      chave: `assessoria:${companyName}`,
      tipo: "Assessoria jurídica",
      titulo: companyName,
      empresa: companyName,
      cliente: companyName,
      pasta: subName ?? "Raiz da empresa",
    },
  };
}

// Monta o plano do que a reorganização mudaria — SEM mover nada. Cada item que já está na pasta
// certa fica de fora (pedido: "o que já está no lugar certo não precisa aparecer"); essa
// checagem só é possível no Google Drive (getDriveFileInfo lê os parents atuais do arquivo, sem
// equivalente hoje no dispatcher multi-provedor) — em OneDrive/Dropbox o item entra no plano
// mesmo que já esteja correto (mover um arquivo pro parent que ele já tem é inofensivo, só
// reafirma; só não dá pra pré-filtrar como "já certo" com a mesma precisão do Google).
export async function planoReorganizacao(): Promise<ReorgPlan> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };
  const officeId = user.officeId;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } });
  const podeChecarJaCorreto = office?.storageProvider === "GOOGLE_DRIVE";

  const [attachments, documentos] = await Promise.all([
    prisma.attachment.findMany({
      where: { officeId, OR: [{ caseId: { not: null } }, { attendanceId: { not: null } }, { licitacaoId: { not: null } }] },
      include: {
        case: { select: { id: true, title: true, type: true, processNumber: true, court: true, tribunalSigla: true, client: { select: { name: true } } } },
        attendance: { select: { id: true, subject: true, clientName: true } },
        licitacao: { select: { id: true, nome: true, objeto: true, modalidade: true, orgao: true, assessoria: { select: { client: { select: { name: true } } } } } },
        task: { select: { id: true, title: true } },
      },
    }),
    prisma.assessoriaDocumento.findMany({
      where: { officeId },
      include: { assessoria: { select: { client: { select: { name: true } } } }, parecer: { select: { id: true, name: true } } },
    }),
  ]);

  // Correção de 05/09/2026: os dois laços abaixo rodavam sequencialmente, um item de cada vez —
  // cada item podia disparar de 1 a 3 round-trips ao Drive (resolver pasta + getDriveFileInfo),
  // e em escritórios com muitos documentos isso estourava os 300s de execução da função (erro
  // "Task timed out after 300 seconds" visto em produção). `mapComConcorrencia` processa vários
  // itens por vez (rede é majoritariamente espera) e `cache` evita refazer a mesma resolução de
  // pasta para itens do mesmo processo/atendimento/empresa/licitação.
  const cache: FolderCache = new Map();
  type Resolvido = { item: ReorgPlanItem | null; naoMovivel: boolean };

  const [attResultados, docResultados] = await Promise.all([
    mapComConcorrencia(attachments, CONCORRENCIA_DRIVE, async (att): Promise<Resolvido> => {
      const resolved = await resolverDestinoAttachment(att, officeId, cache);
      if (!resolved) return { item: null, naoMovivel: true };
      if (podeChecarJaCorreto) {
        const info = await getDriveFileInfo(resolved.fileId, officeId);
        if (!info || info.parents.includes(resolved.targetFolderId)) return { item: null, naoMovivel: false }; // já correto, ou some do Drive (nada a mover)
      }
      return { item: { kind: "ATTACHMENT", id: att.id, name: att.name, fileId: resolved.fileId, targetFolderId: resolved.targetFolderId, contexto: resolved.contexto }, naoMovivel: false };
    }),
    mapComConcorrencia(documentos, CONCORRENCIA_DRIVE, async (doc): Promise<Resolvido> => {
      const resolved = await resolverDestinoAssessoriaDocumento(doc, officeId, cache);
      if (!resolved) return { item: null, naoMovivel: true };
      if (podeChecarJaCorreto) {
        const info = await getDriveFileInfo(resolved.fileId, officeId);
        if (!info || info.parents.includes(resolved.targetFolderId)) return { item: null, naoMovivel: false };
      }
      return { item: { kind: "ASSESSORIA_DOCUMENTO", id: doc.id, name: doc.name, fileId: resolved.fileId, targetFolderId: resolved.targetFolderId, contexto: resolved.contexto }, naoMovivel: false };
    }),
  ]);

  const itens: ReorgPlanItem[] = [];
  let naoMovivel = 0;
  for (const r of [...attResultados, ...docResultados]) {
    if (r.naoMovivel) naoMovivel++;
    else if (r.item) itens.push(r.item);
  }

  return { itens, naoMovivel };
}

// Aplica só os itens marcados (checkbox) na tela — recebe de volta o `fileId`/`targetFolderId`
// já resolvidos pelo plano, sem precisar re-resolver nada: o plano é a fonte da verdade do que
// será feito, o operador só decide QUAIS linhas dele valem.
export async function aplicarReorganizacaoSelecionada(
  itens: { kind: "ATTACHMENT" | "ASSESSORIA_DOCUMENTO"; id: string; fileId: string; targetFolderId: string }[]
): Promise<ReorgResult> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { moved: 0, skipped: 0, errors: ["Apenas administradores podem rodar esta ação."] };

  let moved = 0;
  const errors: string[] = [];
  for (const item of itens) {
    try {
      await moveDriveFile(item.fileId, item.targetFolderId, user.officeId);
      moved++;
    } catch (e) {
      errors.push(`${item.id}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }
  return { moved, skipped: 0, errors };
}
