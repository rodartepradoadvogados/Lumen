import type { Prisma } from "@prisma/client";

// ============================================================================
// A ORDEM DA LISTA DE ATENDIMENTOS: ATIVIDADE MAIS RECENTE.
//
// Regra (decisão do dono, 29/09/2026): a conversa é ordenada pela data da ÚLTIMA MENSAGEM, de
// entrada ou de saída; sem mensagem, pela data de criação do lead. Quem acabou de falar — ou de ser
// respondido — fica em cima. Antes a lista ordenava por `Attendance.createdAt`: a ordem era a de
// CHEGADA do lead e não mudava quando o cliente escrevia, então quem falou há cinco minutos ficava
// embaixo de quem foi criado depois e estava parado.
//
// Vive num módulo puro (sem Prisma em tempo de execução) por dois motivos: a página e o teste usam
// o MESMO orderBy, e a regra fica provável sem banco.
// ============================================================================

/**
 * O `orderBy` da lista. Três chaves e o motivo de cada uma:
 *  - `ultimaAtividadeEm` desc: a regra.
 *  - `createdAt` desc: o desempate que também MANTÉM A ORDEM DE HOJE enquanto o backfill não rodou
 *    (todas as linhas antigas nascem com a mesma `ultimaAtividadeEm`, a do `db push`).
 *  - `id` desc: estabilidade total — sem ela, dois leads com a mesma atividade trocam de lugar entre
 *    um refresh e outro e a lista "pula" sob o dedo de quem está clicando.
 */
export const ORDEM_POR_ATIVIDADE: Prisma.AttendanceOrderByWithRelationInput[] = [
  { ultimaAtividadeEm: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];

export type ComAtividade = { id: string; createdAt: Date; ultimaAtividadeEm: Date };

/** O mesmo critério do `orderBy`, para quem ordena em memória (e para o teste de mesa). */
export function compararPorAtividade(a: ComAtividade, b: ComAtividade): number {
  return (
    b.ultimaAtividadeEm.getTime() - a.ultimaAtividadeEm.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** A atividade que um lead TEM de ter agora: a última mensagem, senão a criação. */
export function atividadeEsperada(criadoEm: Date, ultimaMensagemEm: Date | null): Date {
  return ultimaMensagemEm ?? criadoEm;
}
