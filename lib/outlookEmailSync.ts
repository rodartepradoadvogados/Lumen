// Espelha lib/jusbrasilEmailSync.ts, mas lendo a caixa de entrada via Microsoft Graph (Outlook)
// em vez do Gmail — reusa as mesmas regras de extração/dedup/vínculo com Caso ou Cliente
// (importadas do módulo Gmail) para as duas fontes não divergirem em como interpretam o mesmo
// tipo de e-mail. Dormente sem MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET (ver lib/microsoftGraph.ts).
import { prisma } from "@/lib/prisma";
import { getOutlookMessagesForOffice, isMicrosoftConfigured, type OutlookMessage } from "@/lib/microsoftGraph";
import { broadcastPushIfEnabled } from "@/lib/push";
import {
  RELEVANT_SENDERS,
  BROAD_SUBJECT_KEYWORDS,
  detectCourtSystemSource,
  detectLawyerTag,
  extractPublicacoes,
  extractAndamentos,
  extractProcessNumber,
  findCaseIdByProcessNumber,
  findClientIdByName,
  type ExtractedEntry,
  type SyncResult,
} from "@/lib/jusbrasilEmailSync";

async function processMessage(msg: OutlookMessage, officeId: string, result: SyncResult) {
  const bodyText = msg.bodyText.trim();
  const subject = msg.subject;
  const senderAddress = msg.from;
  const isKnownJusbrasilSender = RELEVANT_SENDERS.includes(senderAddress);
  const source = isKnownJusbrasilSender ? "JUSBRASIL_EMAIL" : detectCourtSystemSource(senderAddress);

  const defaultKind = /publica[cç][aã]o/i.test(subject) || senderAddress.includes("publicacoes-diarios") ? "PUBLICACAO" : "ANDAMENTO";
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
    const emailMessageId = entries.length > 1 ? `${msg.internetMessageId}#${idx}` : msg.internetMessageId;
    const already = await prisma.publication.findUnique({ where: { emailMessageId } });
    if (already) {
      result.skipped++;
      continue;
    }

    const publishedAt = new Date(msg.receivedDateTime);
    const dayStart = new Date(publishedAt.getFullYear(), publishedAt.getMonth(), publishedAt.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const contentPrefix = entry.content.slice(0, 200);
    const duplicate = await prisma.publication.findFirst({
      where: { officeId, publishedAt: { gte: dayStart, lt: dayEnd }, processNumberRaw: entry.processNumber, content: { startsWith: contentPrefix } },
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
        emailAccount: senderAddress,
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

export async function syncOutlookEmails(): Promise<SyncResult> {
  const result: SyncResult = { accountsScanned: 0, found: 0, created: 0, createdPublicacoes: 0, createdAndamentos: 0, skipped: 0, errors: [] };
  if (!isMicrosoftConfigured()) return result;

  const creds = await prisma.microsoftCredential.findMany({ where: { syncEmail: true } });
  if (creds.length === 0) return result;

  for (const cred of creds) {
    result.accountsScanned++;
    try {
      const priorSync = await prisma.publication.findFirst({
        // Lista de sources válidos de Publication — mantida em sincronia com lib/jusbrasilEmailSync.ts
        // (a mesma lista existe lá) e agora também com "PNCP" (lib/pncpBridge.ts, Fase 1 do
        // Setor de Processos Administrativos), pelo mesmo motivo que "DJEN" está aqui.
        where: { officeId: cred.officeId, source: { in: ["JUSBRASIL_EMAIL", "DJE", "PJE", "ESAJ", "PROJUDI", "EPROC", "DJEN", "PNCP"] } },
        orderBy: { publishedAt: "desc" },
      });
      const sinceDate = priorSync ? priorSync.publishedAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const messages = await getOutlookMessagesForOffice(cred, sinceDate);
      const relevant = messages.filter((m) => {
        if (RELEVANT_SENDERS.includes(m.from)) return true;
        const haystack = m.subject.toLowerCase();
        return BROAD_SUBJECT_KEYWORDS.some((k) => haystack.includes(k));
      });

      const before = { publicacoes: result.createdPublicacoes, andamentos: result.createdAndamentos };
      for (const msg of relevant) {
        result.found++;
        try {
          await processMessage(msg, cred.officeId, result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "erro desconhecido";
          result.errors.push(`[${cred.accountEmail}] Mensagem ${msg.id}: ${message}`);
        }
      }

      const createdPublicacoesHere = result.createdPublicacoes - before.publicacoes;
      const createdAndamentosHere = result.createdAndamentos - before.andamentos;
      if (createdPublicacoesHere > 0 || createdAndamentosHere > 0) {
        const activeUserIds = (await prisma.user.findMany({ where: { active: true, officeId: cred.officeId }, select: { id: true } })).map((u) => u.id);
        if (createdPublicacoesHere > 0) {
          broadcastPushIfEnabled(activeUserIds, cred.officeId, "publicacoes", {
            title: "Novas publicações",
            body: `${createdPublicacoesHere} nova(s) publicação(ões) recebida(s).`,
            url: "/m/publicacoes",
          }).catch(() => {});
        }
        if (createdAndamentosHere > 0) {
          broadcastPushIfEnabled(activeUserIds, cred.officeId, "andamentos", {
            title: "Novos andamentos processuais",
            body: `${createdAndamentosHere} novo(s) andamento(s) recebido(s).`,
            url: "/m/publicacoes",
          }).catch(() => {});
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.errors.push(`[${cred.accountEmail}] ${message}`);
    }
  }

  return result;
}
