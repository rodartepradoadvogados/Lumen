import { google } from "googleapis";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { getOAuthClient } from "@/lib/googleDrive";
import { enqueueNotification } from "@/lib/notificationOutbox";

export type SyncResult = {
  accountsScanned: number;
  found: number;
  created: number;
  createdPublicacoes: number;
  createdAndamentos: number;
  skipped: number;
  errors: string[];
};

// Exportados para reuso em lib/outlookEmailSync.ts — mesma extração de conteúdo, fonte de
// mensagens diferente (Microsoft Graph em vez de Gmail).
export const RELEVANT_SENDERS = ["publicacoes-diarios@jusbrasil.com.br", "andamentos@jusbrasil.com.br"];

// Captura ampla (best-effort): fora dos e-mails do Jusbrasil (formato conhecido, parsing
// específico acima), muitos tribunais avisam diretamente por e-mail — sem um padrão único de
// remetente/layout entre eles (cada TJ/TRT/TRF/PJE/eSaj/Projudi/eProc tem o seu). Em vez de
// tentar reconhecer cada um, filtra por ASSUNTO contendo termos típicos de comunicação
// processual e extrai o que der pra extrair de forma genérica (ver o branch "captura ampla"
// dentro de processMessage) — melhor um registro bruto capturado do que a publicação passar
// batido.
export const BROAD_SUBJECT_KEYWORDS = [
  "publicação",
  "publicacao",
  "intimação",
  "intimacao",
  "despacho",
  "andamento processual",
  "comunicação processual",
  "comunicacao processual",
  "diário de justiça",
  "diario de justica",
  "movimentação processual",
  "movimentacao processual",
];

// Domínios de sistemas de tribunais conhecidos — só para etiquetar `Publication.source` na
// captura ampla (o filtro em si é por assunto, acima). Lista não exaustiva; sem um padrão
// reconhecido, cai no default "DJE" (diário de justiça genérico).
const COURT_SYSTEM_DOMAIN_PATTERNS: { pattern: RegExp; source: string }[] = [
  { pattern: /comunicaapi?\.pje/i, source: "DJEN" },
  { pattern: /pje\.jus\.br/i, source: "PJE" },
  { pattern: /esaj/i, source: "ESAJ" },
  { pattern: /projudi/i, source: "PROJUDI" },
  { pattern: /eproc/i, source: "EPROC" },
];

export function detectCourtSystemSource(senderAddress: string): string {
  const found = COURT_SYSTEM_DOMAIN_PATTERNS.find((p) => p.pattern.test(senderAddress));
  return found?.source ?? "DJE";
}

export type ExtractedEntry = { processNumber: string | null; content: string; kind: string };

const PROCESS_NUMBER_RE = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/;

const JAIRO_OAB_RE = /78[.\s]?295/;
const RODRIGO_OAB_RE = /32[.\s]?943/;

export function detectLawyerTag(text: string): string | null {
  const hasJairo = JAIRO_OAB_RE.test(text);
  const hasRodrigo = RODRIGO_OAB_RE.test(text);
  if (hasJairo && hasRodrigo) return "Jairo e Rodrigo";
  if (hasJairo) return "Jairo";
  if (hasRodrigo) return "Rodrigo";
  return null;
}

// publicacoes-diarios@jusbrasil.com.br: blocos repetidos iniciando em "Processo <numero>", "Processo nº <numero>" ou "Título - <numero> - ..."
export function extractPublicacoes(text: string): ExtractedEntry[] {
  const entries: ExtractedEntry[] = [];
  const blocks = text
    .split(/(?=Processo\s*n?[ºo]?\.?\s*\d)|(?=Título\s*-\s*\d)/gi)
    .filter((b) => /^(Processo\s*n?[ºo]?\.?\s*\d|Título\s*-\s*\d)/i.test(b.trim()));
  for (const block of blocks) {
    entries.push({
      processNumber: extractProcessNumber(block),
      content: block.trim().slice(0, 3000),
      kind: "PUBLICACAO",
    });
  }
  return entries;
}

