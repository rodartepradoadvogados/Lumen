// Sync reverso do Google Drive: cobre o sentido contrário do upload normal (site -> Drive).
// Roda uma vez por dia (app/api/cron/drive-sync/route.ts) e, para cada escritório com o Drive
// conectado (GoogleCredential.isPrimaryDrive), varre "Lúmen - Processos", "Lúmen - Casos",
// "Lúmen - Atendimentos" E "Lúmen - Assessoria" (empresas + Pareceres, ver syncAssessoriaTree
// abaixo — antes desta entrega a árvore de Assessoria ficava de fora) no Drive e:
//   1) registra como Attachment/AssessoriaDocumento de verdade qualquer arquivo que já esteja no
//      lugar certo (pasta do processo/atendimento/empresa + subpasta do tipo de documento) mas
//      que ninguém subiu pelo site — o caso "alguém arrastou o arquivo direto pro Drive";
//   2) NUNCA adivinha o que fazer quando a estrutura foge do esperado (pasta sem processo/empresa
//      correspondente, subpasta com nome que não é nenhum tipo de documento conhecido, arquivo
//      solto sem categoria fora do que a Assessoria já considera normal) — só registra o problema
//      em DriveSyncIssue, pra aparecer na Central de Alertas (kind DRIVE_INCONSISTENCIA, visível
//      só a isAdmin) com a correção exata.
// Read-only sobre tudo que não consegue resolver com confiança: nunca move, renomeia ou apaga
// pasta/arquivo do Drive por conta própria.
import { prisma } from "@/lib/prisma";
import {
  DRIVE_FOLDER_MIME_TYPE,
  hasPrimaryDriveCredential,
  listDriveChildren,
  getProcessosRootFolderId,
  getCasosRootFolderId,
  getAtendimentosRootFolderId,
  getAssessoriaRootFolderId,
  ASSESSORIA_DOC_TYPE_FOLDERS,
  type DriveChildEntry,
} from "@/lib/googleDrive";
import { DOCUMENT_TYPES } from "@/lib/documentTypes";
import { isReservedCaseSubfolder } from "@/lib/protocolos";

export type DriveSyncIssueType =
  | "PASTA_PROCESSO_SEM_CORRESPONDENCIA"
  | "PASTA_CATEGORIA_DESCONHECIDA"
  | "ARQUIVO_SOLTO_SEM_CATEGORIA"
  | "ANEXO_SUMIU_DO_DRIVE"
  // Equivalentes dos quatro tipos acima, para a árvore "Lúmen - Assessoria" (ver
  // syncAssessoriaTree) — nomes próprios (não reaproveitados) porque a estrutura de pastas da
  // Assessoria é diferente (empresa -> categoria/Pareceres -> [parecer ->] arquivos) e o texto do
  // alerta precisa citar "empresa"/"parecer" em vez de "processo"/"atendimento".
  | "PASTA_ASSESSORIA_SEM_CORRESPONDENCIA"
  | "PASTA_CATEGORIA_ASSESSORIA_DESCONHECIDA"
  | "ARQUIVO_ASSESSORIA_SOLTO_SEM_CATEGORIA"
  | "PARECER_SEM_CORRESPONDENCIA"
  | "DOCUMENTO_ASSESSORIA_SUMIU_DO_DRIVE";

export type SyncOfficeResult = { registered: number; issuesFound: number; issuesResolved: number };

function driveFileUrl(id: string, webViewLink?: string | null): string {
  return webViewLink || `https://drive.google.com/file/d/${id}/view`;
}

// Mapa "nome exato da subpasta" -> key do tipo de documento (ver lib/documentTypes.ts), montado
// uma única vez — os rótulos são os mesmos usados por getOrCreateCategoryFolder na hora de criar
// a subpasta, então um nome de pasta que bate exatamente com um destes é, por definição, uma
// categoria válida.
const CATEGORY_LABEL_TO_KEY: Map<string, string> = new Map(DOCUMENT_TYPES.map((t) => [t.label, t.key]));

// Mapeia `items` aplicando `fn` a cada um, no máximo `limit` execuções simultâneas. Sem isso,
// paralelizar sem limite (Promise.all cru) arrisca estourar a cota de taxa da API do Drive numa
// pasta com muitas subpastas de categoria — sem dependência nova, é só um semáforo simples: cada
// "worker" consome o próximo índice da fila até esgotar. Usado para paralelizar o que era, antes,
// uma chamada HTTP ao Drive por subpasta/categoria em série (achado A69 da revisão gauntlet).
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const CHILD_SYNC_CONCURRENCY = 5;

// Um problema "ainda em aberto" pendente de detecção/resolução nesta rodada, identificado pela
// mesma chave usada pelo @@unique do model (officeId é implícito, é sempre o mesmo escritório).
// caseId/attendanceId só existem quando o problema foi encontrado DENTRO de um processo/
// atendimento já resolvido (categoria com nome errado, arquivo solto) — usados só para o alerta
// linkar direto pra página certa (ver getAlerts em lib/alerts.ts).
type PendingIssue = {
  driveFileId: string;
  issueType: DriveSyncIssueType;
  description: string;
  suggestedFix: string;
  driveUrl?: string | null;
  caseId?: string;
  attendanceId?: string;
};

