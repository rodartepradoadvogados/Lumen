import { diaDeBrasilia, horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { stageOptions, faseDoLead } from "@/lib/funil";

// ============================================================================
// AS PEÇAS PURAS DA LINHA DA LISTA DE ATENDIMENTOS (A4 do plano de 29/09/2026): horário relativo,
// prévia da última mensagem, contagem por fase. Ficam fora do componente para serem provadas sem
// React nem banco.
// ============================================================================

/**
 * O horário da linha, do jeito que a lista de um app de mensagens mostra: "agora", "12 min", "14:32"
 * (hoje), "ontem", "27/09". Em Brasília, sempre — o servidor roda em UTC, e "ontem" calculado em UTC
 * erra o dia entre 21h e meia-noite (ver o topo de lib/horaDeBrasilia.ts).
 */
export function tempoRelativo(quando: Date, agora: Date): string {
  const min = Math.floor((agora.getTime() - quando.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const dia = diaDeBrasilia(quando);
  if (dia === diaDeBrasilia(agora)) return horaDeBrasilia(quando);
  if (dia === diaDeBrasilia(new Date(agora.getTime() - 24 * 3600 * 1000))) return "ontem";
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}

/** A prévia: uma linha só, sem quebra, com reticências — o CSS ainda trunca pela largura. */
export function previaDaMensagem(corpo: string, limite = 140): string {
  const limpo = corpo.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

export type UltimaMensagemDaLinha = { direction: string; body: string; porAgente: boolean; createdAt: Date };

/**
 * Quem falou por último, para o prefixo da prévia: "Ana: " (o atendente de IA), "Você: " (uma
 * pessoa do escritório) ou nada (o cliente — a prévia é o que ele disse). `nomeDoAtendente` é o nome
 * configurado da atendente.
 */
export function prefixoDaPrevia(m: UltimaMensagemDaLinha | undefined, nomeDoAtendente: string): string {
  if (!m || m.direction !== "OUT") return "";
  return m.porAgente ? `${nomeDoAtendente}: ` : "Você: ";
}

/** "Esperando resposta" é FATO, não estágio: a última mensagem é do cliente (lib/funil.ts, nota do topo). */
export function estaEsperandoResposta(m: UltimaMensagemDaLinha | undefined): boolean {
  return m?.direction === "IN";
}

export type ContagensPorFase = { TODAS: number } & Record<string, number>;

/**
 * As contagens do menu de fase, a partir do `groupBy` por `stage`. Estágio desconhecido conta como
 * "NOVO" (faseDoLead) — o mesmo critério do filtro, senão o número do menu e o tamanho da lista
 * discordariam. Toda fase existe no resultado, com zero quando não há ninguém.
 */
export function contagensPorFase(grupos: Array<{ stage: string; _count: number | { _all?: number } }>): ContagensPorFase {
  const c: ContagensPorFase = { TODAS: 0 };
  for (const s of stageOptions) c[s] = 0;
  for (const g of grupos) {
    const n = typeof g._count === "number" ? g._count : (g._count._all ?? 0);
    c[faseDoLead(g.stage)] += n;
    c.TODAS += n;
  }
  return c;
}