export function extractProcessNumber(block: string): string | null {
  const cnj = block.match(PROCESS_NUMBER_RE);
  if (cnj) return cnj[0];
  const loose = block.match(/(?:Processo|NR\.?\s*PROCESSO|N[ÚU]MERO\s*[ÚU]NICO)\s*:?\s*n?[ºo]?\.?\s*(\d[\d.\-]{5,})/i);
  return loose ? loose[1] : null;
}

// andamentos@jusbrasil.com.br: blocos repetidos iniciando em "TÍTULO Processo"
export function extractAndamentos(text: string): ExtractedEntry[] {
  const entries: ExtractedEntry[] = [];
  const blocks = text.split(/(?=TÍTULO\s*Processo)/g).filter((b) => /^TÍTULO\s*Processo/.test(b.trim()));
  for (const block of blocks) {
    const cleaned = block.replace(/Abrir no Jusbrasil.*$/s, "").trim();
    entries.push({
      processNumber: extractProcessNumber(block),
      content: cleaned.slice(0, 3000),
      kind: "ANDAMENTO",
    });
  }
  return entries;
}

export async function findCaseIdByProcessNumber(processNumberRaw: string | null, officeId: string): Promise<string | null> {
  if (!processNumberRaw) return null;
  const digits = processNumberRaw.replace(/\D/g, "");
  const allCases = await prisma.case.findMany({ where: { officeId, processNumber: { not: null } }, select: { id: true, processNumber: true } });
  const found = allCases.find((c) => c.processNumber && c.processNumber.replace(/\D/g, "") === digits);
  return found?.id ?? null;
}

export async function findClientIdByName(content: string, officeId: string): Promise<string | null> {
  const clients = await prisma.client.findMany({ where: { officeId }, select: { id: true, name: true } });
  const normalized = content.toLowerCase();
  for (const client of clients) {
    const name = client.name.trim().toLowerCase();
    if (name.length >= 5 && normalized.includes(name)) return client.id;
  }
  return null;
}

// Cada escritório conecta sua própria conta Google para o Jusbrasil (GoogleCredential.officeId)
// — diferente do robô Python (lib/roboBridge.ts), aqui já dá pra saber de verdade a qual
// escritório cada e-mail encontrado pertence, direto da credencial que o encontrou.
async function getGmailClients(): Promise<{ gmail: ReturnType<typeof google.gmail>; accountEmail: string; officeId: string }[]> {
  const creds = await prisma.googleCredential.findMany({ where: { syncJusbrasil: true } });
  return creds.map((cred) => {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: cred.refreshToken });
    return { gmail: google.gmail({ version: "v1", auth: client }), accountEmail: cred.accountEmail, officeId: cred.officeId };
  });
}

