import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";

type EmailAccount = { label: string; host: string; port: number; user: string; pass: string; secure?: boolean };

export type SyncResult = {
  accountsScanned: number;
  found: number;
  created: number;
  skipped: number;
  errors: string[];
};

const RELEVANT_SENDERS = ["publicacoes-diarios@jusbrasil.com.br", "andamentos@jusbrasil.com.br"];

function getAccounts(): EmailAccount[] {
  const raw = process.env.JUSBRASIL_EMAIL_ACCOUNTS;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

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

async function findCaseIdByProcessNumber(processNumberRaw: string | null): Promise<string | null> {
  if (!processNumberRaw) return null;
  const digits = processNumberRaw.replace(/\D/g, "");
  const allCases = await prisma.case.findMany({ where: { processNumber: { not: null } }, select: { id: true, processNumber: true } });
  const found = allCases.find((c) => c.processNumber && c.processNumber.replace(/\D/g, "") === digits);
  return found?.id ?? null;
}

async function syncAccount(account: EmailAccount, result: SyncResult) {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure ?? true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const priorSync = await prisma.publication.findFirst({ where: { emailAccount: account.user } });
      const since = priorSync ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : undefined;

      const uidSets = await Promise.all(
        RELEVANT_SENDERS.map((from) => client.search(since ? { from, since } : { from }, { uid: true }))
      );
      const allUids = [...new Set(uidSets.flatMap((u) => (Array.isArray(u) ? u : [])))];

      for (const uid of allUids) {
        result.found++;
        try {
          const { content: rawSource } = await client.download(String(uid), undefined, { uid: true });
          const chunks: Buffer[] = [];
          for await (const chunk of rawSource) chunks.push(chunk as Buffer);
          const parsed = await simpleParser(Buffer.concat(chunks));

          const baseMessageId = parsed.messageId || `${account.user}-${uid}`;
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

            const caseId = await findCaseIdByProcessNumber(entry.processNumber);

            await prisma.publication.create({
              data: {
                kind: entry.kind,
                source: "JUSBRASIL_EMAIL",
                content: entry.content,
                publishedAt: parsed.date || new Date(),
                emailMessageId,
                emailAccount: account.user,
                emailSubject: subject,
                processNumberRaw: entry.processNumber,
                lawyerTag: detectLawyerTag(entry.content),
                caseId,
              },
            });
            result.created++;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "erro desconhecido";
          result.errors.push(`${account.label}: ${message}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function syncJusbrasilEmails(): Promise<SyncResult> {
  const accounts = getAccounts();
  const result: SyncResult = { accountsScanned: 0, found: 0, created: 0, skipped: 0, errors: [] };

  if (accounts.length === 0) {
    result.errors.push("Nenhuma conta configurada (JUSBRASIL_EMAIL_ACCOUNTS ausente).");
    return result;
  }

  for (const account of accounts) {
    result.accountsScanned++;
    try {
      await syncAccount(account, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.errors.push(`${account.label}: falha de conexão — ${message}`);
    }
  }

  return result;
}
