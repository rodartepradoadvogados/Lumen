"use server";

// Reconciliação de anexos com o conteúdo REAL de uma pasta do Google Drive — cobre a lacuna
// confirmada por auditoria em "Reorganizar anexos existentes no Drive" (lib/actions/driveReorg.ts):
// aquela tela só confere se um Attachment/AssessoriaDocumento já cadastrado está na pasta certa,
// nunca lista o que de fato existe dentro da pasta. Quem substitui um documento diretamente no
// Drive (apaga o antigo, sobe um novo com nome parecido) fora do Lúmen não era percebido de jeito
// nenhum: o arquivo antigo "sumido" era tratado como "já está certo, nada a fazer" e o arquivo
// novo, por nunca ter virado registro no banco, nunca era varrido por aquela action.
//
// Esta reconciliação varre o conteúdo de UMA pasta por vez (de um processo/caso, atendimento,
// licitação, demanda ou da raiz de documentos gerais de uma assessoria) e cruza com o banco:
//   - um Attachment/AssessoriaDocumento cujo arquivo sumiu da pasta + um arquivo novo, sem vínculo,
//     de nome parecido (≥60%, ver lib/nameSimilarity.ts) → "SUBSTITUICAO": provável mesmo
//     documento, atualizado por fora.
//   - um arquivo novo sem nenhum par parecido → "NOVO": pede pra decidir (adicionar ou substituir
//     algum já cadastrado).
//   - um Attachment/AssessoriaDocumento cujo arquivo sumiu, sem nenhum novo parecido pra casar →
//     "SUMIDO": pede pra decidir (desvincular ou apontar pra outro arquivo).
//
// Escopo Google Drive apenas — nenhuma das operações abaixo (listar conteúdo de pasta, restaurar
// da Lixeira) tem equivalente hoje em lib/oneDriveStorage.ts/lib/dropboxStorage.ts (mesma fronteira
// já aceita por outras ferramentas de manutenção do Drive, ver lib/actions/driveFolderMigration.ts).
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { getStorageProvider } from "@/lib/storageProvider";
import {
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateLicitacaoFolder,
  getOrCreateLicitacaoDemandaFolder,
  getOrCreateAssessoriaCompanyFolderCached,
  ASSESSORIA_DOC_TYPE_FOLDERS,
  DRIVE_FOLDER_MIME_TYPE,
  listDriveChildren,
  getDriveFileInfo,
  restoreDriveFile,
  deleteDriveFile,
  extractDriveFileId,
  translateDriveError,
  type DriveChildEntry,
} from "@/lib/googleDrive";
import { isReservedCaseSubfolder } from "@/lib/protocolos";
import { DOCUMENT_TYPES, getDocumentTypeLabel } from "@/lib/documentTypes";
import { similarity, SIMILARITY_THRESHOLD } from "@/lib/nameSimilarity";
import { deleteAttachment } from "@/lib/actions/attachments";
import { deleteDocumento } from "@/lib/actions/assessoria";

export type RecordKind = "ATTACHMENT" | "ASSESSORIA_DOCUMENTO";

export type ReconciliationScope =
  | { kind: "CASE"; caseId: string }
  | { kind: "ATTENDANCE"; attendanceId: string }
  // taskId ausente = pasta GERAL da licitação; presente = pasta de UMA demanda específica.
  | { kind: "LICITACAO"; licitacaoId: string; taskId?: string | null }
  | { kind: "ASSESSORIA"; assessoriaId: string };

export type DriveFileRef = { fileId: string; name: string; webViewLink: string };

export type PendenciaSubstituicao = {
  tipo: "SUBSTITUICAO";
  recordKind: RecordKind;
  recordId: string;
  subpasta: string | null;
  antigo: { fileId: string; name: string; trashed: "lixeira" | "definitivo" | null };
  novo: DriveFileRef;
  similaridade: number;
};
export type PendenciaNovo = {
  tipo: "NOVO";
  subpasta: string | null;
  arquivo: DriveFileRef;
  melhorSemelhanca: number;
  // Tipo de documento que a pasta física (subpasta de categoria, ou as 4 curadas da Assessoria)
  // ou o histórico da entidade (Licitação/Demanda/resto da Assessoria) sugere para este arquivo —
  // null quando não há nenhum sinal confiável (ex.: subpasta com nome de tipo criado pelo próprio
  // escritório, sem entrada no catálogo). A UI só avisa de incompatibilidade quando o tipo
  // escolhido pelo usuário diverge de uma sugestão não-nula — nunca "adivinha errado".
  tipoSugeridoKey: string | null;
  tipoSugeridoLabel: string | null;
};
export type PendenciaSumido = {
  tipo: "SUMIDO";
  recordKind: RecordKind;
  recordId: string;
  subpasta: string | null;
  nome: string;
  fileId: string;
  trashed: "lixeira" | "definitivo" | null;
};
export type Pendencia = PendenciaSubstituicao | PendenciaNovo | PendenciaSumido;