async function processMessage(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
  accountEmail: string,
  officeId: string,
  result: SyncResult,
  isKnownJusbrasilSender: boolean
) {
  const raw = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
  if (!raw.data.raw) return;
  const parsed = await simpleParser(Buffer.from(raw.data.raw, "base64url"));

  const baseMessageId = parsed.messageId || `gmail-${messageId}`;
  const senderAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || "";
  // Decodificado ANTES da extração: as regex que quebram o corpo em blocos procuram por
  // rótulos acentuados ("Publicação", "Órgão"), que não casariam com o texto escapado.
  const bodyText = decodificarEntidadesHtml((parsed.text || "").trim());
  const subject = parsed.subject || "";
  const source = isKnownJusbrasilSender ? "JUSBRASIL_EMAIL" : detectCourtSystemSource(senderAddress);

  const defaultKind = /publica[cç][aã]o/i.test(subject) || senderAddress.includes("publicacoes-diarios") ? "PUBLICACAO" : "ANDAMENTO";
  let entries: ExtractedEntry[] = [];
  if (senderAddress.includes("publicacoes-diarios")) {
    entries = extractPublicacoes(bodyText);
  } else if (senderAddress.includes("andamentos")) {
    entries = extractAndamentos(bodyText);
  }
  // Captura ampla (fonte fora do Jusbrasil): sem layout conhecido pra quebrar em blocos —
  // um único registro com o corpo inteiro do e-mail (ou o assunto, se o corpo vier vazio) e
  // o número de processo que a regex genérica conseguir achar.
  if (entries.length === 0) {
    entries = [{ processNumber: extractProcessNumber(bodyText), content: bodyText.slice(0, 3000) || subject, kind: defaultKind }];
  }

  for (const [idx, entry] of entries.entries()) {
    const emailMessageId = entries.length > 1 ? `${baseMessageId}#${idx}` : baseMessageId;
    const already = await prisma.publication.findUnique({ where: { emailMessageId } });
    if (already) {
      result.skipped++;
      continue;
    }

    // Deduplicação por conteúdo: a mesma intimação pode chegar em mais de um e-mail
    // (contas diferentes ou reenvio). Compara dia + número do processo + início do texto.
    const publishedAt = parsed.date || new Date();
    const dayStart = new Date(publishedAt.getFullYear(), publishedAt.getMonth(), publishedAt.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const contentPrefix = entry.content.slice(0, 200);
    const duplicate = await prisma.publication.findFirst({
      where: {
        officeId,
        publishedAt: { gte: dayStart, lt: dayEnd },
        processNumberRaw: entry.processNumber,
        content: { startsWith: contentPrefix },
      },
    });
    if (duplicate) {
      result.skipped++;
      continue;
    }

    const caseId = await findCaseIdByProcessNumber(entry.processNumber, officeId);
    const clientId = caseId ? null : await findClientIdByName(entry.content, officeId);

    await prisma.publication.create({
      data: {
        officeId,
        kind: entry.kind,
        source,
        content: entry.content,
        publishedAt,
        emailMessageId,
        emailAccount: accountEmail,
        emailSubject: subject,
        processNumberRaw: entry.processNumber,
        clientId,
        lawyerTag: detectLawyerTag(entry.content),
        caseId,
      },
    });
    result.created++;
    if (entry.kind === "PUBLICACAO") result.createdPublicacoes++;
    else result.createdAndamentos++;
  }
}

export async function syncJusbrasilEmails(): Promise<SyncResult> {
  const result: SyncResult = { accountsScanned: 0, found: 0, created: 0, createdPublicacoes: 0, createdAndamentos: 0, skipped: 0, errors: [] };

  const clients = await getGmailClients();
  if (clients.length === 0) {
    result.errors.push("Nenhuma conta de e-mail conectada. Vá em Meu Perfil e conecte pelo menos um e-mail.");
    return result;
  }

  const senderQuery = RELEVANT_SENDERS.map((s) => `from:${s}`).join(" OR ");
  const broadSubjectQuery = BROAD_SUBJECT_KEYWORDS.map((k) => `subject:"${k}"`).join(" OR ");
  const excludeKnownSenders = RELEVANT_SENDERS.map((s) => `-from:${s}`).join(" ");

  for (const { gmail, accountEmail, officeId } of clients) {
    result.accountsScanned++;
    try {
      // "Desde quando" buscar é por escritório — o último e-mail já importado PARA ESTE
      // escritório (de qualquer fonte), não o mais recente da plataforma inteira.
      const priorSync = await prisma.publication.findFirst({
        // Lista de sources válidos de Publication — mantida em sincronia com lib/outlookEmailSync.ts
        // (a mesma lista existe lá) e agora também com "PNCP" (lib/pncpBridge.ts, Fase 1) e "DOU"
        // (lib/douBridge.ts, Fase 2 do Setor de Processos Administrativos), pelo mesmo motivo
        // que "DJEN" está aqui.
        where: { officeId, source: { in: ["JUSBRASIL_EMAIL", "DJE", "PJE", "ESAJ", "PROJUDI", "EPROC", "DJEN", "PNCP", "DOU"] } },
        orderBy: { publishedAt: "desc" },
      });
      const sinceDate = priorSync ? priorSync.publishedAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const afterEpochSeconds = Math.floor(sinceDate.getTime() / 1000);

      // Duas buscas: a conhecida (remetentes do Jusbrasil, parsing específico) e a ampla
      // (assunto com termos de comunicação processual, qualquer remetente — exceto os já
      // cobertos pela primeira, pra não processar a mesma mensagem duas vezes).
      const knownQuery = `(${senderQuery}) after:${afterEpochSeconds}`;
      const broadQuery = `(${broadSubjectQuery}) ${excludeKnownSenders} after:${afterEpochSeconds}`;

      async function listAllIds(q: string): Promise<string[]> {
        const ids: string[] = [];
        let pageToken: string | undefined;
        do {
          const list = await gmail.users.messages.list({ userId: "me", q, maxResults: 100, pageToken });
          for (const m of list.data.messages ?? []) if (m.id) ids.push(m.id);
          pageToken = list.data.nextPageToken ?? undefined;
        } while (pageToken);
        return ids;
      }

      const [knownIds, broadIds] = await Promise.all([listAllIds(knownQuery), listAllIds(broadQuery)]);
      const messageIds = [
        ...knownIds.map((id) => ({ id, known: true })),
        ...broadIds.map((id) => ({ id, known: false })),
      ];

      const before = { publicacoes: result.createdPublicacoes, andamentos: result.createdAndamentos };
      for (const { id: messageId, known } of messageIds) {
        result.found++;
        try {
          await processMessage(gmail, messageId, accountEmail, officeId, result, known);
        } catch (e) {
          const message = e instanceof Error ? e.message : "erro desconhecido";
          result.errors.push(`[${accountEmail}] Mensagem ${messageId}: ${message}`);
        }
      }

      // Notifica só a equipe DESTE escritório sobre o que foi criado a partir desta conta.
      const createdPublicacoesHere = result.createdPublicacoes - before.publicacoes;
      const createdAndamentosHere = result.createdAndamentos - before.andamentos;
      if (createdPublicacoesHere > 0 || createdAndamentosHere > 0) {
        const activeUserIds = (await prisma.user.findMany({ where: { active: true, officeId }, select: { id: true } })).map((u) => u.id);
        // Balde de hora — mesma limitação/motivo do outlookEmailSync.ts (delta agregado, sem id
        // de item individual pra dedupeKey estável). Ver lib/notificationOutbox.ts.
        const balde = new Date().toISOString().slice(0, 13);
        if (createdPublicacoesHere > 0) {
          for (const userId of activeUserIds) {
            enqueueNotification({
              userId,
              officeId,
              event: "PUBLICACAO_NOVA",
              title: "Novas publicações",
              body: `${createdPublicacoesHere} nova(s) publicação(ões) recebida(s).`,
              url: "/m/publicacoes",
              vars: { teor: `${createdPublicacoesHere} nova(s) publicação(ões) recebida(s).` },
              dedupeKey: `PUBLICACAO_NOVA:jusbrasil:${officeId}:${userId}:${balde}`,
            });
          }
        }
        if (createdAndamentosHere > 0) {
          for (const userId of activeUserIds) {
            enqueueNotification({
              userId,
              officeId,
              event: "ANDAMENTO_PROCESSUAL",
              title: "Novos andamentos processuais",
              body: `${createdAndamentosHere} novo(s) andamento(s) recebido(s).`,
              url: "/m/publicacoes",
              vars: { teor: `${createdAndamentosHere} novo(s) andamento(s) recebido(s).` },
              dedupeKey: `ANDAMENTO_PROCESSUAL:jusbrasil:${officeId}:${userId}:${balde}`,
            });
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.errors.push(
        `[${accountEmail}] Falha ao consultar o Gmail — ${message}. Reconecte essa conta em Configurações para autorizar o acesso ao Gmail.`
      );
    }
  }

  return result;
}
