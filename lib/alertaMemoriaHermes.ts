// ============================================================================
// ALERTA DE MEMÓRIA DA VPS DO HERMES — regras PURAS (Frente C da especificação fechada, §4).
// Mesmo padrão de lib/moduloCampanhas.ts e lib/provisionamentoCampanhas.ts: sem Prisma, sem
// fetch. A leitura de memória em si vem de lib/hermesPonte.ts:memoriaDaMaquina (RAM disponível +
// swap livre da MÁQUINA, não de um perfil); o envio de e-mail e a trava de "um por dia" ficam em
// lib/actions/alertaMemoriaHermes.ts.
//
// "Sem teto rígido de escritórios/perfis por enquanto. O que existe é alerta, nível único (não
// 'atenção' e 'crítico')." — por isso o tipo abaixo só tem DOIS estados, nunca um terceiro nível
// intermediário.
// ============================================================================

import { deveEnviarAvisoHoje } from "@/lib/campanhasCobranca";

export const MOTIVO_LIMIAR_NAO_CONFIGURADO =
  "Limiar de memória livre da VPS do Hermes ainda não configurado — o alerta está desligado até o dono decidir o número.";

export type SituacaoDeMemoria =
  | { dispara: false; motivo: string }
  | { dispara: true; livreKB: number; limiarKB: number };

/**
 * Decide SE a memória livre atual (RAM disponível + swap livre, já somadas por quem chama) cruzou
 * o limiar — NUNCA decide o valor do limiar. `limiarKB` nulo (a especificação marca o número como
 * EM ABERTO — "não foi decidido") é a ÚNICA entrada que sempre devolve `dispara: false`, com um
 * motivo legível para a tela, nunca um número inventado disfarçado de "padrão razoável" (mesma
 * disciplina de lib/moduloCampanhas.ts:precoAMostrar com o preço do módulo).
 *
 * A fronteira é INCLUSIVA no limiar: memória livre EXATAMENTE igual ao limiar já dispara — "cruzar
 * um limiar" inclui tocá-lo, e a máquina não fica mais folgada por estar bem em cima da linha.
 */
export function situacaoDeMemoria(memoriaLivreKB: number, limiarKB: number | null): SituacaoDeMemoria {
  if (limiarKB == null) return { dispara: false, motivo: MOTIVO_LIMIAR_NAO_CONFIGURADO };
  if (memoriaLivreKB > limiarKB) {
    return { dispara: false, motivo: `memória livre (${memoriaLivreKB} KB) acima do limiar (${limiarKB} KB)` };
  }
  return { dispara: true, livreKB: memoriaLivreKB, limiarKB };
}

// UM ALERTA POR DIA, NÃO UM POR EXECUÇÃO — a MESMA régua de lib/campanhasCobranca.ts (comparar o
// dia de calendário gravado, no fuso do escritório, com o de hoje). Reexportada em vez de
// reescrita: é literalmente a mesma pergunta ("já fiz isto hoje?"), e uma segunda implementação
// só criaria a chance de as duas divergirem um dia (ex.: alguém corrigir o fuso só num lado).
export { deveEnviarAvisoHoje as deveAlertarMemoriaHoje };