export type RegistroExistente = { recordKind: RecordKind; recordId: string; name: string };

export type EntidadePlano = {
  scope: ReconciliationScope;
  entidadeLabel: string;
  tipoPredominante: string | null;
  pendencias: Pendencia[];
  // Anexos/documentos JÁ cadastrados nesta entidade — usado pela tela pra montar a lista de
  // "substituir um documento existente" quando o arquivo novo não tem par óbvio (pendência NOVO).
  registros: RegistroExistente[];
};

// Roda `fn` sobre `items` com no máximo `limite` chamadas em voo — mesmo padrão (e mesmo motivo:
// não estourar cota de taxa da API do Drive) já usado, cada um com sua própria cópia local, em
// lib/actions/driveReorg.ts e lib/driveSync.ts.
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
const CONCORRENCIA_DRIVE = 5;

const ASSESSORIA_CURATED_LABELS = new Set(Object.values(ASSESSORIA_DOC_TYPE_FOLDERS));

// Reverso de ASSESSORIA_DOC_TYPE_FOLDERS ("Contratos" -> "CONTRATO") e "nome exato da subpasta de
// categoria" -> key do tipo (mesma ideia de CATEGORY_LABEL_TO_KEY em lib/driveSync.ts, cópia local
// de propósito — arquivo diferente, mesmo raciocínio) — usados só para SUGERIR um tipo de
// documento a partir de onde o arquivo foi encontrado, nunca para decidir nada sozinhos.
const ASSESSORIA_FOLDER_TO_KEY = new Map(Object.entries(ASSESSORIA_DOC_TYPE_FOLDERS).map(([key, label]) => [label, key]));
const CATEGORY_LABEL_TO_KEY = new Map(DOCUMENT_TYPES.map((t) => [t.label, t.key]));

// Tipo de documento sugerido para um arquivo "novo" (órfão) a partir de onde ele foi encontrado —
// devolve null sempre que o sinal não for confiável (subpasta com nome de tipo criado pelo próprio
// escritório, sem entrada no catálogo nativo; ou nenhum documento anterior para comparar).
function sugerirTipo(ctx: ContextoEscopo, subpasta: string | null): { key: string; label: string } | null {
  if (subpasta) {
    const key = ctx.temSubpasta === "hibrido" ? ASSESSORIA_FOLDER_TO_KEY.get(subpasta) : CATEGORY_LABEL_TO_KEY.get(subpasta);
    return key ? { key, label: getDocumentTypeLabel(key) } : null;
  }
  return ctx.tipoPredominante ? { key: ctx.tipoPredominante, label: getDocumentTypeLabel(ctx.tipoPredominante) } : null;
}

function driveFileUrl(id: string, webViewLink?: string | null): string {
  return webViewLink || `https://drive.google.com/file/d/${id}/view`;
}

// Tipo mais frequente entre os docTypes já cadastrados numa entidade sem subpasta por tipo
// (Licitação/Demanda/raiz de Assessoria) — único sinal disponível ali pra desconfiar de um tipo
// escolhido manualmente que destoa do resto. A checagem em si (comparar com este valor, ou com o
// nome da subpasta física quando ela existe) é decidida na UI (components/DriveReconciliationModal.tsx)
// como confirmação, não como regra de servidor — o valor aqui só informa a tela.
function tipoMaisFrequente(docTypes: string[]): string | null {
  if (docTypes.length === 0) return null;
  const contagem = new Map<string, number>();
  for (const t of docTypes) contagem.set(t, (contagem.get(t) ?? 0) + 1);
  let melhor: string | null = null;
  let melhorContagem = 0;
  for (const [tipo, n] of contagem) {
    if (n > melhorContagem) {
      melhor = tipo;
      melhorContagem = n;
    }
  }
  return melhor;
}

type RegistroConhecido = { recordKind: RecordKind; recordId: string; name: string; fileId: string | null; subpasta: string | null };
// Mesmo formato, mas com fileId já confirmado (não-nulo) — usado depois do filtro que descarta
// registros sem nenhum jeito de achar o arquivo no Drive (link colado de outro serviço).
type RegistroComArquivo = RegistroConhecido & { fileId: string };

