import { prisma } from "@/lib/prisma";
import { resolveNotificationPreference } from "@/lib/notificationPreference";
import { PER_EVENT_EVENTOS, type PerEventEvento, type NotificationEvent, type Canal } from "@/lib/comunicadosEventos";
import type { TemplateVarValues } from "@/lib/emailTemplateRender";

// Documento 06 (Fase 3 — Comunicados). Depois do corte (remoção dos envios em tempo real/crons
// antigos equivalentes, ver lib/actions/tasks.ts, lib/outlookEmailSync.ts,
// lib/jusbrasilEmailSync.ts, lib/roboBridge.ts), esta é a ÚNICA porta de entrada pros 10 eventos
// de Comunicados (7 "por evento" + 3 exclusivos de exceção) — o cron de drenagem
// (app/api/cron/comunicados-outbox) está ativo em vercel.json.

// Próxima ocorrência do horário de digest do usuário, respeitando weekdaysOnly — nunca "agora
// mesmo" (sempre pelo menos o próximo horário, mesmo que `from` já esteja nesse horário exato).
function nextDigestDueAt(digestHour: number, weekdaysOnly: boolean, from: Date): Date {
  const d = new Date(from);
  d.setHours(digestHour, 0, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  if (weekdaysOnly) {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  }
  return d;
}

// Simplificação deliberada: o documento 06 não diz QUE dia da semana a cadência "semanal" cai —
// só o exemplo "Cobrança em atraso · semanal". Fixei segunda-feira como âncora.
function nextWeeklyDueAt(digestHour: number, from: Date): Date {
  const d = new Date(from);
  d.setHours(digestHour, 0, 0, 0);
  const diasAteSegunda = (8 - d.getDay()) % 7 || 7;
  if (d.getDay() === 1 && d > from) return d;
  d.setDate(d.getDate() + diasAteSegunda);
  return d;
}

// Enfileira UM evento pra UM usuário. Nunca lança (best-effort, mesmo princípio de
// lib/push.ts:sendPushIfEnabled) — falha ao gravar na fila nova não pode derrubar quem chamou.
// `dedupeKey` já vem pronto de quem chama (não há um jeito genérico de derivar chave estável pra
// qualquer evento). `vars`: valores pras variáveis {{cliente}}/{{processo}}/etc. do template
// (lib/emailTemplateRender.ts) — parcial de propósito, cada chamador só preenche o que já tem à
// mão sem query extra; variável ausente só faz a linha correspondente sumir do e-mail (mesma
// regra de renderTemplateBody), não é erro. Retorna o id da linha criada (para quem precisa
// drenar na hora, ver lib/actions/settings.ts:createUser) ou null se nada foi enfileirado
// (cadência NUNCA, evento sem preferência, dedupeKey duplicado, ou qualquer erro).
export async function enqueueNotification(params: {
  userId: string;
  officeId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  url?: string;
  vars?: TemplateVarValues;
  dedupeKey: string;
}): Promise<{ id: string } | null> {
  try {
    const pref = await resolveNotificationPreference(params.userId);
    const now = new Date();
    const isBreakthrough = (pref.breakthrough as string[]).includes(params.event);
    const perEventConfig = params.event in PER_EVENT_EVENTOS ? pref.perEvent[params.event as PerEventEvento] : undefined;

    let channel: Canal;
    let dueAt: Date;
    if (isBreakthrough) {
      // Pop-up/push imediato (documento 06: "os comunicados... somente uma vez ao dia" — exceto
      // isto). Segue o canal configurado em Bloco 3 quando o evento tem uma linha lá
      // (PUBLICACAO_NOVA); os que só existem como exceção (PRAZO_HOJE, AUDIENCIA_24H,
      // HONORARIO_RECEBIDO) vão de push, o canal do "pop-up no celular" citado no documento.
      channel = perEventConfig?.canal ?? "PUSH";
      dueAt = now;
    } else if (perEventConfig) {
      if (perEventConfig.cadencia === "NUNCA") return null;
      channel = perEventConfig.canal;
      if (perEventConfig.cadencia === "NA_HORA") dueAt = now;
      else if (perEventConfig.cadencia === "SEMANAL") dueAt = nextWeeklyDueAt(pref.digestHour, now);
      // Resumo diário desligado (digestOn=false): o evento não pode desaparecer só porque o
      // usuário desligou o resumo — sai imediato em vez de esperar um horário que nunca dispara.
      else dueAt = pref.digestOn ? nextDigestDueAt(pref.digestHour, pref.weekdaysOnly, now) : now;
    } else {
      // Evento sem linha em Bloco 3 e sem marcação em Bloco 2 (breakthrough) — nada a fazer.
      return null;
    }

    const row = await prisma.notificationOutbox.create({
      data: {
        officeId: params.officeId,
        userId: params.userId,
        event: params.event,
        channel,
        dueAt,
        dedupeKey: params.dedupeKey,
        payload: { title: params.title, body: params.body, url: params.url ?? null, vars: params.vars ?? {} },
      },
    });
    return { id: row.id };
  } catch {
    // dedupeKey duplicado (reprocessamento) ou qualquer outro erro — engolido de propósito,
    // ver comentário no topo do arquivo.
    return null;
  }
}