// Aplica em lote o que syncOfficeDrive detectou nesta rodada: cria de uma vez (createMany) os
// problemas que nunca existiram antes (nem resolvidos), e atualiza (update, um a um mas em
// PARALELO — não em série) os que já tinham uma linha (aberta ou já resolvida, reabrindo-a).
// Antes, cada problema detectado passava por um upsert individual, um await de cada vez — a
// mesma classe de gargalo das chamadas ao Drive, só que contra o Postgres (achado A69 da revisão
// gauntlet, item 2 da solução proposta).
async function applyDetectedIssues(officeId: string, issues: PendingIssue[], existingKeys: Set<string>): Promise<void> {
  if (issues.length === 0) return;

  const toCreate: PendingIssue[] = [];
  const toUpdate: PendingIssue[] = [];
  for (const issue of issues) {
    (existingKeys.has(`${issue.driveFileId}::${issue.issueType}`) ? toUpdate : toCreate).push(issue);
  }

  if (toCreate.length > 0) {
    await prisma.driveSyncIssue.createMany({
      data: toCreate.map((issue) => ({
        officeId,
        driveFileId: issue.driveFileId,
        issueType: issue.issueType,
        description: issue.description,
        suggestedFix: issue.suggestedFix,
        driveUrl: issue.driveUrl ?? null,
        caseId: issue.caseId ?? null,
        attendanceId: issue.attendanceId ?? null,
      })),
      // Defesa, não caminho esperado: por construção (existingKeys já separou create de update)
      // nenhuma destas chaves deveria colidir com uma linha existente.
      skipDuplicates: true,
    });
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((issue) =>
        prisma.driveSyncIssue.update({
          where: { officeId_driveFileId_issueType: { officeId, driveFileId: issue.driveFileId, issueType: issue.issueType } },
          data: {
            description: issue.description,
            suggestedFix: issue.suggestedFix,
            driveUrl: issue.driveUrl ?? null,
            caseId: issue.caseId ?? null,
            attendanceId: issue.attendanceId ?? null,
            // Reabre se estava resolvido de uma rodada anterior (mesmo comportamento do upsert
            // que este código substitui) — um problema que sumiu e voltou não é um problema novo.
            resolvedAt: null,
          },
        })
      )
    );
  }
}

// Sugestão de tipo mais provável para uma subpasta com nome não reconhecido — comparação simples
// (substring, sem acento/case) só pra dar uma pista útil no alerta; não decide nada sozinha.
function normalizeForCompare(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function suggestClosestLabels(folderName: string): string[] {
  const normalized = normalizeForCompare(folderName);
  const hits = DOCUMENT_TYPES.filter((t) => {
    const label = normalizeForCompare(t.label);
    return label.includes(normalized) || normalized.includes(label);
  }).map((t) => t.label);
  return hits.slice(0, 3);
}

type ContainerKind = "case" | "attendance";

type ResolvedContainer = { id: string; label: string };

type ChildSyncOutcome = { issues: PendingIssue[]; seenFileIds: string[]; registered: number };

// Processa UMA subpasta de 1º nível dentro da pasta do container (processo/atendimento): se for
// pasta de categoria, lista os arquivos dela e registra os que faltam; se for arquivo solto,
// gera o alerta correspondente. Extraído de syncContainerFolder para poder rodar em paralelo com
// as demais subpastas do mesmo container — cada uma é independente (lista e grava só os próprios
// arquivos), então paralelizar aqui é seguro e é onde o tempo de fato ia embora: cada await deste
// bloco era uma chamada HTTP à API do Drive em série (achado A69 da revisão gauntlet).
async function processContainerChild(
  officeId: string,
  container: ResolvedContainer,
  kind: ContainerKind,
  child: DriveChildEntry,
  registeredAttachmentIds: Set<string>
): Promise<ChildSyncOutcome> {
  const issues: PendingIssue[] = [];
  const seenFileIds: string[] = [];
  let registered = 0;

  if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) {
    // Pasta de estrutura do sistema ("Protocolos", ver lib/protocolos.ts): não é categoria de
    // tipo de documento e não deve ser varrida. Sem esta saída, cada processo com protocolo
    // geraria PASTA_CATEGORIA_DESCONHECIDA todo dia na Central de Alertas — e, pior, o conteúdo
    // dela (atalhos para documentos que JÁ são anexos registrados) poderia ser registrado de
    // novo, criando exatamente a duplicação que a funcionalidade de protocolos evita.
    if (isReservedCaseSubfolder(child.name)) return { issues, seenFileIds, registered };

    const docTypeKey = CATEGORY_LABEL_TO_KEY.get(child.name);
    // Lista os arquivos da subpasta de qualquer forma (reconhecida ou não) só pra marcar como
    // "vistos" — uma categoria com nome errado não pode fazer os anexos já registrados dela
    // parecerem apagados do Drive (ver ANEXO_SUMIU_DO_DRIVE mais abaixo).
    const categoryFiles = await listDriveChildren(officeId, child.id);
    for (const f of categoryFiles) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue; // não esperamos sub-subpastas; ignora silenciosamente
      seenFileIds.push(f.id);
    }

    if (!docTypeKey) {
      const closest = suggestClosestLabels(child.name);
      issues.push({
        driveFileId: child.id,
        issueType: "PASTA_CATEGORIA_DESCONHECIDA",
        description: `A pasta "${child.name}" dentro de "${container.label}" não corresponde a nenhum tipo de documento conhecido.`,
        suggestedFix:
          closest.length > 0
            ? `Renomeie a pasta "${child.name}" para um destes tipos exatos: ${closest.join(", ")} — ou mova os arquivos dela para a subpasta correta e apague esta.`
            : `Renomeie a pasta "${child.name}" para o nome exato de um tipo de documento cadastrado (ver lista de tipos em Anexos), ou mova os arquivos dela para a subpasta correta e apague esta.`,
        driveUrl: child.webViewLink,
        caseId: kind === "case" ? container.id : undefined,
        attendanceId: kind === "attendance" ? container.id : undefined,
      });
      return { issues, seenFileIds, registered };
    }

    for (const f of categoryFiles) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
      if (registeredAttachmentIds.has(f.id)) continue;

      await prisma.attachment.create({
        data: {
          officeId,
          name: f.name,
          driveUrl: driveFileUrl(f.id, f.webViewLink),
          docType: docTypeKey,
          storageProvider: "GOOGLE_DRIVE",
          storageFileId: f.id,
          uploadedById: null,
          caseId: kind === "case" ? container.id : null,
          attendanceId: kind === "attendance" ? container.id : null,
        },
      });
      registered++;
    }
  } else {
    // Arquivo solto direto na pasta do processo/atendimento, fora de qualquer subpasta de tipo.
    seenFileIds.push(child.id);
    issues.push({
      driveFileId: child.id,
      issueType: "ARQUIVO_SOLTO_SEM_CATEGORIA",
      description: `O arquivo "${child.name}" está solto dentro de "${container.label}", fora de qualquer subpasta de tipo de documento.`,
      suggestedFix: `Mova o arquivo "${child.name}" para a subpasta do tipo de documento correto dentro de "${container.label}" (ex: Petição, Procuração) — não é possível saber automaticamente qual tipo é.`,
      driveUrl: child.webViewLink,
      caseId: kind === "case" ? container.id : undefined,
      attendanceId: kind === "attendance" ? container.id : undefined,
    });
  }

  return { issues, seenFileIds, registered };
}

