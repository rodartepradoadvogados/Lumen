import { prisma } from "@/lib/prisma";
import { sendRawPush } from "@/lib/push";
import { sendSimpleEmail } from "@/lib/email";

type OutboxPayload = { title: string; body: string; url: string | null };

// Drena NotificationOutbox: agrupa por (usuário, canal) e manda UM e-mail e UM push por pessoa
// por rodada — nunca um por evento (documento 06). Chamado só por
// app/api/cron/comunicados-outbox/route.ts, que por sua vez NÃO está em vercel.json ainda (ver
// comentário no topo de lib/notificationOutbox.ts — fase de sombra).
export async function drainNotificationOutbox(): Promise<{ processed: number; emailsSent: number; pushSent: number }> {
  const now = new Date();
  const due = await prisma.notificationOutbox.findMany({
    where: { dueAt: { lte: now }, sentAt: null },
    orderBy: { dueAt: "asc" },
    take: 1000,
  });
  if (due.length === 0) return { processed: 0, emailsSent: 0, pushSent: 0 };

  const groups = new Map<string, typeof due>();
  for (const row of due) {
    const key = `${row.userId}:${row.channel}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  let emailsSent = 0;
  let pushSent = 0;
  const processedIds: string[] = [];

  for (const [key, rows] of groups) {
    const [userId, channel] = key.split(":");
    const officeId = rows[0].officeId;
    const items = rows.map((r) => r.payload as OutboxPayload);

    if (channel === "PUSH") {
      const body = items.length === 1 ? items[0].body : `${items.length} atualização(ões) desde o último resumo.`;
      const result = await sendRawPush(userId, officeId, { title: "Lúmen", body, url: items[0]?.url ?? undefined });
      if (result.sent > 0) pushSent++;
    } else if (channel === "EMAIL") {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      if (user?.email) {
        const subject = items.length === 1 ? items[0].title : "Seu resumo do Lúmen";
        const result = await sendSimpleEmail(user.email, subject, buildDigestHtml(user.name, items));
        if (result.sent) emailsSent++;
      }
    }
    // IN_APP: não existe central de notificações in-app no produto hoje (achado da investigação
    // desta PR) — só marca como processado, pra não acumular pra sempre. Construir a central é
    // fora do escopo desta fase.

    processedIds.push(...rows.map((r) => r.id));
  }

  await prisma.notificationOutbox.updateMany({ where: { id: { in: processedIds } }, data: { sentAt: now } });
  return { processed: due.length, emailsSent, pushSent };
}

function buildDigestHtml(name: string, items: OutboxPayload[]): string {
  const lis = items
    .map((i) => `<li style="margin-bottom:10px;"><strong style="color:#0f1f3d;">${i.title}</strong><br/><span style="color:#333;">${i.body}</span></li>`)
    .join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#0b1730;padding:16px;text-align:center;">
      <span style="color:#fff;font-weight:700;letter-spacing:1px;">LÚMEN</span>
    </div>
    <div style="padding:20px;background:#fff;">
      <p style="color:#0f1f3d;">Olá, ${name}!</p>
      <p style="color:#0f1f3d;">Seu resumo de hoje:</p>
      <ul style="padding-left:18px;">${lis}</ul>
      <p style="font-size:11px;color:#888;margin-top:20px;">
        Você recebe este resumo uma vez por dia. Altere o horário ou cancele em Lúmen &gt; Configurações &gt; Comunicados.
      </p>
    </div>
  </div>`;
}
