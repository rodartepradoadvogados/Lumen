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

function getAccounts(): EmailAccount[] {
  const raw = process.env.JUSBRASIL_EMAIL_ACCOUNTS;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const PROCESS_NUMBER_RE = /\d{7}-?\d{2}\.?\d{4}\.?\d{1}\.?\d{2}\.?\d{4}/;

function classifyKind(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("andamento") || lower.includes("movimenta")) return "ANDAMENTO";
  return "PUBLICACAO";
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
      const uids = await client.search({ from: "jusbrasil", seen: false }, { uid: true });
      const list = Array.isArray(uids) ? uids : [];

      for (const uid of list) {
        result.found++;
        try {
          const { content: rawSource } = await client.download(String(uid), undefined, { uid: true });
          const chunks: Buffer[] = [];
          for await (const chunk of rawSource) chunks.push(chunk as Buffer);
          const parsed = await simpleParser(Buffer.concat(chunks));

          const messageId = parsed.messageId || `${account.user}-${uid}`;
          const already = await prisma.publication.findUnique({ where: { emailMessageId: messageId } });
          if (already) {
            result.skipped++;
            continue;
          }

          const bodyText = (parsed.text || parsed.html?.toString() || "").trim().slice(0, 5000);
          const subject = parsed.subject || "";
          const processMatch = (subject + " " + bodyText).match(PROCESS_NUMBER_RE);
          const processNumberRaw = processMatch ? processMatch[0] : null;

          let caseId: string | null = null;
          if (processNumberRaw) {
            const digits = processNumberRaw.replace(/\D/g, "");
            const allCases = await prisma.case.findMany({ where: { processNumber: { not: null } }, select: { id: true, processNumber: true } });
            const found = allCases.find((c) => c.processNumber && c.processNumber.replace(/\D/g, "") === digits);
            caseId = found?.id ?? null;
          }

          await prisma.publication.create({
            data: {
              kind: classifyKind(subject + " " + bodyText),
              source: "JUSBRASIL_EMAIL",
              content: bodyText || subject,
              publishedAt: parsed.date || new Date(),
              emailMessageId: messageId,
              emailAccount: account.user,
              emailSubject: subject,
              processNumberRaw,
              caseId,
            },
          });
          result.created++;

          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
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