// Processa uma pasta de "container" (processo ou atendimento) já resolvida: lista os filhos e
// processa cada subpasta/arquivo em paralelo (mapWithConcurrency — ver processContainerChild),
// devolvendo os PendingIssue encontrados aqui dentro + os ids de arquivo "vistos" (pra alimentar
// a checagem de ANEXO_SUMIU_DO_DRIVE no final).
async function syncContainerFolder(
  officeId: string,
  container: ResolvedContainer,
  kind: ContainerKind,
  folderId: string,
  registeredAttachmentIds: Set<string>
): Promise<{ issues: PendingIssue[]; seenFileIds: Set<string>; registered: number }> {
  const children = await listDriveChildren(officeId, folderId);

  const outcomes = await mapWithConcurrency(children, CHILD_SYNC_CONCURRENCY, (child) =>
    processContainerChild(officeId, container, kind, child, registeredAttachmentIds)
  );

  const issues: PendingIssue[] = [];
  const seenFileIds = new Set<string>();
  let registered = 0;
  for (const outcome of outcomes) {
    issues.push(...outcome.issues);
    for (const id of outcome.seenFileIds) seenFileIds.add(id);
    registered += outcome.registered;
  }

  return { issues, seenFileIds, registered };
}

// Varre um dos três roots ("Lúmen - Processos" -> Case processo, "Lúmen - Casos" -> Case caso,
// "Lúmen - Atendimentos" -> Attendance): resolve cada subpasta de 1º nível contra o banco (por
// driveFolderId já salvo, ou por nome exato quando ainda não há id salvo) e processa o que
// resolver; o que não resolver vira PASTA_PROCESSO_SEM_CORRESPONDENCIA.
//
// "Lúmen - Processos" e "Lúmen - Casos" resolvem contra o MESMO conjunto de Case (kind="case"),
// sem filtrar por type — de propósito: enquanto scripts/migrar-pastas-casos.ts (Tarefa B) não
// tiver movido a pasta de um caso antigo para a raiz nova, essa pasta ainda está fisicamente em
// "Lúmen - Processos" e precisa continuar resolvendo normalmente ali, ou o sync passaria a acusar
// PASTA_PROCESSO_SEM_CORRESPONDENCIA nela (falso positivo) até alguém rodar a migração. rootLabel/
// tipoLabel só existem para o TEXTO do alerta (raiz e substantivo corretos em cada chamada) — não
// mudam a lógica de resolução, que é idêntica nos dois roots de "case".
//
// Este laço EXTERNO (um container de 1º nível por vez) continua SEQUENCIAL de propósito, mesmo
// depois de paralelizar o que está dentro de cada container (syncContainerFolder): dois
// containers resolvendo o mesmo Case por título ao mesmo tempo poderiam fazer as duas escritas de
// driveFolderId correrem entre si (ver mesmo raciocínio em syncOfficeDrive, Processos x Casos).
async function syncRoot(
  officeId: string,
  kind: ContainerKind,
  rootFolderId: string,
  rootLabel: string,
  tipoLabel: string,
  registeredAttachmentIds: Set<string>
): Promise<{ issues: PendingIssue[]; seenFileIds: Set<string>; registered: number }> {
  const allIssues: PendingIssue[] = [];
  const allSeenFileIds = new Set<string>();
  let totalRegistered = 0;

  const topLevel = await listDriveChildren(officeId, rootFolderId);

  for (const folder of topLevel) {
    if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue; // algo solto direto na raiz do escritório: fora do escopo desta varredura

    let container: ResolvedContainer | null = null;

    if (kind === "case") {
      let c = await prisma.case.findFirst({ where: { officeId, driveFolderId: folder.id }, select: { id: true, title: true } });
      if (!c) {
        c = await prisma.case.findFirst({ where: { officeId, driveFolderId: null, title: folder.name }, select: { id: true, title: true } });
        if (c) await prisma.case.update({ where: { id: c.id }, data: { driveFolderId: folder.id } });
      }
      if (c) container = { id: c.id, label: c.title };
    } else {
      let a = await prisma.attendance.findFirst({ where: { officeId, driveFolderId: folder.id }, select: { id: true, subject: true } });
      if (!a) {
        a = await prisma.attendance.findFirst({ where: { officeId, driveFolderId: null, subject: folder.name }, select: { id: true, subject: true } });
        if (a) await prisma.attendance.update({ where: { id: a.id }, data: { driveFolderId: folder.id } });
      }
      if (a) container = { id: a.id, label: a.subject };
    }

    if (!container) {
      allIssues.push({
        driveFileId: folder.id,
        issueType: "PASTA_PROCESSO_SEM_CORRESPONDENCIA",
        description: `A pasta "${folder.name}" em "${rootLabel}" não corresponde a nenhum ${tipoLabel} deste escritório.`,
        suggestedFix: `Renomeie a pasta "${folder.name}" no Drive para o título exato de um ${tipoLabel} existente, ou verifique se este ${tipoLabel} foi excluído do sistema.`,
        driveUrl: folder.webViewLink,
      });
      continue;
    }

    const result = await syncContainerFolder(officeId, container, kind, folder.id, registeredAttachmentIds);
    allIssues.push(...result.issues);
    for (const id of result.seenFileIds) allSeenFileIds.add(id);
    totalRegistered += result.registered;
  }

  return { issues: allIssues, seenFileIds: allSeenFileIds, registered: totalRegistered };
}