type ContextoEscopo = {
  rootFolderId: string;
  // true: subpasta física = tipo do documento (Processo/Atendimento). false: tudo solto, sem
  // subpasta (Licitação/Demanda). "hibrido": só 4 categorias curadas têm subpasta própria
  // (Assessoria geral) — ver ASSESSORIA_DOC_TYPE_FOLDERS.
  temSubpasta: true | false | "hibrido";
  entidadeLabel: string;
  conhecidos: RegistroConhecido[];
  tipoPredominante: string | null;
};

// Resolve a pasta-raiz, os registros já cadastrados e o "tipo predominante" (quando aplicável) de
// UM escopo — usado tanto pela reconciliação de uma pasta só (planoReconciliacaoEntidade) quanto,
// em loop, pela reconciliação do escritório inteiro (planoReconciliacaoEscritorio).
async function resolverContexto(scope: ReconciliationScope, officeId: string): Promise<ContextoEscopo | { error: string }> {
  if (scope.kind === "CASE") {
    const c = await prisma.case.findFirst({ where: { id: scope.caseId, officeId }, select: { id: true, title: true } });
    if (!c) return { error: "Processo não encontrado." };
    const rootFolderId = await getOrCreateCaseFolder(c.id, c.title, officeId);
    const attachments = await prisma.attachment.findMany({
      where: { caseId: c.id, officeId },
      select: { id: true, name: true, storageFileId: true, driveUrl: true, docType: true },
    });
    const conhecidos: RegistroConhecido[] = attachments.map((a) => ({
      recordKind: "ATTACHMENT",
      recordId: a.id,
      name: a.name,
      fileId: a.storageFileId || extractDriveFileId(a.driveUrl),
      subpasta: getDocumentTypeLabel(a.docType),
    }));
    return {
      rootFolderId,
      temSubpasta: true,
      entidadeLabel: c.title,
      conhecidos,
      tipoPredominante: null,
    };
  }

  if (scope.kind === "ATTENDANCE") {
    const a = await prisma.attendance.findFirst({ where: { id: scope.attendanceId, officeId }, select: { id: true, subject: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    const rootFolderId = await getOrCreateAttendanceFolder(a.id, a.subject, officeId);
    const attachments = await prisma.attachment.findMany({
      where: { attendanceId: a.id, officeId },
      select: { id: true, name: true, storageFileId: true, driveUrl: true, docType: true },
    });
    const conhecidos: RegistroConhecido[] = attachments.map((att) => ({
      recordKind: "ATTACHMENT",
      recordId: att.id,
      name: att.name,
      fileId: att.storageFileId || extractDriveFileId(att.driveUrl),
      subpasta: getDocumentTypeLabel(att.docType),
    }));
    return {
      rootFolderId,
      temSubpasta: true,
      entidadeLabel: a.subject,
      conhecidos,
      tipoPredominante: null,
    };
  }

  if (scope.kind === "LICITACAO") {
    const l = await prisma.licitacao.findFirst({
      where: { id: scope.licitacaoId, officeId },
      select: { id: true, nome: true, objeto: true, assessoriaId: true, assessoria: { select: { client: { select: { name: true } } } } },
    });
    if (!l) return { error: "Licitação não encontrada." };
    const companyName = l.assessoria.client.name;
    const licitacaoNome = l.nome || l.objeto;

    let rootFolderId: string;
    let entidadeLabel: string;
    let taskIdFiltro: string | null = null;
    if (scope.taskId) {
      const t = await prisma.task.findFirst({ where: { id: scope.taskId, officeId, licitacaoId: l.id }, select: { id: true, title: true } });
      if (!t) return { error: "Demanda não encontrada." };
      rootFolderId = await getOrCreateLicitacaoDemandaFolder(t.id, l.id, companyName, licitacaoNome, t.title, officeId);
      entidadeLabel = `${licitacaoNome} → ${t.title}`;
      taskIdFiltro = t.id;
    } else {
      rootFolderId = await getOrCreateLicitacaoFolder(l.id, companyName, licitacaoNome, officeId);
      entidadeLabel = licitacaoNome;
    }

    const attachments = await prisma.attachment.findMany({
      where: { licitacaoId: l.id, taskId: taskIdFiltro, officeId },
      select: { id: true, name: true, storageFileId: true, driveUrl: true, docType: true },
    });
    const conhecidos: RegistroConhecido[] = attachments.map((a) => ({
      recordKind: "ATTACHMENT",
      recordId: a.id,
      name: a.name,
      fileId: a.storageFileId || extractDriveFileId(a.driveUrl),
      subpasta: null,
    }));
    return {
      rootFolderId,
      temSubpasta: false,
      entidadeLabel,
      conhecidos,
      tipoPredominante: tipoMaisFrequente(attachments.map((a) => a.docType)),
    };
  }

  // ASSESSORIA — documentos gerais da empresa (AssessoriaDocumento sem parecerId). Documentos
  // dentro de um Parecer têm pasta e reconciliação própria, fora do escopo desta entrega.
  const a = await prisma.assessoria.findFirst({ where: { id: scope.assessoriaId, officeId }, select: { id: true, client: { select: { name: true } } } });
  if (!a) return { error: "Assessoria não encontrada." };
  const rootFolderId = await getOrCreateAssessoriaCompanyFolderCached(a.id, a.client.name, officeId);
  const docs = await prisma.assessoriaDocumento.findMany({
    where: { assessoriaId: a.id, officeId, parecerId: null },
    select: { id: true, name: true, storageFileId: true, driveUrl: true, docType: true },
  });
  const conhecidos: RegistroConhecido[] = docs.map((d) => ({
    recordKind: "ASSESSORIA_DOCUMENTO",
    recordId: d.id,
    name: d.name,
    fileId: d.storageFileId || extractDriveFileId(d.driveUrl),
    subpasta: ASSESSORIA_DOC_TYPE_FOLDERS[d.docType] ?? null,
  }));
  return {
    rootFolderId,
    temSubpasta: "hibrido",
    entidadeLabel: a.client.name,
    conhecidos,
    tipoPredominante: tipoMaisFrequente(docs.map((d) => d.docType)),
  };
}

type ArquivoVivo = { fileId: string; name: string; webViewLink: string; subpasta: string | null };

// Lista os arquivos que EXISTEM DE VERDADE na pasta agora (não a lixeira — listDriveChildren já
// filtra trashed=false por padrão), um nível de subpasta a mais quando a entidade organiza por
// tipo (Processo/Atendimento) ou pelas 4 categorias curadas da Assessoria. Um Attachment/
// AssessoriaDocumento conhecido cujo fileId NÃO aparece aqui sumiu (foi apagado ou mandado pra
// Lixeira fora do Lúmen) — não precisa de uma chamada extra por arquivo pra descobrir isso, só
// checa ausência neste conjunto (mesma lógica de "seenFileIds" já usada pelo sync reverso,
// lib/driveSync.ts).
async function listarArquivosVivos(officeId: string, root: ContextoEscopo): Promise<ArquivoVivo[]> {
  const topo = await listDriveChildren(officeId, root.rootFolderId);
  const arquivos: ArquivoVivo[] = [];

  async function processarPasta(child: DriveChildEntry) {
    if (root.temSubpasta === true) {
      if (isReservedCaseSubfolder(child.name)) return; // "Protocolos": atalhos, não é anexo de verdade
    } else if (root.temSubpasta === "hibrido") {
      if (!ASSESSORIA_CURATED_LABELS.has(child.name)) return; // não é uma das 4 categorias curadas
    } else {
      return; // Licitação/Demanda: pasta é sempre uma sub-demanda ou pasta de outra entidade — fora de escopo aqui
    }
    const dentro = await listDriveChildren(officeId, child.id);
    for (const f of dentro) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue; // não esperamos sub-subpasta
      arquivos.push({ fileId: f.id, name: f.name, webViewLink: driveFileUrl(f.id, f.webViewLink), subpasta: child.name });
    }
  }

  const pastas = topo.filter((c) => c.mimeType === DRIVE_FOLDER_MIME_TYPE);
  await mapComConcorrencia(pastas, CONCORRENCIA_DRIVE, processarPasta);

  for (const child of topo) {
    if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      arquivos.push({ fileId: child.id, name: child.name, webViewLink: driveFileUrl(child.id, child.webViewLink), subpasta: null });
    }
  }
  return arquivos;
}

// Descobre se um arquivo "sumido" (fileId conhecido, mas fora do conjunto vivo) está na Lixeira
// (recuperável) ou foi apagado em definitivo (sem volta) — só chamado para o pequeno conjunto de
// pendências reais, nunca para todo Attachment de uma pasta.
async function statusSumico(fileId: string, officeId: string): Promise<"lixeira" | "definitivo" | null> {
  const info = await getDriveFileInfo(fileId, officeId).catch(() => null);
  if (!info) return "definitivo";
  return info.trashed ? "lixeira" : "definitivo"; // se não sumiu de verdade (bug de chamada), trata como não recuperável em vez de travar a tela
}

// Casa cada Attachment/AssessoriaDocumento "sumido" com o arquivo novo de nome mais parecido
// (dentro da MESMA subpasta/categoria), ganancioso por similaridade decrescente — cada lado só
// entra em um par. O que sobra de cada lado vira pendência própria (SUMIDO / NOVO).
function casarSumicosComNovos(
  sumicos: RegistroComArquivo[],
  vivosNaoConhecidos: ArquivoVivo[]
): { pares: { conhecido: RegistroComArquivo; novo: ArquivoVivo; sim: number }[]; sumicosRestantes: RegistroComArquivo[]; novosRestantes: ArquivoVivo[] } {
  const candidatos: { conhecido: RegistroComArquivo; novo: ArquivoVivo; sim: number }[] = [];
  for (const s of sumicos) {
    for (const v of vivosNaoConhecidos) {
      if (s.subpasta !== v.subpasta) continue;
      const sim = similarity(s.name, v.name);
      if (sim >= SIMILARITY_THRESHOLD) candidatos.push({ conhecido: s, novo: v, sim });
    }
  }
  candidatos.sort((a, b) => b.sim - a.sim);

  const usadosConhecido = new Set<string>();
  const usadosNovo = new Set<string>();
  const pares: typeof candidatos = [];
  for (const c of candidatos) {
    if (usadosConhecido.has(c.conhecido.recordId) || usadosNovo.has(c.novo.fileId)) continue;
    usadosConhecido.add(c.conhecido.recordId);
    usadosNovo.add(c.novo.fileId);
    pares.push(c);
  }

  return {
    pares,
    sumicosRestantes: sumicos.filter((s) => !usadosConhecido.has(s.recordId)),
    novosRestantes: vivosNaoConhecidos.filter((v) => !usadosNovo.has(v.fileId)),
  };
}

async function montarPendencias(officeId: string, ctx: ContextoEscopo): Promise<Pendencia[]> {
  const vivos = await listarArquivosVivos(officeId, ctx);
  const vivosPorId = new Map(vivos.map((v) => [v.fileId, v]));

  const conhecidosComArquivo = ctx.conhecidos.filter((c): c is RegistroComArquivo => Boolean(c.fileId));
  const sumicos = conhecidosComArquivo.filter((c) => !vivosPorId.has(c.fileId));
  const idsConhecidos = new Set(conhecidosComArquivo.map((c) => c.fileId));
  const orfaos = vivos.filter((v) => !idsConhecidos.has(v.fileId));

  const { pares, sumicosRestantes, novosRestantes } = casarSumicosComNovos(sumicos, orfaos);

  const pendenciasSub = await mapComConcorrencia(pares, CONCORRENCIA_DRIVE, async (p): Promise<PendenciaSubstituicao> => {
    const trashed = await statusSumico(p.conhecido.fileId, officeId);
    return {
      tipo: "SUBSTITUICAO",
      recordKind: p.conhecido.recordKind,
      recordId: p.conhecido.recordId,
      subpasta: p.conhecido.subpasta,
      antigo: { fileId: p.conhecido.fileId, name: p.conhecido.name, trashed },
      novo: { fileId: p.novo.fileId, name: p.novo.name, webViewLink: p.novo.webViewLink },
      similaridade: p.sim,
    };
  });

  const pendenciasSumido = await mapComConcorrencia(sumicosRestantes, CONCORRENCIA_DRIVE, async (s): Promise<PendenciaSumido> => {
    const trashed = await statusSumico(s.fileId, officeId);
    return { tipo: "SUMIDO", recordKind: s.recordKind, recordId: s.recordId, subpasta: s.subpasta, nome: s.name, fileId: s.fileId, trashed };
  });

  const todosOsNomesConhecidos = ctx.conhecidos.map((c) => c.name);
  const pendenciasNovo: PendenciaNovo[] = novosRestantes.map((v) => {
    let melhor = 0;
    for (const nome of todosOsNomesConhecidos) melhor = Math.max(melhor, similarity(nome, v.name));
    const sugestao = sugerirTipo(ctx, v.subpasta);
    return {
      tipo: "NOVO",
      subpasta: v.subpasta,
      arquivo: { fileId: v.fileId, name: v.name, webViewLink: v.webViewLink },
      melhorSemelhanca: melhor,
      tipoSugeridoKey: sugestao?.key ?? null,
      tipoSugeridoLabel: sugestao?.label ?? null,
    };
  });

  return [...pendenciasSub, ...pendenciasSumido, ...pendenciasNovo];
}

// Confere se o escritório está no Google Drive antes de gastar qualquer chamada — nenhuma das
// operações desta reconciliação (listar pasta, restaurar da Lixeira) tem equivalente em
// OneDrive/Dropbox hoje.
async function exigirGoogleDrive(officeId: string): Promise<string | null> {
  const provider = await getStorageProvider(officeId);
  if (provider !== "GOOGLE_DRIVE") {
    return "Esta verificação está disponível apenas para escritórios conectados ao Google Drive.";
  }
  return null;
}

export async function planoReconciliacaoEntidade(scope: ReconciliationScope): Promise<EntidadePlano | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const bloqueio = await exigirGoogleDrive(user.officeId);
  if (bloqueio) return { error: bloqueio };

  try {
    const ctx = await resolverContexto(scope, user.officeId);
    if ("error" in ctx) return ctx;
    const pendencias = await montarPendencias(user.officeId, ctx);
    return {
      scope,
      entidadeLabel: ctx.entidadeLabel,
      tipoPredominante: ctx.tipoPredominante ? getDocumentTypeLabel(ctx.tipoPredominante) : null,
      pendencias,
      registros: registrosDe(ctx),
    };
  } catch (e) {
    return { error: translateDriveError(e, "verificar os anexos desta pasta no Drive") };
  }
}

