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
 * UM PASSO DE RECUO — 1,25 cm, o mesmo salto de tabulação que o Word usa por padrão.
 *
 * Mora aqui, e não no editor, porque passou a ser medida COMPARTILHADA: a barra da minuta usa este
 * passo ao aumentar/diminuir recuo, e lib/peticionamentoDocxFormatado.ts usa o MESMO passo no recuo
 * de cada nível de lista do `numbering.xml`. Duas cópias divergiriam no dia em que alguém ajustasse
 * uma só, e o sub-tópico apareceria numa distância na tela e noutra no Word.
 */
export const PASSO_DE_RECUO_MM = 12.5;

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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ETAPA B — A MARGEM DA FOLHA DEIXA DE SER SÓ DA TELA.
//
// Até aqui a margem que o advogado arrastava na régua vivia no estado do componente: recarregar
// a página voltava ao padrão, e o .docx nunca a via (sem timbrado saía PAGINA_A4.margens; com
// timbrado, as margens do próprio timbrado). Três fontes possíveis, e a tela e o Word escolhiam
// cada um a sua.
//
// A CONCILIAÇÃO, num lugar só — a mesma função decide para a régua, para a prévia e para o Word:
//
//   1. margem SALVA nesta sessão (PeticionamentoSessao.minutaMargensMm) — o advogado mexeu na
//      régua, e o que ele escolheu vale na tela, na prévia e no arquivo;
//   2. senão, a margem do TIMBRADO do escritório (o <w:pgMar> do .docx cadastrado) — é o timbrado
//      que sabe onde o logotipo e o rodapé moram, e é a margem que o Word já usava ao exportar;
//   3. senão, PAGINA_A4.margens — a folha sem timbrado de sempre.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Teto de margem vertical: acima disto a folha não tem mais onde escrever. */
export const MARGEM_VERTICAL_MAXIMA_MM = 100;

/**
 * Lê margens vindas de fora (JSON do banco, timbrado, pedido do cliente) e devolve margens que a
 * folha aguenta — ou null quando não são margens. Nunca confia no formato: o JSON do banco é
 * gravado por esta casa, mas o pedido da tela é um endereço HTTP como qualquer outro.
 */
export function margensValidas(bruto: unknown): MargensDaPagina | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Record<string, unknown>;
  const numeros = [m.topoMm, m.direitaMm, m.baseMm, m.esquerdaMm];
  if (!numeros.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const vertical = (v: number) => Math.min(Math.max(v, MARGEM_MINIMA_MM), MARGEM_VERTICAL_MAXIMA_MM);
  const esquerdaMm = limitarMargem(m.esquerdaMm as number, MARGEM_MINIMA_MM);
  return {
    topoMm: vertical(m.topoMm as number),
    direitaMm: limitarMargem(m.direitaMm as number, esquerdaMm),
    baseMm: vertical(m.baseMm as number),
    esquerdaMm,
  };
}

export type OrigemDaMargem = "salva" | "timbrado" | "padrao";

/** A regra da conciliação acima: salva ▸ timbrado ▸ padrão. */
export function margensDaFolha(
  salvas: unknown,
  doTimbrado: MargensDaPagina | null | undefined,
): { margens: MargensDaPagina; origem: OrigemDaMargem } {
  const minhas = margensValidas(salvas);
  if (minhas) return { margens: minhas, origem: "salva" };
  const timbrado = margensValidas(doTimbrado);
  if (timbrado) return { margens: timbrado, origem: "timbrado" };
  return { margens: { ...PAGINA_A4.margens }, origem: "padrao" };
}

/**
 * A PAGINAÇÃO DA PRÉVIA — quais blocos cabem em cada folha.
 *
 * Recebe a posição e a altura de cada bloco, MEDIDAS no navegador num fluxo contínuo da mesma
 * largura da área de texto, e a altura útil da folha. Um bloco que não cabe no que sobra da folha
 * abre a próxima; um bloco sozinho mais alto que uma folha inteira fica na dele (transborda) em vez
 * de sumir ou de travar num laço — a prévia é aproximação do Word, não o Word.
 *
 * Pura e sem DOM, para a regra ser provada em mesa.
 */
export function paginarBlocos(blocos: { topo: number; altura: number }[], capacidade: number): number[][] {
  const paginas: number[][] = [];
  if (capacidade <= 0) return blocos.length ? [blocos.map((_, i) => i)] : [];
  let atual: number[] = [];
  let inicio = 0;
  blocos.forEach((b, i) => {
    if (atual.length === 0) inicio = b.topo;
    else if (b.topo + b.altura - inicio > capacidade) {
      paginas.push(atual);
      atual = [];
      inicio = b.topo;
    }
    atual.push(i);
  });
  if (atual.length) paginas.push(atual);
  return paginas;
}