// Mapa inverso de ASSESSORIA_DOC_TYPE_FOLDERS (lib/googleDrive.ts): nome exato da subpasta de
// categoria dentro da pasta da empresa -> docType. "Pareceres" fica de fora de propósito — tem
// tratamento próprio abaixo (cada filho dela é a pasta de um Parecer específico, não um arquivo).
const ASSESSORIA_CATEGORY_LABEL_TO_KEY: Map<string, string> = new Map(
  Object.entries(ASSESSORIA_DOC_TYPE_FOLDERS)
    .filter(([key]) => key !== "PARECER")
    .map(([key, label]) => [label, key])
);
const PARECERES_FOLDER_LABEL = ASSESSORIA_DOC_TYPE_FOLDERS.PARECER;

type AssessoriaContainer = { id: string; client: { name: string } };

// Processa UMA pasta de "Pareceres" já resolvida: cada filho é a pasta de um Parecer específico
// (ou, fora do desenho esperado, um arquivo solto). Mantido SEQUENCIAL mesmo depois de
// paralelizar o resto da árvore de Assessoria (ver processCompanyChild) — cada parecer, como cada
// processo/atendimento em syncRoot, é resolvido por driveFolderId OU por nome quando ainda não
// tem id salvo, e duas pastas de parecer homônimas resolvendo em paralelo correriam a mesma
// escrita de driveFolderId (mesmo risco documentado em syncRoot/syncOfficeDrive).
async function syncPareceresFolder(
  officeId: string,
  assessoria: AssessoriaContainer,
  pareceresFolderId: string
): Promise<{ issues: PendingIssue[]; seenFileIds: string[]; registered: number }> {
  const issues: PendingIssue[] = [];
  const seenFileIds: string[] = [];
  let registered = 0;

  const parecerFolders = await listDriveChildren(officeId, pareceresFolderId);
  for (const parecerFolder of parecerFolders) {
    if (parecerFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
      // Arquivo solto direto dentro de "Pareceres", fora de qualquer pasta de parecer
      // específico — não é o desenho esperado (todo documento de Parecer vive dentro da
      // pasta do parecer, ver getOrCreateParecerFolder em lib/googleDrive.ts).
      seenFileIds.push(parecerFolder.id);
      issues.push({
        driveFileId: parecerFolder.id,
        issueType: "ARQUIVO_ASSESSORIA_SOLTO_SEM_CATEGORIA",
        description: `O arquivo "${parecerFolder.name}" está solto dentro de "${assessoria.client.name} / Pareceres", fora de qualquer pasta de parecer específico.`,
        suggestedFix: `Mova o arquivo "${parecerFolder.name}" para dentro da pasta do parecer correto, ou crie um parecer novo pra ele pela tela da Assessoria.`,
        driveUrl: parecerFolder.webViewLink,
      });
      continue;
    }

    let parecer = await prisma.parecer.findFirst({
      where: { officeId, assessoriaId: assessoria.id, driveFolderId: parecerFolder.id },
      select: { id: true, name: true },
    });
    if (!parecer) {
      const byName = await prisma.parecer.findFirst({
        where: { officeId, assessoriaId: assessoria.id, driveFolderId: null, name: parecerFolder.name },
        select: { id: true, name: true },
      });
      if (byName) {
        await prisma.parecer.update({ where: { id: byName.id }, data: { driveFolderId: parecerFolder.id } });
        parecer = byName;
      }
    }

    const parecerFiles = await listDriveChildren(officeId, parecerFolder.id);
    if (!parecer) {
      for (const f of parecerFiles) seenFileIds.push(f.id); // marca como visto mesmo sem parecer, mesma lógica de categoria desconhecida abaixo
      issues.push({
        driveFileId: parecerFolder.id,
        issueType: "PARECER_SEM_CORRESPONDENCIA",
        description: `A pasta "${parecerFolder.name}" em "${assessoria.client.name} / Pareceres" não corresponde a nenhum parecer cadastrado.`,
        suggestedFix: `Renomeie a pasta "${parecerFolder.name}" para o nome exato de um parecer já cadastrado nesta empresa, ou crie o parecer pela tela da Assessoria.`,
        driveUrl: parecerFolder.webViewLink,
      });
      continue;
    }

    for (const f of parecerFiles) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue; // não esperamos sub-subpastas dentro de um parecer; ignora silenciosamente
      seenFileIds.push(f.id);
      await prisma.assessoriaDocumento.create({
        data: {
          officeId,
          assessoriaId: assessoria.id,
          parecerId: parecer.id,
          // docType real fica com o usuário (ver DocumentTypeSelect em ParecerFolderRow.tsx)
          // — não há como inferir do Drive qual tipo era; "OUTRO" é o mesmo default usado
          // pelo restante do sistema quando a categoria não é conhecida de antemão.
          name: f.name,
          docType: "OUTRO",
          driveUrl: driveFileUrl(f.id, f.webViewLink),
          storageProvider: "GOOGLE_DRIVE",
          storageFileId: f.id,
          uploadedById: null,
        },
      });
      registered++;
    }
  }

  return { issues, seenFileIds, registered };
}