function registrosDe(ctx: ContextoEscopo): RegistroExistente[] {
  return ctx.conhecidos.map((c) => ({ recordKind: c.recordKind, recordId: c.recordId, name: c.name }));
}

// Versão para o botão "geral" (Gestão → Conexões): varre toda entidade do escritório que já tem
// pelo menos um anexo ou pasta própria — nunca cria pasta nova só por rodar a auditoria (por isso
// filtra por driveFolderId/anexo já existente, ao contrário de simplesmente listar TODO Case/
// Attendance do escritório). Só admin roda (mesmo gate de lib/actions/driveReorg.ts) — varre dados
// do escritório inteiro, não só de uma pasta que o próprio usuário já está olhando. O teto de
// duração desta Server Action é o de quem a chama (app/(app)/conexoes/page.tsx, que declara
// `maxDuration`) — "use server" não aceita exportar isso aqui (só funções async).
export async function planoReconciliacaoEscritorio(): Promise<{ entidades: EntidadePlano[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };

  const bloqueio = await exigirGoogleDrive(user.officeId);
  if (bloqueio) return { error: bloqueio };

  const officeId = user.officeId;
  const [cases, attendances, licitacoes, tasks, assessorias] = await Promise.all([
    prisma.case.findMany({
      where: { officeId, OR: [{ driveFolderId: { not: null } }, { attachments: { some: {} } }] },
      select: { id: true },
    }),
    prisma.attendance.findMany({
      where: { officeId, OR: [{ driveFolderId: { not: null } }, { attachments: { some: {} } }] },
      select: { id: true },
    }),
    prisma.licitacao.findMany({
      where: { officeId, OR: [{ driveFolderId: { not: null } }, { attachments: { some: { taskId: null } } }] },
      select: { id: true },
    }),
    prisma.task.findMany({
      where: { officeId, licitacaoId: { not: null }, OR: [{ driveFolderId: { not: null } }, { attachments: { some: {} } }] },
      select: { id: true, licitacaoId: true },
    }),
    prisma.assessoria.findMany({
      where: { officeId, OR: [{ driveFolderId: { not: null } }, { documents: { some: { parecerId: null } } }] },
      select: { id: true },
    }),
  ]);

  const escopos: ReconciliationScope[] = [
    ...cases.map((c): ReconciliationScope => ({ kind: "CASE", caseId: c.id })),
    ...attendances.map((a): ReconciliationScope => ({ kind: "ATTENDANCE", attendanceId: a.id })),
    ...licitacoes.map((l): ReconciliationScope => ({ kind: "LICITACAO", licitacaoId: l.id })),
    ...tasks.map((t): ReconciliationScope => ({ kind: "LICITACAO", licitacaoId: t.licitacaoId!, taskId: t.id })),
    ...assessorias.map((a): ReconciliationScope => ({ kind: "ASSESSORIA", assessoriaId: a.id })),
  ];

  const resultados = await mapComConcorrencia(escopos, CONCORRENCIA_DRIVE, async (scope): Promise<EntidadePlano | null> => {
    try {
      const ctx = await resolverContexto(scope, officeId);
      if ("error" in ctx) return null;
      const pendencias = await montarPendencias(officeId, ctx);
      if (pendencias.length === 0) return null;
      return {
        scope,
        entidadeLabel: ctx.entidadeLabel,
        tipoPredominante: ctx.tipoPredominante ? getDocumentTypeLabel(ctx.tipoPredominante) : null,
        pendencias,
        registros: registrosDe(ctx),
      };
    } catch {
      return null; // uma pasta com problema (ex.: token momentaneamente instável) não deve travar a varredura inteira
    }
  });

  return { entidades: resultados.filter((r): r is EntidadePlano => r !== null) };
}

