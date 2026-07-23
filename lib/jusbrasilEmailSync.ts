import { google } from "googleapis";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { getOAuthClient } from "@/lib/googleDrive";
import { broadcastPushIfEnabled } from "@/lib/push";

export type SyncResult = {
  accountsScanned: number;
  found: number;
  created: number;
  createdPublicacoes: number;
  createdAndamentos: number;
  skipped: number;
  errors: string[];
};

const RELEVANT_SENDERS = ["publicacoes-diarios@jusbrasil.com.br", "andamentos@jusbrasil.com.br"];

type ExtractedEntry = { processNumber: string | null; content: string; kind: string };

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
function extractPublicacoes(text: string): ExtractedEntry[] {
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

function extractProcessNumber(block: string): string | null {
  const cnj = block.match(PROCESS_NUMBER_RE);
  if (cnj) return cnj[0];
  const loose = block.match(/(?:Processo|NR\.?\s*PROCESSO|N[ÚU]MERO\s*[ÚU]NICO)\s*:?\s*n?[ºo]?\.?\s*(\d[\d.\-]{5,})/i);
  return loose ? loose[1] : null;
}

// andamentos@jusbrasil.com.br: blocos repetidos iniciando em "TÍTULO Processo"
function extractAndamentos(text: string): ExtractedEntry[] {
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

async function findCaseIdByProcessNumber(processNumberRaw: string | null, officeId: string): Promise<string | null> {
  if (!processNumberRaw) return null;
  const digits = processNumberRaw.replace(/\D/g, "");
  const allCases = await prisma.case.findMany({ where: { officeId, processNumber: { not: null } }, select: { id: true, processNumber: true } });
  const found = allCases.find((c) => c.processNumber && c.processNumber.replace(/\D/g, "") === digits);
  return found?.id ?? null;
}

async function findClientIdByName(content: string, officeId: string): Promise<string | null> {
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

async function processMessage(gmail: ReturnType<typeof google.gmail>, messageId: string, accountEmail: string, officeId: string, result: SyncResult) {
  const raw = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
  if (!raw.data.raw) return;
  const parsed = await simpleParser(Buffer.from(raw.data.raw, "base64url"));

  const baseMessageId = parsed.messageId || `gmail-${messageId}`;
  const senderAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || "";
  const bodyText = (parsed.text || "").trim();
  const subject = parsed.subject || "";

  const defaultKind = senderAddress.includes("publicacoes-diarios") ? "PUBLICACAO" : "ANDAMENTO";
  let entries: ExtractedEntry[] = [];
  if (senderAddress.includes("publicacoes-diarios")) {
    entries = extractPublicacoes(bodyText);
  } else if (senderAddress.includes("andamentos")) {
    entries = extractAndamentos(bodyText);
  }
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
        source: "JUSBRASIL_EMAIL",
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
    result.errors.push("Nenhuma conta do Google conectada para o Jusbrasil. Vá em Configurações e conecte pelo menos um e-mail.");
    return result;
  }

  const senderQuery = RELEVANT_SENDERS.map((s) => `from:${s}`).join(" OR ");

  for (const { gmail, accountEmail, officeId } of clients) {
    result.accountsScanned++;
    try {
      // "Desde quando" buscar é por escritório — o último e-mail do Jusbrasil já
      // importado PARA ESTE escritório, não o mais recente da plataforma inteira.
      const priorSync = await prisma.publication.findFirst({
        where: { officeId, source: "JUSBRASIL_EMAIL" },
        orderBy: { publishedAt: "desc" },
      });
      const sinceDate = priorSync ? priorSync.publishedAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const afterEpochSeconds = Math.floor(sinceDate.getTime() / 1000);
      const query = `(${senderQuery}) after:${afterEpochSeconds}`;

      const messageIds: string[] = [];
      let pageToken: string | undefined;
      do {
        const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 100, pageToken });
        for (const m of list.data.messages ?? []) if (m.id) messageIds.push(m.id);
        pageToken = list.data.nextPageToken ?? undefined;
      } while (pageToken);

      const before = { publicacoes: result.createdPublicacoes, andamentos: result.createdAndamentos };
      for (const messageId of messageIds) {
        result.found++;
        try {
          await processMessage(gmail, messageId, accountEmail, officeId, result);
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
        if (createdPublicacoesHere > 0) {
          broadcastPushIfEnabled(activeUserIds, "publicacoes", {
            title: "Novas publicações",
            body: `${createdPublicacoesHere} nova(s) publicação(ões) recebida(s).`,
            url: "/m/publicacoes",
          }).catch(() => {});
        }
        if (createdAndamentosHere > 0) {
          broadcastPushIfEnabled(activeUserIds, "andamentos", {
            title: "Novos andamentos processuais",
            body: `${createdAndamentosHere} novo(s) andamento(s) recebido(s).`,
            url: "/m/publicacoes",
          }).catch(() => {});
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