// Processa UMA subpasta de 1º nível dentro da pasta da empresa (categoria de documento,
// "Pareceres", ou arquivo solto — só esperado para OUTRO/ACAO_VINCULADA, ver comentário de
// syncAssessoriaTree). Extraído para poder rodar em paralelo com as demais subpastas da mesma
// empresa, mesmo raciocínio de processContainerChild (achado A69 da revisão gauntlet). A exceção
// é "Pareceres": segue delegando pra syncPareceresFolder, que continua sequencial por dentro (ver
// comentário lá).
async function processCompanyChild(
  officeId: string,
  assessoria: AssessoriaContainer,
  child: DriveChildEntry,
  registeredAssessoriaDocIds: Set<string>
): Promise<{ issues: PendingIssue[]; seenFileIds: string[]; registered: number }> {
  if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
    // Arquivo solto direto na raiz da empresa — esperado pra OUTRO/ACAO_VINCULADA (ver
    // comentário da função). Registra como AssessoriaDocumento "OUTRO" se ainda não existir;
    // não há como saber pelo Drive se era originalmente ACAO_VINCULADA.
    if (registeredAssessoriaDocIds.has(child.id)) return { issues: [], seenFileIds: [child.id], registered: 0 };
    await prisma.assessoriaDocumento.create({
      data: {
        officeId,
        assessoriaId: assessoria.id,
        name: child.name,
        docType: "OUTRO",
        driveUrl: driveFileUrl(child.id, child.webViewLink),
        storageProvider: "GOOGLE_DRIVE",
        storageFileId: child.id,
        uploadedById: null,
      },
    });
    return { issues: [], seenFileIds: [child.id], registered: 1 };
  }

  if (child.name === PARECERES_FOLDER_LABEL) {
    const result = await syncPareceresFolder(officeId, assessoria, child.id);
    return result;
  }

  const issues: PendingIssue[] = [];
  const seenFileIds: string[] = [];
  let registered = 0;

  const docTypeKey = ASSESSORIA_CATEGORY_LABEL_TO_KEY.get(child.name);
  const categoryFiles = await listDriveChildren(officeId, child.id);
  for (const f of categoryFiles) {
    if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
    seenFileIds.push(f.id);
  }

  if (!docTypeKey) {
    issues.push({
      driveFileId: child.id,
      issueType: "PASTA_CATEGORIA_ASSESSORIA_DESCONHECIDA",
      description: `A pasta "${child.name}" dentro de "${assessoria.client.name}" não corresponde a nenhuma categoria de documento conhecida da Assessoria.`,
      suggestedFix: `Renomeie a pasta "${child.name}" para um destes nomes exatos: ${Array.from(ASSESSORIA_CATEGORY_LABEL_TO_KEY.keys()).join(", ")} — ou mova os arquivos dela para a subpasta correta e apague esta.`,
      driveUrl: child.webViewLink,
    });
    return { issues, seenFileIds, registered };
  }

  for (const f of categoryFiles) {
    if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
    if (registeredAssessoriaDocIds.has(f.id)) continue;
    await prisma.assessoriaDocumento.create({
      data: {
        officeId,
        assessoriaId: assessoria.id,
        name: f.name,
        docType: docTypeKey,
        driveUrl: driveFileUrl(f.id, f.webViewLink),
        storageProvider: "GOOGLE_DRIVE",
        storageFileId: f.id,
        uploadedById: null,
      },
    });
    registered++;
  }

  return { issues, seenFileIds, registered };
}