// ============ Ações de resolução — cada uma reconfere o escopo/officeId a partir do banco, nunca
// confia soltamente no que veio do plano (mesmo padrão do resto do produto). ============

async function carregarRegistro(recordKind: RecordKind, recordId: string, officeId: string): Promise<{ fileId: string | null } | null> {
  if (recordKind === "ATTACHMENT") {
    const a = await prisma.attachment.findFirst({ where: { id: recordId, officeId }, select: { storageFileId: true, driveUrl: true } });
    if (!a) return null;
    return { fileId: a.storageFileId || extractDriveFileId(a.driveUrl) };
  }
  const d = await prisma.assessoriaDocumento.findFirst({ where: { id: recordId, officeId }, select: { storageFileId: true, driveUrl: true } });
  if (!d) return null;
  return { fileId: d.storageFileId || extractDriveFileId(d.driveUrl) };
}

async function apontarRegistroParaArquivo(recordKind: RecordKind, recordId: string, officeId: string, novo: DriveFileRef): Promise<void> {
  if (recordKind === "ATTACHMENT") {
    await prisma.attachment.update({
      where: { id: recordId },
      data: { name: novo.name, driveUrl: novo.webViewLink, storageFileId: novo.fileId, storageProvider: "GOOGLE_DRIVE", updatedAt: new Date() },
    });
  } else {
    await prisma.assessoriaDocumento.update({
      where: { id: recordId },
      data: { name: novo.name, driveUrl: novo.webViewLink, storageFileId: novo.fileId, storageProvider: "GOOGLE_DRIVE" },
    });
  }
}

