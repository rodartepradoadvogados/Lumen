"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { isPushConfigured } from "@/lib/push";

export async function getPushPublicKey(): Promise<string | null> {
  if (!isPushConfigured()) return null;
  return process.env.VAPID_PUBLIC_KEY!;
}

export type NotificationPrefs = {
  notifyAndamentos: boolean;
  notifyPublicacoes: boolean;
  notifyTarefasDelegadas: boolean;
  notifyAgendaDia: boolean;
};

export async function getNotificationSettings(): Promise<{ prefs: NotificationPrefs | null; hasSubscription: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { prefs: null, hasSubscription: false };
  const count = await prisma.pushSubscription.count({ where: { userId: user.id } });
  return {
    prefs: {
      notifyAndamentos: user.notifyAndamentos,
      notifyPublicacoes: user.notifyPublicacoes,
      notifyTarefasDelegadas: user.notifyTarefasDelegadas,
      notifyAgendaDia: user.notifyAgendaDia,
    },
    hasSubscription: count > 0,
  };
}

export async function updateNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  await prisma.user.update({ where: { id: user.id }, data: prefs });
  return {};
}

export async function savePushSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userId: user.id },
    create: { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userId: user.id },
  });
  return {};
}

export async function deletePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return {};
}
