// AS REGRAS PURAS DOS ATALHOS DA CENTRAL (A5 do plano de 29/09/2026) — o que cada tecla significa e
// para onde a seta leva. Ficam fora do componente (components/atendimento/AtalhosDaCentral.tsx) para
// serem provadas sem navegador.

export type AtalhoDaCentral = "buscar" | "fase" | "proxima" | "anterior";

/** A tecla, traduzida. `null` = não é atalho nosso (inclusive o Esc, que tem ordem própria de fechamento). */
export function atalhoDaTecla(tecla: string): AtalhoDaCentral | null {
  if (tecla === "/") return "buscar";
  if (tecla === "f" || tecla === "F") return "fase";
  if (tecla === "ArrowDown") return "proxima";
  if (tecla === "ArrowUp") return "anterior";
  return null;
}

/**
 * Para onde a seta vai. `atual` é o índice da linha selecionada, ou -1 quando nenhuma está (a
 * conversa aberta pode estar fora da lista): ↓ vai à primeira, ↑ à última. Nunca passa das pontas
 * (não dá a volta: rolar até o fim e cair no começo perde o lugar de quem está lendo a lista).
 * Devolve `atual` quando não há para onde ir.
 */
export function indiceVizinho(atual: number, total: number, direcao: "proxima" | "anterior"): number {
  if (total <= 0) return atual;
  const ponto = atual < 0 ? (direcao === "proxima" ? -1 : total) : atual;
  return Math.min(Math.max(ponto + (direcao === "proxima" ? 1 : -1), 0), total - 1);
}

/** A tecla é da PESSOA, e não da tela: campo de texto, textarea, select ou contenteditable. */
export function alvoEstaDigitando(alvo: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!alvo || !alvo.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable === true;
}
