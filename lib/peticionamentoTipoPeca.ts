// A LISTA FECHADA da especificação §9 — obrigatória quando a sessão tem vínculo, com "Outra" em
// texto livre. É A MESMA taxonomia usada para nomear o arquivo (CATEGORIA do padrão
// [aaaa_mm_dd]_CATEGORIA da skill rodarte-prado-lumen) — a especificação é explícita: "não criar
// duas nomenclaturas paralelas no escritório". Por isso a lista e a normalização moram no MESMO
// módulo puro.

export const TIPOS_DE_PECA = [
  "Inicial",
  "Contestação",
  "Réplica",
  "Apelação",
  "Contrarrazões de Apelação",
  "Agravo de Instrumento",
  "Embargos de Declaração",
  "Recurso Especial/Extraordinário",
  "Cumprimento de Sentença",
  "Petição Intermediária/Manifestação",
  "Tutela de Urgência",
  "Outra",
] as const;

export type TipoDePeca = (typeof TIPOS_DE_PECA)[number];

export function ehTipoConhecido(valor: string): valor is TipoDePeca {
  return (TIPOS_DE_PECA as readonly string[]).includes(valor);
}

/**
 * Normaliza um rótulo de tipo de peça para CATEGORIA de nome de arquivo — maiúsculo, sem
 * acento, sem espaço, palavras separadas por "_" (contrato-com-o-agente.md §4, com os exemplos
 * literais: Réplica → REPLICA; Agravo de Instrumento → AGRAVO_DE_INSTRUMENTO; Cumprimento de
 * Sentença → CUMPRIMENTO_DE_SENTENCA).
 *
 * Usada tanto para os 11 tipos fixos quanto para o texto livre de "Outra" — nunca cai num
 * rótulo genérico como "PETICAO" ou "OUTRA" quando a pessoa digitou algo (contrato §4).
 */
export function categoriaDoTipoDePeca(tipo: string): string {
  const semAcento = tipo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return semAcento
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * A CATEGORIA final de uma sessão: usa o texto livre quando o tipo é "Outra" e há texto
 * digitado; cai no tipo fixo normalizado nos demais casos. Nunca devolve "OUTRA" sozinho quando
 * há texto livre — contrato §4 é explícito que isso seria o erro a evitar.
 */
export function categoriaDaSessao(tipoPeca: string | null | undefined, tipoPecaOutro: string | null | undefined): string {
  if (tipoPeca === "Outra") {
    // "Outra" SEM texto digitado nunca vira o rótulo genérico "OUTRA" (contrato §4 é explícito
    // que isso é o erro a evitar) — cai no mesmo padrão de "nenhum tipo escolhido".
    if (tipoPecaOutro && tipoPecaOutro.trim().length > 0) return categoriaDoTipoDePeca(tipoPecaOutro.trim());
    return "PETICAO";
  }
  if (tipoPeca && tipoPeca.trim().length > 0) {
    return categoriaDoTipoDePeca(tipoPeca);
  }
  // Sessão sem tipo de peça escolhido nem inferido — nunca deixado em branco no nome do
  // arquivo (isso quebraria o padrão [aaaa_mm_dd]_CATEGORIA.docx da skill rodarte-prado-lumen).
  return "PETICAO";
}
