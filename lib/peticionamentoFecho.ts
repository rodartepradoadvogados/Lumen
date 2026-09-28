// O FECHO — decisão do dono, posterior à especificação, literal: toda peça termina em
// exatamente "Termos em que pede deferimento." (sem vírgula depois de "que"). O erro mais comum
// ("Termos em que, pede deferimento.") foi citado pelo próprio dono como algo que já aconteceu.
//
// contrato-com-o-agente.md §2 pede para o AGENTE verificar isto antes de finalizar — mas esta
// casa não confia hard gate a "o modelo lembrar" (ver CLAUDE.md e a especificação §3). Por isso
// este módulo é o CÓDIGO que garante o fecho certo, chamado sempre depois de qualquer resposta
// do Hermes, nunca uma instrução a mais no prompt e nada além disso.

export const FECHO_PETICAO = "Termos em que pede deferimento.";

// Variações conhecidas que o modelo (ou um texto colado à mão) pode produzir por engano —
// todas corrigidas para o fecho literal. A vírgula depois de "que" é o erro citado pelo dono;
// as demais cobrem maiúscula/minúscula e pontuação final ausente/dupla.
const VARIACOES_CONHECIDAS: RegExp[] = [
  /termos\s+em\s+que,\s*pede\s+deferimento\.?/i,
  /termos\s+em\s+que\s+pede\s+deferimento\.?/i,
  /termos\s+em\s+que\s+se\s+pede\s+deferimento\.?/i,
];

/** true só quando o texto termina EXATAMENTE com o fecho literal (nenhuma variação, nem espaço extra depois). */
export function terminaComFechoCorreto(texto: string): boolean {
  return texto.trimEnd().endsWith(FECHO_PETICAO);
}

/**
 * GARANTE o fecho certo no fim do texto — hard gate determinístico, não confiado ao modelo.
 *
 * - Se o texto já termina com o fecho literal, devolve sem tocar em mais nada.
 * - Se termina com uma variação conhecida (vírgula, pontuação, maiúscula), troca só aquele
 *   trecho final pelo literal.
 * - Se não há fecho nenhum reconhecível no fim, ACRESCENTA o fecho literal numa linha nova —
 *   nunca deixa uma minuta sair sem ele.
 */
export function garantirFecho(texto: string): string {
  const semEspacoFinal = texto.trimEnd();
  if (terminaComFechoCorreto(semEspacoFinal)) return semEspacoFinal;

  for (const variacao of VARIACOES_CONHECIDAS) {
    const globalizada = new RegExp(variacao.source, "i");
    const casa = semEspacoFinal.match(new RegExp(`${globalizada.source}\\s*$`, "i"));
    if (casa && casa.index !== undefined) {
      return `${semEspacoFinal.slice(0, casa.index).trimEnd()}\n\n${FECHO_PETICAO}`;
    }
  }

  return `${semEspacoFinal}\n\n${FECHO_PETICAO}`;
}
