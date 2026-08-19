"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revalidatePath } from "next/cache";
import { BREAKTHROUGH_KEYS, CANAIS, CADENCIAS, DEFAULT_PER_EVENT, isPerEventEvento, type ComunicadoPreferencia, type PerEventConfig } from "@/lib/comunicadosEventos";
import { resolveNotificationPreference } from "@/lib/notificationPreference";

// Documento 06 (Fase 3 — Comunicados): preferência de resumo diário + exceções que furam a
// fila. Esta PR ("resumo diário e exceções") é só a regra e a tela — o que de fato ENFILEIRA um
// evento em NotificationOutbox e o cron que drena a fila são a próxima PR desta fase ("outbox e
// cron de agrupamento"); nenhum ponto de envio real (lib/push.ts, lib/email.ts) foi tocado ainda.
// "use server" só pode exportar funções assíncronas — o vocabulário de eventos/canais/cadências
// mora em lib/comunicadosEventos.ts (módulo puro), importado tanto aqui quanto pelo formulário.

const DEFAULTS: ComunicadoPreferencia = {
  digestOn: true,
  digestHour: 8,
  weekdaysOnly: true,
  breakthrough: ["PRAZO_HOJE", "AUDIENCIA_24H"],
  perEvent: DEFAULT_PER_EVENT,
};

export async function getMinhaPreferenciaComunicados(): Promise<ComunicadoPreferencia> {
  const user = await getCurrentUser();
  if (!user) return DEFAULTS;
  return resolveNotificationPreference(user.id);
}

export async function salvarPreferenciaComunicados(input: ComunicadoPreferencia): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  if (input.digestHour < 0 || input.digestHour > 23 || !Number.isInteger(input.digestHour)) {
    return { error: "Horário inválido." };
  }
  const breakthrough = input.breakthrough.filter((b) => BREAKTHROUGH_KEYS.includes(b));
  const perEvent: PerEventConfig = { ...DEFAULT_PER_EVENT };
  for (const [k, v] of Object.entries(input.perEvent)) {
    if (!isPerEventEvento(k)) continue;
    if (!CANAIS.includes(v.canal) || !CADENCIAS.includes(v.cadencia)) return { error: "Canal ou cadência inválidos." };
    perEvent[k] = v;
  }

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      officeId: user.officeId,
      digestOn: input.digestOn,
      digestHour: input.digestHour,
      weekdaysOnly: input.weekdaysOnly,
      breakthrough,
      perEvent,
    },
    update: { digestOn: input.digestOn, digestHour: input.digestHour, weekdaysOnly: input.weekdaysOnly, breakthrough, perEvent },
  });
  revalidatePath("/configuracoes/comunicados");
  return {};
}
