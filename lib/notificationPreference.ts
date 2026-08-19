import { prisma } from "@/lib/prisma";
import {
  BREAKTHROUGH_KEYS,
  CANAIS,
  CADENCIAS,
  DEFAULT_PER_EVENT,
  DEFAULT_BREAKTHROUGH,
  isPerEventEvento,
  type ComunicadoPreferencia,
  type PerEventConfig,
  type BreakthroughEvento,
} from "@/lib/comunicadosEventos";

// Resolve a preferência de comunicados de UM usuário (com fallback pro padrão do escritório
// embutido no código, ver lib/comunicadosEventos.ts) — extraído de
// lib/actions/comunicados.ts:getMinhaPreferenciaComunicados pra ser reaproveitado por
// lib/notificationOutbox.ts, que precisa resolver a preferência de QUALQUER usuário (não só
// "quem está logado agora"), ao enfileirar um evento em nome de outra pessoa (ex.: delegação de
// tarefa, publicação nova pra todo mundo do escritório). Módulo comum (não "use server", não
// "use client") — evita duplicar a mesma lógica de fallback nos dois lugares.
export async function resolveNotificationPreference(userId: string): Promise<ComunicadoPreferencia> {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });

  const salvo = (pref?.perEvent as Partial<PerEventConfig> | null) ?? {};
  const perEvent = { ...DEFAULT_PER_EVENT };
  for (const [k, v] of Object.entries(salvo)) {
    if (isPerEventEvento(k) && v && CANAIS.includes(v.canal) && CADENCIAS.includes(v.cadencia)) perEvent[k] = v;
  }

  return {
    digestOn: pref?.digestOn ?? true,
    digestHour: pref?.digestHour ?? 8,
    weekdaysOnly: pref?.weekdaysOnly ?? true,
    breakthrough:
      (pref?.breakthrough as string[] | undefined)?.filter((b): b is BreakthroughEvento => BREAKTHROUGH_KEYS.includes(b as BreakthroughEvento)) ??
      DEFAULT_BREAKTHROUGH,
    perEvent,
  };
}
