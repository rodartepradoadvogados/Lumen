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

// Registra (ou atualiza a descrição/correção de) um problema detectado nesta rodada — a
// reconciliação de quem SUMIU (não foi mais detectado) acontece depois, no fim de
// syncOfficeDrive, comparando com o que já existia no banco antes desta rodada.
async function upsertIssue(officeId: string, issue: PendingIssue): Promise<void> {
  await prisma.driveSyncIssue.upsert({
    where: { officeId_driveFileId_issueType: { officeId, driveFileId: issue.driveFileId, issueType: issue.issueType } },
    update: {
      description: issue.description,
      suggestedFix: issue.suggestedFix,
      driveUrl: issue.driveUrl ?? null,
      caseId: issue.caseId ?? null,
      attendanceId: issue.attendanceId ?? null,
      resolvedAt: null,
    },
    create: {
      officeId,
      driveFileId: issue.driveFileId,
      issueType: issue.issueType,
      description: issue.description,
      suggestedFix: issue.suggestedFix,
      driveUrl: issue.driveUrl ?? null,
      caseId: issue.caseId ?? null,
      attendanceId: issue.attendanceId ?? null,
    },
  });
}

// Sugestão de tipo mais provável para uma subpasta com nome não reconhecido — comparação simples
// (substring, sem acento/case) só pra dar uma pista útil no alerta; não decide nada sozinha.
function normalizeForCompare(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

// Processa uma pasta de "container" (processo ou atendimento) já resolvida: lista os filhos,
// separa subpastas de categoria (reconhecidas ou não) de arquivos soltos, registra anexos novos
// e devolve os PendingIssue encontrados aqui dentro + os ids de arquivo "vistos" (pra alimentar
// a checagem de ANEXO_SUMIU_DO_DRIVE no final).
async function syncContainerFolder(
  officeId: string,
  container: ResolvedContainer,
  kind: ContainerKind,
  folderId: string
): Promise<{ issues: PendingIssue[]; seenFileIds: Set<string>; registered: number }> {
  const issues: PendingIssue[] = [];
  const seenFileIds = new Set<string>();
  let registered = 0;

  const children = await listDriveChildren(officeId, folderId);

  for (const child of children) {
    if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) {
      // Pasta de estrutura do sistema ("Protocolos", ver lib/protocolos.ts): não é categoria de
      // tipo de documento e não deve ser varrida. Sem esta saída, cada processo com protocolo
      // geraria PASTA_CATEGORIA_DESCONHECIDA todo dia na Central de Alertas — e, pior, o conteúdo
      // dela (atalhos para documentos que JÁ são anexos registrados) poderia ser registrado de
      // novo, criando exatamente a duplicação que a funcionalidade de protocolos evita.
      if (isReservedCaseSubfolder(child.name)) continue;

      const docTypeKey = CATEGORY_LABEL_TO_KEY.get(child.name);
      // Lista os arquivos da subpasta de qualquer forma (reconhecida ou não) só pra marcar como
      // "vistos" — uma categoria com nome errado não pode fazer os anexos já registrados dela
      // parecerem apagados do Drive (ver ANEXO_SUMIU_DO_DRIVE mais abaixo).
      const categoryFiles = await listDriveChildren(officeId, child.id);
      for (const f of categoryFiles) {
        if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue; // não esperamos sub-subpastas; ignora silenciosamente
        seenFileIds.add(f.id);
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
        continue;
      }

      for (const f of categoryFiles) {
        if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
        const existing = await prisma.attachment.findFirst({ where: { officeId, storageFileId: f.id }, select: { id: true } });
        if (existing) continue;

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
      seenFileIds.add(child.id);
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
async function syncRoot(
  officeId: string,
  kind: ContainerKind,
  rootFolderId: string,
  rootLabel: string,
  tipoLabel: string
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

    const result = await syncContainerFolder(officeId, container, kind, folder.id);
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

// Varre "Lúmen - Assessoria" — estrutura diferente da de processo/atendimento (raiz -> EMPRESA ->
// {Contratos, Licitações, Regimentos Internos, Pareceres} -> arquivos, com "Pareceres" tendo mais
// um nível: Pareceres -> NOME DO PARECER -> arquivos). Documento OUTRO/ACAO_VINCULADA não tem
// subpasta própria por desenho (ver comentário em lib/googleDrive.ts, ASSESSORIA_DOC_TYPE_FOLDERS)
// — um arquivo solto direto na raiz da empresa é o caso ESPERADO pra esses dois tipos, não uma
// inconsistência a relatar (ao contrário do arquivo solto na raiz de um processo/atendimento).
async function syncAssessoriaTree(officeId: string): Promise<{ issues: PendingIssue[]; seenFileIds: Set<string>; registered: number }> {
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
    for (const child of companyChildren) {
      if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
        // Arquivo solto direto na raiz da empresa — esperado pra OUTRO/ACAO_VINCULADA (ver
        // comentário da função). Registra como AssessoriaDocumento "OUTRO" se ainda não existir;
        // não há como saber pelo Drive se era originalmente ACAO_VINCULADA.
        seenFileIds.add(child.id);
        const existing = await prisma.assessoriaDocumento.findFirst({ where: { officeId, storageFileId: child.id }, select: { id: true } });
        if (existing) continue;
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
        registered++;
        continue;
      }

      if (child.name === PARECERES_FOLDER_LABEL) {
        const parecerFolders = await listDriveChildren(officeId, child.id);
        for (const parecerFolder of parecerFolders) {
          if (parecerFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
            // Arquivo solto direto dentro de "Pareceres", fora de qualquer pasta de parecer
            // específico — não é o desenho esperado (todo documento de Parecer vive dentro da
            // pasta do parecer, ver getOrCreateParecerFolder em lib/googleDrive.ts).
            seenFileIds.add(parecerFolder.id);
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
            for (const f of parecerFiles) seenFileIds.add(f.id); // marca como visto mesmo sem parecer, mesma lógica de categoria desconhecida abaixo
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
            seenFileIds.add(f.id);
            const existing = await prisma.assessoriaDocumento.findFirst({ where: { officeId, storageFileId: f.id }, select: { id: true } });
            if (existing) continue;
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
        continue;
      }

      const docTypeKey = ASSESSORIA_CATEGORY_LABEL_TO_KEY.get(child.name);
      const categoryFiles = await listDriveChildren(officeId, child.id);
      for (const f of categoryFiles) {
        if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
        seenFileIds.add(f.id);
      }

      if (!docTypeKey) {
        issues.push({
          driveFileId: child.id,
          issueType: "PASTA_CATEGORIA_ASSESSORIA_DESCONHECIDA",
          description: `A pasta "${child.name}" dentro de "${assessoria.client.name}" não corresponde a nenhuma categoria de documento conhecida da Assessoria.`,
          suggestedFix: `Renomeie a pasta "${child.name}" para um destes nomes exatos: ${Array.from(ASSESSORIA_CATEGORY_LABEL_TO_KEY.keys()).join(", ")} — ou mova os arquivos dela para a subpasta correta e apague esta.`,
          driveUrl: child.webViewLink,
        });
        continue;
      }

      for (const f of categoryFiles) {
        if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
        const existing = await prisma.assessoriaDocumento.findFirst({ where: { officeId, storageFileId: f.id }, select: { id: true } });
        if (existing) continue;
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

  // Os dois roots de "case" (Processos e Casos) rodam em SEQUÊNCIA, não em Promise.all: os dois
  // resolvem contra o mesmo Case por título quando driveFolderId ainda é nulo (linha
  // "driveFolderId: null, title: folder.name" acima) — em paralelo, duas pastas homônimas (uma em
  // cada raiz, caso raríssimo mas possível durante a janela de transição) poderiam "reivindicar" o
  // mesmo Case ao mesmo tempo, e as duas escritas de driveFolderId corririam entre si. Atendimento
  // não compartilha esse risco com nenhum dos dois (tabela diferente), então continua sem custo
  // extra de esperar por eles.
  const processosResult = await syncRoot(officeId, "case", processosRootId, "Lúmen - Processos", "processo");
  const casosResult = await syncRoot(officeId, "case", casosRootId, "Lúmen - Casos", "caso");
  const attendancesResult = await syncRoot(officeId, "attendance", atendimentosRootId, "Lúmen - Atendimentos", "atendimento");
  // Árvore da Assessoria — antes desta entrega ficava totalmente fora do sync reverso (documento
  // arrastado direto pro Drive numa pasta de empresa nunca virava AssessoriaDocumento sozinho).
  const assessoriaResult = await syncAssessoriaTree(officeId).catch((e) => {
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
  // no Drive.
  const googleAttachments = await prisma.attachment.findMany({
    where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } },
    select: { id: true, name: true, storageFileId: true, driveUrl: true },
  });
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

  const googleAssessoriaDocs = await prisma.assessoriaDocumento.findMany({
    where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } },
    select: { id: true, name: true, storageFileId: true, driveUrl: true },
  });
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
  // agora pra não resolver e reabrir o mesmo issue na mesma rodada por engano.
  const openBefore = await prisma.driveSyncIssue.findMany({
    where: { officeId, resolvedAt: null },
    select: { driveFileId: true, issueType: true },
  });
  const detectedKeys = new Set(issues.map((i) => `${i.driveFileId}::${i.issueType}`));
  const toResolve = openBefore.filter((o) => !detectedKeys.has(`${o.driveFileId}::${o.issueType}`));
  let issuesResolved = 0;
  if (toResolve.length > 0) {
    for (const o of toResolve) {
      await prisma.driveSyncIssue.updateMany({
        where: { officeId, driveFileId: o.driveFileId, issueType: o.issueType, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    }
    issuesResolved = toResolve.length;
  }

  for (const issue of issues) {
    await upsertIssue(officeId, issue);
  }

  return { registered, issuesFound: issues.length, issuesResolved };
}

// Chamado pelo cron diário — varre todos os escritórios da plataforma, isolando a falha de um
// (ex: refresh_token revogado) sem interromper os demais, mesmo padrão de
// lib/actions/billing.ts:reconcilePendingInvoices.
export async function syncAllOfficesDrive(): Promise<{
  officesSynced: number;
  officesSkipped: number;
  officesFailed: number;
  registered: number;
  issuesFound: number;
  issuesResolved: number;
}> {
  const offices = await prisma.office.findMany({ select: { id: true } });

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
