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

// Uma chave VAPID pública válida é sempre um ponto EC P-256 não comprimido: exatamente 65
// bytes, começando em 0x04. Decodifica e confere isso AQUI (servidor) pra dar um diagnóstico
// exato em vez do navegador só recusar com "applicationServerKey is not valid" sem dizer por
// quê — economiza uma rodada inteira de "tenta de novo, tira print, manda de novo".
function diagnoseVapidPublicKey(sanitized: string): string | null {
  try {
    const buf = Buffer.from(sanitized, "base64url");
    if (buf.length !== 65) {
      return `A chave VAPID_PUBLIC_KEY salva na Vercel tem ${buf.length} bytes depois de decodificada — deveria ter exatamente 65. Foi colada incompleta ou com algum caractere trocado (comum: hífen "-" virando travessão "—" ao colar de um app de mensagens). Precisa recadastrar a chave certinha.`;
    }
    if (buf[0] !== 0x04) {
      return `A chave VAPID_PUBLIC_KEY salva na Vercel não começa com o byte esperado (0x04) — está corrompida. Precisa recadastrar.`;
    }
    return null;
  } catch (e) {
    return `A chave VAPID_PUBLIC_KEY salva na Vercel não é um base64 válido (${e instanceof Error ? e.message : String(e)}). Precisa recadastrar.`;
  }
}

export async function getPushPublicKey(): Promise<{ publicKey: string | null; diagnostic?: string }> {
  if (!isPushConfigured()) return { publicKey: null };
  const sanitized = sanitizeVapidKey(process.env.VAPID_PUBLIC_KEY!);
  const diagnostic = diagnoseVapidPublicKey(sanitized);
  if (diagnostic) return { publicKey: null, diagnostic };
  return { publicKey: sanitized };
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