// Varre "Lúmen - Assessoria" — estrutura diferente da de processo/atendimento (raiz -> EMPRESA ->
// {Contratos, Licitações, Regimentos Internos, Pareceres} -> arquivos, com "Pareceres" tendo mais
// um nível: Pareceres -> NOME DO PARECER -> arquivos). Documento OUTRO/ACAO_VINCULADA não tem
// subpasta própria por desenho (ver comentário em lib/googleDrive.ts, ASSESSORIA_DOC_TYPE_FOLDERS)
// — um arquivo solto direto na raiz da empresa é o caso ESPERADO pra esses dois tipos, não uma
// inconsistência a relatar (ao contrário do arquivo solto na raiz de um processo/atendimento).
//
// O laço de empresas (1º nível) continua SEQUENCIAL, mesmo raciocínio de syncRoot: duas pastas de
// empresa homônimas resolvendo em paralelo correriam a mesma escrita de driveFolderId. Dentro de
// cada empresa, as subpastas (categoria/Pareceres/arquivo solto) já rodam em paralelo — ver
// processCompanyChild.
async function syncAssessoriaTree(officeId: string, registeredAssessoriaDocIds: Set<string>): Promise<{ issues: PendingIssue[]; seenFileIds: Set<string>; registered: number }> {
  const issues: PendingIssue[] = [];
  const seenFileIds = new Set<string>();
  let registered = 0;

  const rootId = await getAssessoriaRootFolderId(officeId);
  const companyFolders = await listDriveChildren(officeId, rootId);

  for (const companyFolder of companyFolders) {
    if (companyFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue; // algo solto direto na raiz da Assessoria: fora do escopo desta varredura

    let assessoria = await prisma.assessoria.findFirst({
      where: { officeId, driveFolderId: companyFolder.id },
      select: { id: true, client: { select: { name: true } } },
    });
    if (!assessoria) {
      const byName = await prisma.assessoria.findFirst({
        where: { officeId, driveFolderId: null, client: { name: companyFolder.name } },
        select: { id: true, client: { select: { name: true } } },
      });
      if (byName) {
        await prisma.assessoria.update({ where: { id: byName.id }, data: { driveFolderId: companyFolder.id } });
        assessoria = byName;
      }
    }

    if (!assessoria) {
      issues.push({
        driveFileId: companyFolder.id,
        issueType: "PASTA_ASSESSORIA_SEM_CORRESPONDENCIA",
        description: `A pasta "${companyFolder.name}" em "Lúmen - Assessoria" não corresponde a nenhuma empresa com Assessoria cadastrada neste escritório.`,
        suggestedFix: `Renomeie a pasta "${companyFolder.name}" no Drive para o nome exato do cliente de uma Assessoria já cadastrada, ou verifique se essa Assessoria foi excluída do sistema.`,
        driveUrl: companyFolder.webViewLink,
      });
      continue;
    }

    const companyChildren = await listDriveChildren(officeId, companyFolder.id);
    const outcomes = await mapWithConcurrency(companyChildren, CHILD_SYNC_CONCURRENCY, (child) =>
      processCompanyChild(officeId, assessoria!, child, registeredAssessoriaDocIds)
    );
    for (const outcome of outcomes) {
      issues.push(...outcome.issues);
      for (const id of outcome.seenFileIds) seenFileIds.add(id);
      registered += outcome.registered;
    }
  }

  return { issues, seenFileIds, registered };
}

// Ponto de entrada, um escritório por vez — chamado pelo cron (app/api/cron/drive-sync/route.ts)
// em loop sobre todos os escritórios da plataforma, cada chamada isolada (ver try/catch de quem
// chama) pra uma credencial revogada num escritório não travar os demais.
export async function syncOfficeDrive(officeId: string): Promise<SyncOfficeResult> {
  const connected = await hasPrimaryDriveCredential(officeId);
  if (!connected) return { registered: 0, issuesFound: 0, issuesResolved: 0 };

  const [processosRootId, casosRootId, atendimentosRootId] = await Promise.all([
    getProcessosRootFolderId(officeId),
    getCasosRootFolderId(officeId),
    getAtendimentosRootFolderId(officeId),
  ]);

  // Carregado UMA vez por escritório, antes de varrer a árvore inteira: antes, cada arquivo
  // encontrado disparava um prisma.attachment.findFirst/assessoriaDocumento.findFirst próprio
  // ("já existe isto?") — uma query ao banco por arquivo do Drive. Com o conjunto de
  // storageFileId já registrados em memória, a checagem vira um Set.has() sem ida ao banco
  // (achado A69 da revisão gauntlet, item 1 da solução proposta). As duas listas completas
  // (não só o Set de ids) são reaproveitadas mais abaixo para a reconciliação de
  // ANEXO_SUMIU_DO_DRIVE/DOCUMENTO_ASSESSORIA_SUMIU_DO_DRIVE, que antes rodava a MESMA consulta
  // de novo no fim da função.
  const [googleAttachments, googleAssessoriaDocs] = await Promise.all([
    prisma.attachment.findMany({
      where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } },
      select: { id: true, name: true, storageFileId: true, driveUrl: true },
    }),
    prisma.assessoriaDocumento.findMany({
      where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } },
      select: { id: true, name: true, storageFileId: true, driveUrl: true },
    }),
  ]);
  const registeredAttachmentIds = new Set(googleAttachments.map((a) => a.storageFileId).filter((id): id is string => Boolean(id)));
  const registeredAssessoriaDocIds = new Set(googleAssessoriaDocs.map((d) => d.storageFileId).filter((id): id is string => Boolean(id)));

  // Os dois roots de "case" (Processos e Casos) rodam em SEQUÊNCIA, não em Promise.all: os dois
  // resolvem contra o mesmo Case por título quando driveFolderId ainda é nulo (linha
  // "driveFolderId: null, title: folder.name" acima) — em paralelo, duas pastas homônimas (uma em
  // cada raiz, caso raríssimo mas possível durante a janela de transição) poderiam "reivindicar" o
  // mesmo Case ao mesmo tempo, e as duas escritas de driveFolderId corririam entre si. Atendimento
  // não compartilha esse risco com nenhum dos dois (tabela diferente), então continua sem custo
  // extra de esperar por eles.
  const processosResult = await syncRoot(officeId, "case", processosRootId, "Lúmen - Processos", "processo", registeredAttachmentIds);
  const casosResult = await syncRoot(officeId, "case", casosRootId, "Lúmen - Casos", "caso", registeredAttachmentIds);
  const attendancesResult = await syncRoot(officeId, "attendance", atendimentosRootId, "Lúmen - Atendimentos", "atendimento", registeredAttachmentIds);
  // Árvore da Assessoria — antes desta entrega ficava totalmente fora do sync reverso (documento
  // arrastado direto pro Drive numa pasta de empresa nunca virava AssessoriaDocumento sozinho).
  const assessoriaResult = await syncAssessoriaTree(officeId, registeredAssessoriaDocIds).catch((e) => {
    console.error(`[drive-sync] falha ao varrer a árvore da Assessoria do escritório ${officeId}:`, e);
    return { issues: [] as PendingIssue[], seenFileIds: new Set<string>(), registered: 0 };
  });

  const issues = [...processosResult.issues, ...casosResult.issues, ...attendancesResult.issues, ...assessoriaResult.issues];
  const seenFileIds = new Set<string>([
    ...processosResult.seenFileIds,
    ...casosResult.seenFileIds,
    ...attendancesResult.seenFileIds,
    ...assessoriaResult.seenFileIds,
  ]);
  const registered = processosResult.registered + casosResult.registered + attendancesResult.registered + assessoriaResult.registered;

  // Bonus: Attachment/AssessoriaDocumento do Google Drive já registrado cujo arquivo não apareceu
  // em NENHUM lugar varrido acima — foi apagado ou movido pra fora da estrutura esperada direto
  // no Drive. Reaproveita as listas já carregadas no início da função (ver comentário lá).
  for (const att of googleAttachments) {
    if (!att.storageFileId || seenFileIds.has(att.storageFileId)) continue;
    issues.push({
      driveFileId: att.storageFileId,
      issueType: "ANEXO_SUMIU_DO_DRIVE",
      description: `O anexo "${att.name}" ainda está cadastrado no sistema, mas o arquivo não foi encontrado no Drive.`,
      suggestedFix: `Verifique se o arquivo "${att.name}" foi apagado ou movido para fora da estrutura de pastas esperada no Drive. Se foi apagado por engano, restaure-o na Lixeira do Drive na pasta original; caso contrário, avalie remover este anexo do sistema.`,
      driveUrl: att.driveUrl || undefined,
    });
  }

  for (const doc of googleAssessoriaDocs) {
    if (!doc.storageFileId || seenFileIds.has(doc.storageFileId)) continue;
    issues.push({
      driveFileId: doc.storageFileId,
      issueType: "DOCUMENTO_ASSESSORIA_SUMIU_DO_DRIVE",
      description: `O documento "${doc.name}" da Assessoria ainda está cadastrado no sistema, mas o arquivo não foi encontrado no Drive.`,
      suggestedFix: `Verifique se o arquivo "${doc.name}" foi apagado ou movido para fora da estrutura de pastas esperada no Drive. Se foi apagado por engano, restaure-o na Lixeira do Drive na pasta original; caso contrário, avalie remover este documento do sistema.`,
      driveUrl: doc.driveUrl || undefined,
    });
  }

  // Reconciliação: qualquer DriveSyncIssue ainda aberto de rodadas anteriores que não foi
  // detectado de novo nesta rodada é dado como resolvido. Feito ANTES do upsert dos detectados
  // agora pra não resolver e reabrir o mesmo issue na mesma rodada por engano. Uma única consulta
  // traz TODAS as linhas do escritório (abertas ou não) — serve tanto para decidir quem foi
  // resolvido quanto, mais abaixo, para separar create de update em lote (ver
  // applyDetectedIssues), no lugar do upsert um a um que existia antes (achado A69 da revisão
  // gauntlet, item 2 da solução proposta).
  const existingRows = await prisma.driveSyncIssue.findMany({
    where: { officeId },
    select: { driveFileId: true, issueType: true, resolvedAt: true },
  });
  const existingKeys = new Set(existingRows.map((r) => `${r.driveFileId}::${r.issueType}`));

  const detectedKeys = new Set(issues.map((i) => `${i.driveFileId}::${i.issueType}`));
  const toResolve = existingRows.filter((r) => r.resolvedAt === null && !detectedKeys.has(`${r.driveFileId}::${r.issueType}`));

  // Resolve em lote, AGRUPADO POR issueType: um updateMany com driveFileId: {in: [...]} teria que
  // ser feito por grupo, porque driveFileId e issueType juntos são a chave — um updateMany único
  // misturando todos os pares casaria driveFileId de um tipo com issueType de outro por engano.
  let issuesResolved = 0;
  if (toResolve.length > 0) {
    const byType = new Map<string, string[]>();
    for (const r of toResolve) {
      const list = byType.get(r.issueType) ?? [];
      list.push(r.driveFileId);
      byType.set(r.issueType, list);
    }
    await Promise.all(
      Array.from(byType.entries()).map(([issueType, driveFileIds]) =>
        prisma.driveSyncIssue.updateMany({
          where: { officeId, issueType, driveFileId: { in: driveFileIds }, resolvedAt: null },
          data: { resolvedAt: new Date() },
        })
      )
    );
    issuesResolved = toResolve.length;
  }

  await applyDetectedIssues(officeId, issues, existingKeys);

  // Round-robin entre escritórios (ver comentário do campo no schema e de syncAllOfficesDrive) —
  // marcado só ao final de uma rodada que de fato terminou, nunca em caso de falha nem para
  // escritório sem Drive conectado (early return acima).
  await prisma.office.update({ where: { id: officeId }, data: { lastDriveSyncAt: new Date() } });

  return { registered, issuesFound: issues.length, issuesResolved };
}