async function revalidarEscopo(scope: ReconciliationScope): Promise<void> {
  if (scope.kind === "CASE") {
    revalidatePath(`/processos/${scope.caseId}`);
    revalidatePath(`/m/processos/${scope.caseId}`);
  } else if (scope.kind === "ATTENDANCE") {
    revalidatePath(`/atendimento/${scope.attendanceId}`);
    revalidatePath(`/m/atendimento/${scope.attendanceId}`);
  } else if (scope.kind === "LICITACAO") {
    // Licitação não tem rota própria — vive em /assessoria/{id}?tab=licitacoes (ver mesmo padrão
    // em lib/actions/attachments.ts:revalidateLicitacaoPath).
    const l = await prisma.licitacao.findUnique({ where: { id: scope.licitacaoId }, select: { assessoriaId: true } });
    if (l) revalidatePath(`/assessoria/${l.assessoriaId}`);
  } else {
    revalidatePath(`/assessoria/${scope.assessoriaId}`);
    revalidatePath(`/m/assessoria/${scope.assessoriaId}`);
  }
}

// Cobre TRÊS decisões do usuário que são, na prática, a mesma operação — apontar um registro já
// cadastrado para um arquivo do Drive diferente do que ele apontava, descartando o antigo:
//   - "Substituir" numa pendência de SUBSTITUICAO (manter o arquivo novo);
//   - "Substituir um documento existente" numa pendência de NOVO (usuário escolhe da lista);
//   - "Apontar para outro arquivo" numa pendência de SUMIDO.
// O arquivo antigo é resolvido a partir do PRÓPRIO registro no banco (nunca confia num fileId
// vindo do cliente para decidir o que apagar) e excluído em definitivo do Drive, best-effort —
// se já sumiu de verdade (caso SUMIDO) a chamada só falha em silêncio, sem travar a operação.
export async function apontarDocumentoParaNovoArquivo(
  scope: ReconciliationScope,
  recordKind: RecordKind,
  recordId: string,
  novo: DriveFileRef
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const registro = await carregarRegistro(recordKind, recordId, user.officeId);
  if (!registro) return { error: "Anexo não encontrado." };

  if (registro.fileId) {
    await deleteDriveFile(registro.fileId, user.officeId).catch(() => {});
  }
  await apontarRegistroParaArquivo(recordKind, recordId, user.officeId, novo);
  await revalidarEscopo(scope);
  return {};
}

