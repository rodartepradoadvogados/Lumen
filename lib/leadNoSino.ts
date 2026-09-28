import { POR_QUE_CHEGOU } from "@/lib/avisoDeLead";
import type { GatilhoDaTransferencia } from "@/lib/filaDeTransferencia";
import { rotuloDaEspera } from "@/lib/rotulosDaEspera";

// ============================================================================
// O LEAD NO SINO.
//
// No sino, um lead recém-repassado era uma linha igual às outras: um título, um subtítulo, um
// filete colorido. Mas as outras linhas são lembretes — "prazo vence hoje", "publicação nova" —
// e esta é uma pessoa esperando resposta com um relógio de quinze minutos correndo. A mesma forma
// para as duas coisas faz o sino dizer que elas pesam igual, e elas não pesam.
//
// O lead ganha forma própria: sobrancelha dizendo POR QUE ele chegou, o nome em corpo grande, o
// que a triagem apurou, há quanto tempo ele espera, e um botão que abre a conversa.
//
// SÃO DOIS AVISOS DIFERENTES, e a diferença importa:
//
//   LEAD_TRANSFERIDO   chegou a alguém e o relógio está correndo. Há o que fazer AGORA, então o
//                      botão é cheio.
//   LEAD_SEM_RESPOSTA  a volta da fila fechou e ninguém respondeu no prazo. O estrago já
//                      aconteceu; o botão é contornado, porque a pressa passou e o que resta é
//                      recuperar o que der.
// ============================================================================

export const LEAD_KINDS = ["LEAD_TRANSFERIDO", "LEAD_SEM_RESPOSTA"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export function ehAvisoDeLead(kind: string): kind is LeadKind {
  return (LEAD_KINDS as readonly string[]).includes(kind);
}

/** A sobrancelha, em caixa alta, no alto do aviso. */
export function sobrancelhaDoLead(kind: LeadKind, meu: boolean): string {
  if (kind === "LEAD_SEM_RESPOSTA") return "Lead sem atendimento";
  return meu ? "Lead novo para você" : "Lead novo no escritório";
}

/**
 * A linha logo abaixo do nome: por que ele chegou, e de onde.
 *
 * O motivo vem de POR_QUE_CHEGOU (lib/avisoDeLead.ts), que é o mesmo texto que o advogado recebeu
 * no WhatsApp. Duas redações para o mesmo fato — uma no aviso, outra no sino — são duas chances de
 * uma delas envelhecer sozinha.
 */
export function linhaDoLead(gatilho: string | null | undefined, campanhaOuAssunto: string | null | undefined): string {
  const motivo = POR_QUE_CHEGOU[gatilho as GatilhoDaTransferencia];
  const origem = (campanhaOuAssunto || "").trim();
  const inicio = motivo ? `${motivo[0].toUpperCase()}${motivo.slice(1)}` : "Passou para o escritório";
  return origem ? `${inicio} · ${origem}` : inicio;
}

/** "Esperando há 11 minutos" — a frase por extenso, que é como se lê num aviso, não numa tabela. */
export function esperaPorExtenso(minutos: number | null): string | null {
  if (minutos === null) return null;
  if (minutos < 1) return "Chegou agora";
  if (minutos === 1) return "Esperando há 1 minuto";
  if (minutos < 60) return `Esperando há ${minutos} minutos`;
  return `Esperando há ${rotuloDaEspera(minutos)}`;
}

export const LIMITE_DO_RESUMO = 220;

/**
 * O que a triagem apurou, cortado para caber no aviso.
 *
 * CORTA NO ESPAÇO, e não no caractere: "procurou o hospi…" é pior do que uma frase mais curta que
 * termina inteira. E não corta quando não precisa — um resumo de 200 caracteres não ganha nada com
 * reticências.
 */
export function resumoDoLead(texto: string | null | undefined, limite = LIMITE_DO_RESUMO): string | null {
  const limpo = (texto || "").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  // Sem espaço nenhum no trecho (uma palavra gigante, uma URL) não há onde cortar com elegância:
  // corta no limite mesmo, que é melhor do que devolver o texto inteiro e estourar o aviso.
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).replace(/[.,;:\s]+$/, "")}…`;
}