// Chamado pelo cron diário — varre todos os escritórios da plataforma, isolando a falha de um
// (ex: refresh_token revogado) sem interromper os demais, mesmo padrão de
// lib/actions/billing.ts:reconcilePendingInvoices.
//
// Ordenado por lastDriveSyncAt (nulls primeiro, depois mais antigo primeiro): um round-robin
// simples. Sem isto, a ordem era sempre a mesma (findMany sem orderBy, efetivamente a ordem de
// criação) — se o cron estourasse os 300s antes de terminar todos, os escritórios do FIM da lista
// nunca eram sincronizados, sempre os mesmos (achado A69 da revisão gauntlet, item 4 da solução
// proposta).
export async function syncAllOfficesDrive(): Promise<{
  officesSynced: number;
  officesSkipped: number;
  officesFailed: number;
  registered: number;
  issuesFound: number;
  issuesResolved: number;
}> {
  const offices = await prisma.office.findMany({
    select: { id: true },
    orderBy: { lastDriveSyncAt: { sort: "asc", nulls: "first" } },
  });

  let officesSynced = 0;
  let officesSkipped = 0;
  let officesFailed = 0;
  let registered = 0;
  let issuesFound = 0;
  let issuesResolved = 0;

  for (const office of offices) {
    try {
      const connected = await hasPrimaryDriveCredential(office.id);
      if (!connected) {
        officesSkipped++;
        continue;
      }
      const result = await syncOfficeDrive(office.id);
      officesSynced++;
      registered += result.registered;
      issuesFound += result.issuesFound;
      issuesResolved += result.issuesResolved;
    } catch (e) {
      officesFailed++;
      console.error(`[drive-sync] falha ao sincronizar escritório ${office.id}:`, e);
    }
  }

  return { officesSynced, officesSkipped, officesFailed, registered, issuesFound, issuesResolved };
}