// "Voltar ao documento anterior": restaura o arquivo antigo da Lixeira (o registro no banco nunca
// foi tocado — ele sempre apontou pro mesmo fileId, só o arquivo em si tinha sumido do Drive) e
// exclui em definitivo o arquivo novo, anexado por engano.
export async function restaurarDocumentoAntigo(
  scope: ReconciliationScope,
  recordKind: RecordKind,
  recordId: string,
  novoFileId: string
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const registro = await carregarRegistro(recordKind, recordId, user.officeId);
  if (!registro?.fileId) return { error: "Anexo não encontrado." };

  try {
    await restoreDriveFile(registro.fileId, user.officeId);
  } catch (e) {
    return { error: translateDriveError(e, "restaurar o documento da Lixeira do Drive") };
  }
  await deleteDriveFile(novoFileId, user.officeId).catch(() => {});
  await revalidarEscopo(scope);
  return {};
}

// "Adicionar como novo documento": cadastra o arquivo órfão como um Attachment/AssessoriaDocumento
// novo, no mesmo escopo da pasta verificada — mesma validação de officeId de createAttachment/
// addDocumento (lib/actions/attachments.ts / lib/actions/assessoria.ts), sem duplicar a criação do
// arquivo em si (ele já existe no Drive; só falta o registro no banco).
export async function adicionarComoAnexo(scope: ReconciliationScope, arquivo: DriveFileRef, tipoEscolhido: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!tipoEscolhido) return { error: "Escolha o tipo do documento." };

  const dadosComuns = {
    officeId: user.officeId,
    name: arquivo.name,
    driveUrl: arquivo.webViewLink,
    docType: tipoEscolhido,
    storageProvider: "GOOGLE_DRIVE" as const,
    storageFileId: arquivo.fileId,
    uploadedById: user.id,
  };

  if (scope.kind === "CASE") {
    const c = await prisma.case.findFirst({ where: { id: scope.caseId, officeId: user.officeId }, select: { id: true } });
    if (!c) return { error: "Processo não encontrado." };
    await prisma.attachment.create({ data: { ...dadosComuns, caseId: c.id } });
  } else if (scope.kind === "ATTENDANCE") {
    const a = await prisma.attendance.findFirst({ where: { id: scope.attendanceId, officeId: user.officeId }, select: { id: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    await prisma.attachment.create({ data: { ...dadosComuns, attendanceId: a.id } });
  } else if (scope.kind === "LICITACAO") {
    const l = await prisma.licitacao.findFirst({ where: { id: scope.licitacaoId, officeId: user.officeId }, select: { id: true } });
    if (!l) return { error: "Licitação não encontrada." };
    let taskId: string | null = null;
    if (scope.taskId) {
      const t = await prisma.task.findFirst({ where: { id: scope.taskId, officeId: user.officeId, licitacaoId: l.id }, select: { id: true } });
      if (!t) return { error: "Demanda não encontrada." };
      taskId = t.id;
    }
    await prisma.attachment.create({ data: { ...dadosComuns, licitacaoId: l.id, taskId } });
  } else {
    const a = await prisma.assessoria.findFirst({ where: { id: scope.assessoriaId, officeId: user.officeId }, select: { id: true } });
    if (!a) return { error: "Assessoria não encontrada." };
    await prisma.assessoriaDocumento.create({ data: { ...dadosComuns, assessoriaId: a.id, date: new Date() } });
  }

  await revalidarEscopo(scope);
  return {};
}

// "Desvincular": mesmas ações já usadas pelo botão de excluir anexo/documento (preserva o mesmo
// tratamento de protocolo já concluído, ver deleteAttachment em lib/actions/attachments.ts) — como
// o arquivo do Drive já sumiu, a exclusão do arquivo em si (dentro dessas funções) só falha em
// silêncio; o efeito prático é remover o registro quebrado.
export async function desvincularPendenciaSumida(
  recordKind: RecordKind,
  recordId: string,
  confirmarProtocolado?: boolean
): Promise<{ error?: string; precisaConfirmar?: boolean; protocolos?: string[] }> {
  if (recordKind === "ATTACHMENT") return deleteAttachment(recordId, { confirmarProtocolado });
  return deleteDocumento(recordId);
}
