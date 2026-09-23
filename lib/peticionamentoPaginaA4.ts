// A GEOMETRIA DA FOLHA — um lugar só, para a tela e para o Word nunca discordarem.
//
// Por que este módulo existe: as medidas da página A4 da petição já viviam em
// lib/peticionamentoDocx.ts, escritas em TWIPS dentro da string de <w:sectPr>. Quando a tela da
// minuta passou a mostrar uma folha A4 de verdade (com régua, recuo e margem arrastáveis), a
// alternativa era escrever 210/297/2,5/2/2,5/3 de novo, em milímetros, no componente — duas
// cópias da MESMA régua, que divergem no dia em que alguém ajusta uma só. Aqui as medidas moram
// em milímetro (a unidade em que o advogado pensa e em que a régua da tela é desenhada) e o .docx
// converte para twip na hora de montar o XML.
//
// Módulo PURO e sem dependência nenhuma — de propósito: ele é importado tanto pelo servidor
// (lib/peticionamentoDocx.ts) quanto por componente de cliente (a régua da tela).

/** Twips por milímetro — 1 polegada = 1440 twips = 25,4 mm. Constante do formato OOXML, não escolha nossa. */
export const TWIPS_POR_MM = 1440 / 25.4;

export function mmParaTwips(mm: number): number {
  return Math.round(mm * TWIPS_POR_MM);
}

export type MargensDaPagina = {
  topoMm: number;
  direitaMm: number;
  baseMm: number;
  esquerdaMm: number;
};

/**
 * A4 em retrato, com as margens que a petição desta casa já usava no .docx (topo/base 2,5 cm,
 * direita 2 cm, esquerda 3 cm — a esquerda maior é a folga de encadernação/carimbo do foro).
 *
 * UMA DIFERENÇA MEDIDA, e declarada para ninguém tropeçar nela depois: a margem de topo/base
 * estava escrita como 1418 twips naquela string, e 25 mm dão 1417 — um twip, 0,0018 mm, invisível
 * em papel e em tela. A conversão a partir do milímetro foi mantida em vez de manter o 1418 porque
 * o milímetro é a unidade em que o dono pensa e em que a régua da tela é desenhada; o inverso
 * obrigaria a tela a herdar um arredondamento de OOXML que não diz nada a ela.
 */
export const PAGINA_A4 = {
  larguraMm: 210,
  alturaMm: 297,
  margens: { topoMm: 25, direitaMm: 20, baseMm: 25, esquerdaMm: 30 } as MargensDaPagina,
} as const;

/**
 * Limites para a régua da tela: nenhuma margem pode encostar na outra nem sair da folha, senão a
 * área de texto vira zero (ou negativa) e a folha aparece vazia sem ninguém entender por quê.
 */
export const MARGEM_MINIMA_MM = 5;
export const AREA_DE_TEXTO_MINIMA_MM = 60;

/** Prende uma margem entre o mínimo e o que sobra da folha depois da margem oposta. */
export function limitarMargem(valorMm: number, margemOpostaMm: number): number {
  const maximo = PAGINA_A4.larguraMm - margemOpostaMm - AREA_DE_TEXTO_MINIMA_MM;
  if (!Number.isFinite(valorMm)) return MARGEM_MINIMA_MM;
  return Math.min(Math.max(valorMm, MARGEM_MINIMA_MM), Math.max(maximo, MARGEM_MINIMA_MM));
}

/** Largura útil (entre as margens) — é sobre ela que o recuo de parágrafo da régua é medido. */
export function larguraUtilMm(margens: MargensDaPagina): number {
  return PAGINA_A4.larguraMm - margens.esquerdaMm - margens.direitaMm;
}
