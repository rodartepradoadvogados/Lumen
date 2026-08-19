import { prisma } from "@/lib/prisma";
import { resolveNotificationPreference } from "@/lib/notificationPreference";
import { PER_EVENT_EVENTOS, type PerEventEvento, type BreakthroughEvento, type Canal } from "@/lib/comunicadosEventos";

// Documento 06 (Fase 3 — Comunicados), PR "outbox e cron de agrupamento" — EM SOMBRA: esta
// função só ESCREVE em NotificationOutbox, em paralelo aos envios em tempo real que já existem
// (lib/push.ts) e aos dois crons de e-mail de horário fixo — nenhum dos dois foi removido ou
// alterado. O cron que DRENARIA a fila (app/api/cron/comunicados-outbox) existe mas
// deliberadamente NÃO está em vercel.json: ativá-lo é uma decisão separada, tomada depois de
// conferir que as linhas gravadas aqui estão corretas, e precisa vir acompanhada da remoção dos
// envios antigos equivalentes — senão duplicaria notificação (achado do próprio dono do projeto
// ao decidir o escopo desta PR).

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

// Simplificação deliberada enquanto a fila está em sombra (ninguém lê estas linhas ainda): o
// documento 06 não diz QUE dia da semana a cadência "semanal" cai — só o exemplo "Cobrança em
// atraso · semanal". Fixei segunda-feira como âncora; revisar antes de ativar o cron de verdade.
function nextWeeklyDueAt(digestHour: number, from: Date): Date {
  const d = new Date(from);
  d.setHours(digestHour, 0, 0, 0);
  const diasAteSegunda = (8 - d.getDay()) % 7 || 7;
  if (d.getDay() === 1 && d > from) return d;
  d.setDate(d.getDate() + diasAteSegunda);
  return d;
}

export type NotificationEvent = PerEventEvento | BreakthroughEvento;

// Enfileira UM evento pra UM usuário. Nunca lança (best-effort, mesmo princípio de
// lib/push.ts:sendPushIfEnabled) — falha ao gravar na fila nova não pode derrubar quem chamou,
// que já fez (ou vai fazer) o envio de verdade pelo caminho antigo. `dedupeKey` já vem pronto de
// quem chama (não há um jeito genérico de derivar chave estável pra qualquer evento).
export async function enqueueNotification(params: {
  userId: string;
  officeId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  url?: string;
  dedupeKey: string;
}): Promise<void> {
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
      if (perEventConfig.cadencia === "NUNCA") return;
      channel = perEventConfig.canal;
      if (perEventConfig.cadencia === "NA_HORA") dueAt = now;
      else if (perEventConfig.cadencia === "SEMANAL") dueAt = nextWeeklyDueAt(pref.digestHour, now);
      // Resumo diário desligado (digestOn=false): o evento não pode desaparecer só porque o
      // usuário desligou o resumo — sai imediato em vez de esperar um horário que nunca dispara.
      else dueAt = pref.digestOn ? nextDigestDueAt(pref.digestHour, pref.weekdaysOnly, now) : now;
    } else {
      // Evento sem linha em Bloco 3 e sem marcação em Bloco 2 (breakthrough) — nada a fazer.
      return;
    }

    await prisma.notificationOutbox.create({
      data: {
        officeId: params.officeId,
        userId: params.userId,
        event: params.event,
        channel,
        dueAt,
        dedupeKey: params.dedupeKey,
        payload: { title: params.title, body: params.body, url: params.url ?? null },
      },
    });
  } catch {
    // dedupeKey duplicado (reprocessamento) ou qualquer outro erro — engolido de propósito,
    // ver comentário no topo do arquivo.
  }
}
