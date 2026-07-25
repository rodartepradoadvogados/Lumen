"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { isPushConfigured } from "@/lib/push";

// Remove QUALQUER espaço/quebra de linha (não só nas pontas) e aspas que tenham colado
// junto do valor ao cadastrar a variável de ambiente — um simples .trim() não pega espaço/
// quebra de linha NO MEIO do valor (ex.: colado de um texto que quebrou linha no meio da
// chave), e isso é exatamente o que faz o atob() do navegador recusar a chave com
// "InvalidCharacterError: string not correctly encoded".
function sanitizeVapidKey(raw: string): string {
  return raw.replace(/["'\s]/g, "");
}

export async function getPushPublicKey(): Promise<string | null> {
  if (!isPushConfigured()) return null;
  return sanitizeVapidKey(process.env.VAPID_PUBLIC_KEY!);
}

export type NotificationPrefs = {
  notifyAndamentos: boolean;
  notifyPublicacoes: boolean;
  notifyTarefasDelegadas: boolean;
  notifyAgendaDia: boolean;
  notifyMencoes: boolean;
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
      notifyMencoes: user.notifyMencoes,
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
