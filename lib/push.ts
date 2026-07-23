import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// ============================================================================
// Notificações push (Web Push API) — igual ao padrão de lib/whatsapp.ts:
// "env-gated" (dormente e inofensivo enquanto as chaves VAPID não existirem)
// e nunca lança, sempre resolve para { ok, error? }.
// ============================================================================

export type NotificationType = "andamentos" | "publicacoes" | "tarefasDelegadas" | "agendaDia" | "mencao";

const prefFieldByType: Record<
  NotificationType,
  "notifyAndamentos" | "notifyPublicacoes" | "notifyTarefasDelegadas" | "notifyAgendaDia" | "notifyMencoes"
> = {
  andamentos: "notifyAndamentos",
  publicacoes: "notifyPublicacoes",
  tarefasDelegadas: "notifyTarefasDelegadas",
  agendaDia: "notifyAgendaDia",
  mencao: "notifyMencoes",
};

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured || !isPushConfigured()) return;
  webpush.setVapidDetails(
    "mailto:contato@lumen.adv.br",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidConfigured = true;
}

export type PushPayload = { title: string; body: string; url?: string };

/**
 * Envia uma notificação push para todas as inscrições (aparelhos) de um usuário,
 * respeitando a preferência dele para o tipo informado. Nunca lança — falhas de
 * rede/subscription expirada são engolidas (e a subscription expirada é removida).
 *
 * officeId é obrigatório e vem sempre do chamador (nunca do usuário final): sem essa
 * checagem, um userId de outro escritório aceitaria e enviaria a notificação normalmente
 * (o filtro por officeId aqui é a última linha de defesa contra um userId indevido vazar
 * de algum chamador futuro).
 */
export async function sendPushIfEnabled(userId: string, officeId: string, type: NotificationType, payload: PushPayload): Promise<{ sent: number }> {
  if (!isPushConfigured()) return { sent: 0 };
  ensureVapidConfigured();

  const user = await prisma.user.findFirst({
    where: { id: userId, officeId },
    select: {
      notifyAndamentos: true,
      notifyPublicacoes: true,
      notifyTarefasDelegadas: true,
      notifyAgendaDia: true,
      notifyMencoes: true,
      pushSubscriptions: true,
    },
  });
  if (!user || !user[prefFieldByType[type]]) return { sent: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of user.pushSubscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      );
      sent++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Inscrição expirada/revogada pelo navegador — remove para não tentar de novo.
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
  return { sent };
}

/** Mesmo envio, mas para vários usuários de uma vez (ex.: nova publicação para toda a equipe). */
export async function broadcastPushIfEnabled(userIds: string[], officeId: string, type: NotificationType, payload: PushPayload): Promise<void> {
  await Promise.all(userIds.map((id) => sendPushIfEnabled(id, officeId, type, payload)));
}

/**
 * "Agenda do dia": um push por usuário ativo com notifyAgendaDia ligado, contando só as
 * PRÓPRIAS tarefas/compromissos vencendo hoje (diferente do resumo por e-mail em lib/email.ts,
 * que é único para o escritório todo) — chamado pelo cron diário existente
 * (app/api/cron/daily-agenda/route.ts), logo depois do e-mail.
 */
export async function sendDailyAgendaPushes(): Promise<void> {
  if (!isPushConfigured()) return;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { active: true, notifyAgendaDia: true, pushSubscriptions: { some: {} } },
    select: { id: true, officeId: true },
  });

  await Promise.all(
    users.map(async ({ id: userId, officeId }) => {
      const count = await prisma.task.count({
        where: { responsibleId: userId, officeId, dueDate: { gte: start, lt: end }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
      });
      if (count === 0) return;
      await sendPushIfEnabled(userId, officeId, "agendaDia", {
        title: "Agenda de hoje",
        body: `Você tem ${count} compromisso(s) para hoje.`,
        url: "/m/agenda",
      });
    })
  );
}
