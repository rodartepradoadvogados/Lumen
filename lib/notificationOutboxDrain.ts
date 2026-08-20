import { prisma } from "@/lib/prisma";
import { sendRawPush } from "@/lib/push";
import { sendSimpleEmail } from "@/lib/email";
import { buildDigestEmailHtml, type TemplateVarValues } from "@/lib/emailTemplateRender";
import { DEFAULT_TEMPLATES } from "@/lib/comunicadosTemplatesPadrao";
import type { NotificationEvent } from "@/lib/comunicadosEventos";

type OutboxPayload = { title: string; body: string; url: string | null; vars?: TemplateVarValues };
type OutboxRow = { id: string; userId: string; officeId: string; channel: string; event: string; payload: unknown };

// Drena NotificationOutbox: agrupa por (usuário, canal) e manda UM e-mail e UM push por pessoa
// por rodada — nunca um por evento (documento 06). Quando o grupo tem exatamente 1 item, o
// e-mail usa o TEMPLATE de verdade daquele evento (EmailTemplate salvo pelo escritório, ou o
// padrão embutido em lib/comunicadosTemplatesPadrao.ts) — o mesmo texto que o admin edita e vê na
// prévia em components/comunicados/TemplateEditor.tsx, nunca um texto solto diferente. Quando o
// grupo tem 2+ itens (vários eventos batidos no mesmo horário de resumo), não há UM template
// aplicável — cai num resumo genérico com a mesma casca visual (buildDigestEmailHtml), listando
// cada item.
async function renderGroupEmail(officeId: string, items: (OutboxPayload & { event: string })[]): Promise<{ subject: string; html: string }> {
  if (items.length === 1) {
    const item = items[0];
    const event = item.event as NotificationEvent;
    const salvo = await prisma.emailTemplate.findUnique({ where: { officeId_event: { officeId, event } } });
    const template = salvo ?? DEFAULT_TEMPLATES[event] ?? { subject: item.title, bodyHtml: `<p>${item.body}</p>` };
    return {
      subject: template.subject,
      html: buildDigestEmailHtml({ subject: template.subject, bodyHtml: template.bodyHtml, url: item.url ?? undefined, vars: item.vars ?? {} }),
    };
  }
  const listaHtml = items
    .map((i) => `<p><strong>${i.title}</strong><br/>${i.body}</p>`)
    .join("");
  return { subject: "Seu resumo do Lúmen", html: buildDigestEmailHtml({ subject: "Seu resumo do Lúmen", bodyHtml: listaHtml, vars: {} }) };
}

async function processGroups(rows: OutboxRow[]): Promise<{ processed: number; emailsSent: number; pushSent: number }> {
  if (rows.length === 0) return { processed: 0, emailsSent: 0, pushSent: 0 };

  const groups = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    const key = `${row.userId}:${row.channel}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  let emailsSent = 0;
  let pushSent = 0;
  const processedIds: string[] = [];

  for (const [key, group] of groups) {
    const [userId, channel] = key.split(":");
    const officeId = group[0].officeId;
    const items = group.map((r) => ({ ...(r.payload as OutboxPayload), event: r.event }));

    if (channel === "PUSH") {
      const body = items.length === 1 ? items[0].body : `${items.length} atualização(ões) desde o último resumo.`;
      const result = await sendRawPush(userId, officeId, { title: "Lúmen", body, url: items[0]?.url ?? undefined });
      if (result.sent > 0) pushSent++;
    } else if (channel === "EMAIL") {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email) {
        const { subject, html } = await renderGroupEmail(officeId, items);
        const result = await sendSimpleEmail(user.email, subject, html);
        if (result.sent) emailsSent++;
      }
    }
    // IN_APP: não existe central de notificações in-app no produto hoje (achado da investigação
    // da PR "outbox e cron de agrupamento") — só marca como processado, pra não acumular pra
    // sempre. Construir a central é fora do escopo desta fase.

    processedIds.push(...group.map((r) => r.id));
  }

  await prisma.notificationOutbox.updateMany({ where: { id: { in: processedIds } }, data: { sentAt: new Date() } });
  return { processed: rows.length, emailsSent, pushSent };
}

// Chamado só por app/api/cron/comunicados-outbox/route.ts, agora ativo em vercel.json (corte do
// outbox — os envios em tempo real/crons antigos equivalentes foram removidos, ver
// lib/actions/tasks.ts, lib/outlookEmailSync.ts, lib/jusbrasilEmailSync.ts, lib/roboBridge.ts).
export async function drainNotificationOutbox(): Promise<{ processed: number; emailsSent: number; pushSent: number }> {
  const now = new Date();
  const due = await prisma.notificationOutbox.findMany({
    where: { dueAt: { lte: now }, sentAt: null },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  return processGroups(due);
}

// Drena só as linhas indicadas, na hora, ignorando dueAt — usado quando o envio não pode esperar
// o próximo tick do cron (até 15min): hoje só o convite de equipe (lib/actions/settings.ts:
// createUser), porque sem ele a pessoa recém-cadastrada não tem nenhum jeito de entrar no
// sistema. Não usar para os demais eventos — drenar tudo aqui dentro de uma Server Action comum
// escala mal (o cron já processa até 1000 linhas de QUALQUER escritório de uma vez); esta versão
// filtra por id, então só processa exatamente o que foi passado.
export async function drainSpecificNotifications(ids: string[]): Promise<{ processed: number; emailsSent: number; pushSent: number }> {
  if (ids.length === 0) return { processed: 0, emailsSent: 0, pushSent: 0 };
  const rows = await prisma.notificationOutbox.findMany({ where: { id: { in: ids }, sentAt: null } });
  return processGroups(rows);
}
