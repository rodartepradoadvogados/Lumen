// Prazo sugerido para a triagem de publicações (documento 05 do handoff do redesenho) — conta
// dias úteis a partir da data de publicação usando as mesmas regras de lib/prazos.ts (fins de
// semana, feriados nacionais, feriados extras cadastrados pelo escritório em Holiday, recesso
// forense do CPC art. 220), reaproveitadas sem reescrita. Puro (sem Prisma) — quem chama busca os
// feriados extras do escritório e passa aqui já serializados.
//
// 15 dias úteis é só um ponto de partida GENÉRICO (nem toda publicação tem prazo de 15 dias de
// verdade — recurso, embargos, contestação... cada um tem o seu, e nada no conteúdo da publicação
// hoje diz qual é). "Sugerido" é o nome certo: o usuário sempre vê e pode ajustar a data antes de
// confirmar a tarefa (ver DelegateTaskForm), isto só evita partir de um campo vazio.
const DIAS_UTEIS_PADRAO = 15;

import { saoPauloDayKey } from "@/lib/publicationGrouping";
import { addDiasUteis } from "@/lib/prazos";

export type PrazoSugerido = {
  date: string; // AAAA-MM-DD, mesma convenção calendário-puro de Task.dueDate — usar formatCalendarDate para exibir
  diasUteis: number;
};

export function calcularPrazoSugerido(
  publishedAt: string | Date,
  feriadosExtras: { date: string }[] = [],
  diasUteis: number = DIAS_UTEIS_PADRAO
): PrazoSugerido {
  // Parte do DIA de Brasília em que a publicação saiu (mesma regra que já decide o agrupamento e
  // a data mostrada no card, ver lib/publicationGrouping.ts) — não do timestamp UTC cru, que pode
  // cair no dia seguinte perto da meia-noite.
  const baseUtcMeiaNoite = new Date(`${saoPauloDayKey(publishedAt)}T00:00:00.000Z`);
  const prazo = addDiasUteis(baseUtcMeiaNoite, diasUteis, feriadosExtras);
  return { date: prazo.toISOString().slice(0, 10), diasUteis };
}
