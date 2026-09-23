// A FORMATAÇÃO DA MINUTA DENTRO DO WORD — a tradução do HTML da folha para OOXML.
//
// ── POR QUE ESTE MÓDULO EXISTE ────────────────────────────────────────────────────────────────
//
// A etapa A deu à minuta uma folha A4 com régua e barra de formatação (negrito, cor, alinhamento,
// recuo, oito formatos de tópico, sub-tópico aninhado, moldura e tabela). Só que o .docx continuava
// sendo montado a partir do TEXTO PURO (lib/peticionamentoDocx.ts: `corpoDaMinuta`), que por
// definição não tem nenhuma dessas coisas: o advogado formatava a peça na tela e exportava um Word
// cru — revisão só de tela. Este módulo é o que faz a formatação viajar.
//
// ── O QUE ELE NÃO MUDA, E ISSO É O PONTO ──────────────────────────────────────────────────────
//
// `PeticionamentoSessao.minutaTexto` continua sendo TEXTO PURO e continua sendo a fonte de tudo o
// que NÃO é aparência — o fecho (lib/peticionamentoFecho.ts), a identidade de cada citação
// (lib/peticionamentoCitacoes.ts: `normalizarTextoCitacao`/`hashDeTexto`) e a resposta a "já existe
// minuta?" (lib/peticionamentoPasso.ts). Este módulo LÊ o HTML e escreve XML: não grava coluna
// nenhuma, não deriva texto puro por conta própria (usa `textoPuroDaMinutaHtml`, a função única) e
// não olha `minutaAprovadaEm` — a liberação da exportação pela aprovação é outra entrega.
//
// Quando `minutaFormatadaHtml` é nulo (sessão anterior ao editor — estado legítimo, ver o contrato
// no schema), este módulo NÃO é chamado e o Word sai exatamente como saía antes, do texto puro.
//
// ── SANEAMENTO ────────────────────────────────────────────────────────────────────────────────
//
// A entrada é saneada AQUI, na porta do módulo, mesmo que quem chamou já tenha saneado — a mesma
// disciplina de `htmlParaAbrirAFolha` ("nunca confiar numa trava só"). Aqui o risco não é XSS (o
// destino é um arquivo, não um `innerHTML`), é FORMA: o varredor abaixo conta com um conjunto
// FECHADO de tags, atributos (`style`, `colspan`, `rowspan`) e propriedades de estilo. Saneando na
// entrada, HTML colado de fora ou corrigido à mão no banco não consegue produzir OOXML que o Word
// recuse abrir.
//
// ── O QUE O OOXML NÃO REPRESENTA, E POR ISSO SE PERDE ─────────────────────────────────────────
//
// Nenhuma aproximação silenciosa: o que não tem tradução fiel é DESCARTADO e ANOTADO em `perdas`,
// devolvido por `corpoDocxDoHtmlDaMinuta`. A lista completa, e o motivo de cada uma:
//
//  1. MEDIDA RELATIVA (`em`, `rem`, `%`) em recuo ou margem. `<w:ind>` só aceita twip, medida
//     absoluta; converter dependeria do tamanho da fonte do contexto, que o OOXML resolve na
//     abertura e este módulo não conhece. O editor desta casa escreve sempre milímetro, então isto
//     só aparece em HTML colado de fora. Descartada — o parágrafo sai sem aquele recuo.
//  2. CANAL ALFA de cor (`#rrggbbaa`, `rgba(...)` com alfa < 1). `<w:color>` e `<w:shd>` são RGB
//     opaco: o RGB é mantido, a transparência se perde.
//  3. COR POR NOME fora das nomeadas básicas do HTML. `<w:color w:val>` só aceita hexadecimal (ou
//     "auto"); inventar um hexadecimal para um nome desconhecido seria adivinhar a cor da peça.
//     Descartada.
//  4. `list-style-type` fora dos oito formatos da setinha (mais `none` e os sinônimos
//     `lower-latin`/`upper-latin`, que uma colagem traz). Cai no marcador padrão da tag — bolinha
//     para `<ul>`, número para `<ol>` — e a troca fica anotada.
//  5. LARGURA DE COLUNA de tabela. O editor não deixa arrastar coluna e o HTML não traz largura; a
//     tabela sai com colunas iguais dentro da área de texto e o Word reajusta. Não é perda de
//     informação, é ausência dela na origem.
//  6. UM PARÁGRAFO EXTRA DEPOIS DE CADA TABELA. O OOXML exige um `<w:p>` depois de um `<w:tbl>`
//     (sem ele duas tabelas vizinhas viram uma só, e uma tabela no fim do corpo deixa o arquivo
//     inválido). Ele aparece como uma linha em branco que a tela não mostra — o mesmo preço que
//     lib/peticionamentoDocx.ts: `caixa` já paga desde a primeira versão.
//  7. O NEGRITO DE TÍTULO POR HEURÍSTICA, e o alinhamento à direita da data. O caminho do texto
//     puro adivinha título por "curto e em caixa alta" (`pareceTitulo`) e o põe em negrito, e
//     joga a última linha e a data à direita. Aqui NÃO: quem manda é a folha. Se na tela o título
//     está sem negrito, sai sem negrito no Word — é a fidelidade que esta entrega promete, e o
//     remédio está na barra ("B", "alinhar à direita"), que a tela já oferece.
//  8. LIMITE DE 500 LISTAS num documento; além dele as listas passam a dividir uma numeração e o
//     contador não recomeça. Uma peça real tem poucas — o limite existe para um HTML patológico
//     não gerar um `numbering.xml` gigante.
//
// ── COR DE FUNDO: `w:shd`, NÃO `w:highlight` — e por quê ──────────────────────────────────────
//
// O OOXML tem dois jeitos de pintar o fundo de um texto. `<w:highlight>` é o marca-texto do Word e
// aceita SÓ um punhado de nomes fixos (yellow, green, cyan...). `<w:shd w:fill="RRGGBB">` é
// sombreamento e aceita RGB de 24 bits. A barra da minuta pinta o fundo com um `<input
// type="color">`, que devolve hexadecimal arbitrário: escolher `w:highlight` obrigaria a empurrar a
// cor do advogado para a mais parecida da lista fixa — exatamente a "aproximação silenciosa" que
// esta entrega não faz. Por isso `w:shd` dentro de `<w:rPr>`, que reproduz a cor exata.
//
// ── SEM DEPENDÊNCIA NOVA ──────────────────────────────────────────────────────────────────────
//
// O gerador desta casa escreve OOXML à mão de propósito (ver o cabeçalho de
// lib/peticionamentoDocx.ts). O varredor de HTML abaixo monta uma ÁRVORE — e não um percurso linear
// como o de `textoPuroDaMinutaHtml`, que só precisa de texto — porque aparência é HERDADA: o
// negrito de um `<b>` vale para o `<span>` colorido de dentro, e o alinhamento de um `<div>` vale
// para os `<p>` que ele embrulha. Ele corre DEPOIS do saneamento, sobre um conjunto fechado de
// tags, e o que produz é XML, nunca HTML devolvido a um navegador.

import { PAGINA_A4, PASSO_DE_RECUO_MM, larguraUtilMm, mmParaTwips } from "@/lib/peticionamentoPaginaA4";
import { sanitizarMinutaHtml, textoLiteralDeNoHtml, textoPuroDaMinutaHtml } from "@/lib/peticionamentoMinutaFormatada";

// `esc` é cópia deliberada da de lib/peticionamentoDocx.ts, pelo mesmo motivo que o cabeçalho de lá
// já registra para run/paragrafo — e por um a mais: importar de lá criaria ciclo, porque lá importa
// daqui. Três linhas de escape de XML não valem um módulo de utilidade novo.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── MEDIDA ────────────────────────────────────────────────────────────────────────────────────
//
// TODA medida vira MILÍMETRO aqui, e twip por `mmParaTwips`, de lib/peticionamentoPaginaA4.ts —
// nunca uma segunda conversão de milímetro para twip. É a mesma régua da folha da tela e do
// `<w:sectPr>` da página; duas cópias divergem no dia em que alguém ajusta uma só.
const MM_POR_UNIDADE: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };

function pxParaMm(px: number): number {
  return px * MM_POR_UNIDADE.px;
}

/** Espaço depois de um bloco — `margin: 0 0 10px` de `.minuta-corpo p/ul/ol/table` no CSS da aba. */
const ESPACO_DEPOIS_DE_BLOCO_TWIPS = mmParaTwips(pxParaMm(10));
/** Espaço depois de um item de lista — `margin: 2px 0` de `.minuta-corpo li`. */
const ESPACO_DEPOIS_DE_ITEM_TWIPS = mmParaTwips(pxParaMm(2));
/** Recuo do nível 1 de lista, e de cada nível seguinte — o mesmo passo de 1,25 cm da régua da tela. */
const RECUO_DE_NIVEL_TWIPS = mmParaTwips(PASSO_DE_RECUO_MM);
/** Distância do marcador ao texto do item (`w:hanging`) — metade do passo. */
const PENDENTE_DO_MARCADOR_TWIPS = mmParaTwips(PASSO_DE_RECUO_MM / 2);
/** Margem interna da célula — `padding: 4px 6px` de `.minuta-corpo td/th`. */
const CELULA_MARGEM_VERTICAL_TWIPS = mmParaTwips(pxParaMm(4));
const CELULA_MARGEM_HORIZONTAL_TWIPS = mmParaTwips(pxParaMm(6));
/** Recuo de `<blockquote>`, que o editor não produz mas uma colagem traz — o padrão do navegador. */
const CITACAO_RECUO_MM = pxParaMm(40);
/** Corpo da peça em 11 pt — o mesmo tamanho que lib/peticionamentoDocx.ts já usa no texto puro. */
const TAMANHO_DO_CORPO_PT = 11;
const TAMANHOS_DE_TITULO: Record<string, number> = { h1: 16, h2: 14, h3: 12 };
const MAXIMO_DE_LISTAS = 500;

function anotar(perdas: string[], aviso: string): void {
  if (!perdas.includes(aviso)) perdas.push(aviso);
}

/** Milímetro de uma medida CSS — `null` quando não há medida, ou ela não tem tradução absoluta. */
function mmDaMedida(valor: string | undefined, perdas: string[], oQue: string): number | null {
  if (!valor) return null;
  const t = valor.trim();
  if (t === "0") return 0;
  const absoluta = t.match(/^(-?\d+(?:\.\d+)?)(mm|cm|in|pt|px)$/);
  if (absoluta) return Number(absoluta[1]) * MM_POR_UNIDADE[absoluta[2]];
  if (/^-?\d+(?:\.\d+)?(em|rem|%)$/.test(t)) {
    anotar(perdas, `medida relativa em ${oQue} ("${t}") — <w:ind> só aceita medida absoluta; o recuo foi descartado`);
  }
  return null;
}

const CORES_NOMEADAS: Record<string, string> = {
  black: "000000", silver: "C0C0C0", gray: "808080", grey: "808080", white: "FFFFFF",
  maroon: "800000", red: "FF0000", purple: "800080", fuchsia: "FF00FF", magenta: "FF00FF",
  green: "008000", lime: "00FF00", olive: "808000", yellow: "FFFF00",
  navy: "000080", blue: "0000FF", teal: "008080", aqua: "00FFFF", cyan: "00FFFF", orange: "FFA500",
};

function doisDigitos(n: number): string {
  return Math.min(Math.max(Math.round(n), 0), 255).toString(16).padStart(2, "0").toUpperCase();
}

/** RRGGBB de uma cor CSS — `null` quando não há cor, ou ela não tem tradução exata. */
function hexDaCor(valor: string | undefined, perdas: string[], oQue: string): string | null {
  if (!valor) return null;
  const t = valor.trim().toLowerCase();
  const hex = t.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const d = hex[1];
    if (d.length === 4 || d.length === 8) anotar(perdas, `canal alfa de cor em ${oQue} — OOXML pinta cor opaca; a transparência se perde`);
    if (d.length === 3 || d.length === 4) return `${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toUpperCase();
    if (d.length === 6 || d.length === 8) return d.slice(0, 6).toUpperCase();
    return null;
  }
  const rgb = t.match(/^rgba?\(([^)]*)\)$/);
  if (rgb) {
    const partes = rgb[1].split(/[,\s/]+/).filter(Boolean);
    if (partes.length < 3) return null;
    const canal = (p: string) => (p.endsWith("%") ? (Number(p.slice(0, -1)) * 255) / 100 : Number(p));
    const [r, g, b] = [canal(partes[0]), canal(partes[1]), canal(partes[2])];
    if (![r, g, b].every((n) => Number.isFinite(n))) return null;
    if (partes.length >= 4) {
      const alfa = partes[3].endsWith("%") ? Number(partes[3].slice(0, -1)) / 100 : Number(partes[3]);
      if (Number.isFinite(alfa) && alfa < 1) anotar(perdas, `canal alfa de cor em ${oQue} — OOXML pinta cor opaca; a transparência se perde`);
    }
    return `${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`;
  }
  const nomeada = CORES_NOMEADAS[t];
  if (nomeada) return nomeada;
  anotar(perdas, `cor por nome não reconhecida em ${oQue} ("${t}") — <w:color> só aceita hexadecimal; a cor foi descartada`);
  return null;
}

// ── A ÁRVORE ──────────────────────────────────────────────────────────────────────────────────

type NoTexto = { tipo: "texto"; texto: string };
type NoElemento = { tipo: "elemento"; tag: string; estilo: Record<string, string>; atributos: Record<string, string>; filhos: No[] };
type No = NoTexto | NoElemento;

const TAGS_VAZIAS = new Set(["br"]);
const TAGS_INLINE = new Set(["span", "b", "strong", "i", "em", "u", "s", "sup", "sub"]);
const TAGS_DE_BLOCO = new Set(["p", "div", "h1", "h2", "h3", "blockquote"]);
const TAGS_DE_LISTA = new Set(["ul", "ol"]);
const TAGS_DE_CELULA = new Set(["td", "th"]);

function estiloDoRotulo(rotulo: string): Record<string, string> {
  const casa = rotulo.match(/\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/i);
  const bruto = casa?.[1] ?? casa?.[2];
  if (!bruto) return {};
  const estilo: Record<string, string> = {};
  for (const par of bruto.split(";")) {
    const i = par.indexOf(":");
    if (i <= 0) continue;
    estilo[par.slice(0, i).trim().toLowerCase()] = par.slice(i + 1).trim();
  }
  return estilo;
}

function atributosDoRotulo(rotulo: string): Record<string, string> {
  const atributos: Record<string, string> = {};
  for (const casa of rotulo.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    atributos[casa[1].toLowerCase()] = casa[2] ?? casa[3] ?? "";
  }
  return atributos;
}

/**
 * A árvore de um HTML de minuta JÁ SANEADO. Tolerante de propósito: tag órfã de fechamento é
 * ignorada, tag não fechada é fechada pelo fim do documento, e `<` solto é TEXTO — nunca engole o
 * resto da peça em silêncio (o mesmo cuidado que `textoPuroDaMinutaHtml` já toma).
 */
function arvoreDoHtml(html: string): No[] {
  const raiz: NoElemento = { tipo: "elemento", tag: "#raiz", estilo: {}, atributos: {}, filhos: [] };
  const pilha: NoElemento[] = [raiz];
  const empurrarTexto = (bruto: string) => {
    const texto = textoLiteralDeNoHtml(bruto);
    if (texto.length > 0) pilha[pilha.length - 1].filhos.push({ tipo: "texto", texto });
  };
  let i = 0;
  while (i < html.length) {
    const abre = html.indexOf("<", i);
    if (abre < 0) {
      empurrarTexto(html.slice(i));
      break;
    }
    if (abre > i) empurrarTexto(html.slice(i, abre));
    const fecha = html.indexOf(">", abre);
    if (fecha < 0) {
      empurrarTexto(html.slice(abre));
      break;
    }
    const rotulo = html.slice(abre + 1, fecha);
    i = fecha + 1;
    if (rotulo.startsWith("/")) {
      const tag = rotulo.slice(1).trim().toLowerCase();
      for (let n = pilha.length - 1; n > 0; n--) {
        if (pilha[n].tag === tag) {
          pilha.length = n;
          break;
        }
      }
      continue;
    }
    const tag = rotulo.split(/[\s/]/)[0].toLowerCase();
    if (!tag) continue;
    const elemento: NoElemento = { tipo: "elemento", tag, estilo: estiloDoRotulo(rotulo), atributos: atributosDoRotulo(rotulo), filhos: [] };
    pilha[pilha.length - 1].filhos.push(elemento);
    if (!TAGS_VAZIAS.has(tag) && !rotulo.trimEnd().endsWith("/")) pilha.push(elemento);
  }
  return raiz.filhos;
}

// ── APARÊNCIA (o `<w:rPr>`) ───────────────────────────────────────────────────────────────────

type Aparencia = {
  negrito?: boolean;
  italico?: boolean;
  sublinhado?: boolean;
  riscado?: boolean;
  vertical?: "superscript" | "subscript";
  cor?: string;
  fundo?: string;
  tamanhoPt: number;
};

function aparenciaDoElemento(el: NoElemento, herdada: Aparencia, perdas: string[]): Aparencia {
  const a: Aparencia = { ...herdada };
  if (el.tag === "b" || el.tag === "strong") a.negrito = true;
  if (el.tag === "i" || el.tag === "em") a.italico = true;
  if (el.tag === "u") a.sublinhado = true;
  if (el.tag === "s") a.riscado = true;
  if (el.tag === "sup") a.vertical = "superscript";
  if (el.tag === "sub") a.vertical = "subscript";
  const tamanhoDeTitulo = TAMANHOS_DE_TITULO[el.tag];
  if (tamanhoDeTitulo) {
    // `<h1>`–`<h3>` não têm CSS próprio na folha: quem os desenha é o padrão do navegador, que é
    // negrito e maior. O Word reproduz esse padrão — não inventa estilo que a tela não mostra.
    a.negrito = true;
    a.tamanhoPt = tamanhoDeTitulo;
  }

  const peso = el.estilo["font-weight"];
  if (peso) a.negrito = peso === "bold" || Number(peso) >= 600;
  const estiloDaFonte = el.estilo["font-style"];
  if (estiloDaFonte) a.italico = estiloDaFonte === "italic";
  const decoracao = el.estilo["text-decoration"];
  if (decoracao) {
    a.sublinhado = decoracao.includes("underline");
    a.riscado = decoracao.includes("line-through");
  }
  const alinhamentoVertical = el.estilo["vertical-align"];
  if (alinhamentoVertical === "super") a.vertical = "superscript";
  else if (alinhamentoVertical === "sub") a.vertical = "subscript";
  else if (alinhamentoVertical === "baseline") a.vertical = undefined;

  const cor = hexDaCor(el.estilo.color, perdas, "cor da letra");
  if (cor) a.cor = cor;
  const fundo = hexDaCor(el.estilo["background-color"], perdas, "cor do fundo do texto");
  if (fundo) a.fundo = fundo;
  return a;
}

/**
 * `<w:rPr>` na ORDEM que o esquema do OOXML exige — CT_RPr é uma SEQUÊNCIA, não um conjunto: fora
 * de ordem o Word recusa abrir o arquivo. b, i, strike, color, sz, u, shd, vertAlign.
 */
function rPrDaAparencia(a: Aparencia): string {
  const partes = [
    a.negrito ? "<w:b/>" : "",
    a.italico ? "<w:i/>" : "",
    a.riscado ? "<w:strike/>" : "",
    a.cor ? `<w:color w:val="${a.cor}"/>` : "",
    `<w:sz w:val="${a.tamanhoPt * 2}"/><w:szCs w:val="${a.tamanhoPt * 2}"/>`,
    a.sublinhado ? `<w:u w:val="single"/>` : "",
    a.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${a.fundo}"/>` : "",
    a.vertical ? `<w:vertAlign w:val="${a.vertical}"/>` : "",
  ].join("");
  return `<w:rPr>${partes}</w:rPr>`;
}

function corrida(texto: string, a: Aparencia): string {
  return `<w:r>${rPrDaAparencia(a)}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

// ── PARÁGRAFO (o `<w:pPr>`) ───────────────────────────────────────────────────────────────────

type Numeracao = { numId: number; nivel: number };

type PropsParagrafo = {
  alinhamento: "left" | "right" | "center" | "both";
  primeiraLinhaMm?: number;
  esquerdaMm: number;
  direitaMm: number;
  espacoDepoisTwips: number;
  numeracao?: Numeracao;
  /** Recuo do nível de lista quando a lista não tem marcador (`list-style-type: none`). */
  recuoDeListaTwips?: number;
};

// O ALINHAMENTO PADRÃO DA FOLHA é justificado — o mesmo que lib/peticionamentoDocx.ts já dá ao
// texto puro, e agora também o que `.minuta-corpo` mostra na tela (`text-align: justify` no CSS da
// aba). Ele é padrão nos DOIS lados de propósito: um padrão só de um lado é exatamente a
// divergência entre folha e Word que esta entrega existe para fechar.
const PROPS_INICIAIS: PropsParagrafo = { alinhamento: "both", esquerdaMm: 0, direitaMm: 0, espacoDepoisTwips: ESPACO_DEPOIS_DE_BLOCO_TWIPS };

const JC_DO_CSS: Record<string, PropsParagrafo["alinhamento"]> = { left: "left", right: "right", center: "center", justify: "both" };

function propsDoBloco(el: NoElemento, herdadas: PropsParagrafo, perdas: string[]): PropsParagrafo {
  // `text-align` HERDA em CSS; `margin`/`text-indent` não. A cópia abaixo respeita essa diferença —
  // herdar recuo somaria o recuo do `<div>` de fora ao de cada `<p>` de dentro, e o parágrafo sairia
  // com o dobro do recuo que a folha mostra.
  const props: PropsParagrafo = {
    alinhamento: JC_DO_CSS[(el.estilo["text-align"] ?? "").trim().toLowerCase()] ?? herdadas.alinhamento,
    esquerdaMm: mmDaMedida(el.estilo["margin-left"], perdas, "recuo à esquerda") ?? 0,
    direitaMm: mmDaMedida(el.estilo["margin-right"], perdas, "recuo à direita") ?? 0,
    primeiraLinhaMm: mmDaMedida(el.estilo["text-indent"], perdas, "recuo de primeira linha") ?? undefined,
    espacoDepoisTwips: herdadas.espacoDepoisTwips,
  };
  if (el.tag === "blockquote") {
    props.esquerdaMm += CITACAO_RECUO_MM;
    props.direitaMm += CITACAO_RECUO_MM;
  }
  return props;
}

/** `<w:pPr>` na ordem do esquema: numPr, spacing, ind, jc. */
function paragrafoXml(conteudo: string, props: PropsParagrafo): string {
  const recuoDeLista = props.numeracao ? RECUO_DE_NIVEL_TWIPS * (props.numeracao.nivel + 1) : (props.recuoDeListaTwips ?? 0);
  const esquerda = mmParaTwips(props.esquerdaMm) + recuoDeLista;
  const direita = mmParaTwips(props.direitaMm);
  // Recuo NEGATIVO de primeira linha é o parágrafo "pendente" — uso corrente em petição, e a régua
  // da tela o permite até -20 mm. O OOXML não tem `firstLine` negativo: ele se chama `w:hanging`.
  const primeiraLinha = props.primeiraLinhaMm ? mmParaTwips(props.primeiraLinhaMm) : 0;
  const pedacoDeRecuo = props.numeracao
    ? ` w:hanging="${PENDENTE_DO_MARCADOR_TWIPS}"`
    : primeiraLinha > 0
      ? ` w:firstLine="${primeiraLinha}"`
      : primeiraLinha < 0
        ? ` w:hanging="${-primeiraLinha}"`
        : "";
  const ind = esquerda !== 0 || direita !== 0 || pedacoDeRecuo !== "" ? `<w:ind w:left="${esquerda}" w:right="${direita}"${pedacoDeRecuo}/>` : "";
  const pPr =
    (props.numeracao ? `<w:numPr><w:ilvl w:val="${props.numeracao.nivel}"/><w:numId w:val="${props.numeracao.numId}"/></w:numPr>` : "") +
    `<w:spacing w:after="${props.espacoDepoisTwips}"/>` +
    ind +
    `<w:jc w:val="${props.alinhamento}"/>`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${conteudo}</w:p>`;
}

// ── LISTA: numbering.xml, os oito formatos e o sub-tópico ─────────────────────────────────────

type NivelDeLista = { tipo: "ul" | "ol"; estilo: string };

/**
 * Os oito formatos que a setinha da barra oferece, mais `none` e os sinônimos `lower-latin`/
 * `upper-latin` que uma colagem traz. `%N` é trocado pelo número do nível: em OOXML o texto do
 * marcador de um nível 2 se escreve "%2.", não "%1.".
 */
const MARCADORES: Record<string, { formato: string; texto: string; fonte?: string }> = {
  disc: { formato: "bullet", texto: "&#xF0B7;", fonte: "Symbol" },
  circle: { formato: "bullet", texto: "o", fonte: "Courier New" },
  square: { formato: "bullet", texto: "&#xF0A7;", fonte: "Wingdings" },
  decimal: { formato: "decimal", texto: "%N." },
  "lower-alpha": { formato: "lowerLetter", texto: "%N." },
  "lower-latin": { formato: "lowerLetter", texto: "%N." },
  "upper-alpha": { formato: "upperLetter", texto: "%N." },
  "upper-latin": { formato: "upperLetter", texto: "%N." },
  "lower-roman": { formato: "lowerRoman", texto: "%N." },
  "upper-roman": { formato: "upperRoman", texto: "%N." },
  none: { formato: "none", texto: "" },
};

function estiloDaLista(el: NoElemento, perdas: string[]): string {
  const pedido = (el.estilo["list-style-type"] ?? "").trim().toLowerCase();
  const padrao = el.tag === "ol" ? "decimal" : "disc";
  if (!pedido) return padrao;
  if (MARCADORES[pedido]) return pedido;
  anotar(perdas, `formato de tópico "${pedido}" não existe em OOXML — a lista saiu com o marcador padrão de <${el.tag}>`);
  return padrao;
}

function nivelXml(ilvl: number, nivel: NivelDeLista): string {
  const marcador = MARCADORES[nivel.estilo] ?? MARCADORES[nivel.tipo === "ol" ? "decimal" : "disc"];
  const texto = marcador.texto.replace("%N", `%${ilvl + 1}`);
  const rPr = marcador.fonte ? `<w:rPr><w:rFonts w:ascii="${marcador.fonte}" w:hAnsi="${marcador.fonte}" w:hint="default"/></w:rPr>` : "";
  return (
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${marcador.formato}"/><w:lvlText w:val="${texto}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${RECUO_DE_NIVEL_TWIPS * (ilvl + 1)}" w:hanging="${PENDENTE_DO_MARCADOR_TWIPS}"/></w:pPr>${rPr}</w:lvl>`
  );
}

/** As duas metades do `numbering.xml` — separadas porque o esquema exige TODOS os `<w:abstractNum>` antes de qualquer `<w:num>`. */
export type NumeracaoDocx = { abstratosXml: string; instanciasXml: string };

type Estado = {
  perdas: string[];
  /** Primeiro id de numeração livre — acima de tudo o que o timbrado já usa (ver `montarPeticaoWord`). */
  deslocamento: number;
  /** Uma definição por CADEIA de formatos (nível 1 > nível 2 > ...): duas listas com a mesma cadeia dividem a definição. */
  abstratos: Map<string, { indice: number; cadeia: NivelDeLista[] }>;
  /** Uma INSTÂNCIA por `<ul>`/`<ol>` do documento, para cada lista recomeçar a contagem no 1. */
  instancias: { chave: string; nivel: number }[];
};

function numeracaoDoEstado(estado: Estado): NumeracaoDocx | null {
  if (estado.instancias.length === 0) return null;
  const abstratos = [...estado.abstratos.values()].sort((a, b) => a.indice - b.indice);
  const abstratosXml = abstratos
    .map((a) => {
      // NOVE níveis sempre, repetindo o último formato da cadeia: o Word espera a definição
      // completa, e um `<w:ilvl>` sem `<w:lvl>` correspondente sai sem marcador nenhum.
      const niveis = Array.from({ length: 9 }, (_, i) => nivelXml(i, a.cadeia[Math.min(i, a.cadeia.length - 1)]));
      return `<w:abstractNum w:abstractNumId="${estado.deslocamento + a.indice}"><w:multiLevelType w:val="hybridMultilevel"/>${niveis.join("")}</w:abstractNum>`;
    })
    .join("");
  const instanciasXml = estado.instancias
    .map((inst, i) => {
      const abstrato = estado.abstratos.get(inst.chave)!;
      // `startOverride` é o que faz CADA lista recomeçar no 1 — sem ele a segunda lista numerada da
      // peça continuaria de onde a primeira parou.
      return (
        `<w:num w:numId="${estado.deslocamento + i}"><w:abstractNumId w:val="${estado.deslocamento + abstrato.indice}"/>` +
        `<w:lvlOverride w:ilvl="${inst.nivel}"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`
      );
    })
    .join("");
  return { abstratosXml, instanciasXml };
}

// ── TABELA ────────────────────────────────────────────────────────────────────────────────────

const BORDA_DA_TABELA = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((b) => `<w:${b} w:val="single" w:sz="6" w:space="0" w:color="auto"/>`)
  .join("");

function inteiroDoAtributo(valor: string | undefined, maximo: number): number {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, maximo);
}

/** Os `<tr>` de uma tabela, atravessando `<thead>`/`<tbody>`/`<tfoot>` sem se perder no aninhamento. */
function linhasDaTabela(el: NoElemento): NoElemento[] {
  const linhas: NoElemento[] = [];
  const descer = (nos: No[]) => {
    for (const no of nos) {
      if (no.tipo !== "elemento") continue;
      if (no.tag === "tr") linhas.push(no);
      // Não desce dentro de `<table>`: uma tabela ANINHADA numa célula é convertida pela própria
      // célula, e recolher as linhas dela aqui as roubaria para a tabela de fora.
      else if (no.tag !== "table") descer(no.filhos);
    }
  };
  descer(el.filhos);
  return linhas;
}

type Vaga =
  | { papel: "celula"; celula: NoElemento; colspan: number; rowspan: number }
  | { papel: "continuacao"; colspan: number }
  | { papel: "coberta" };

function tabelaXml(el: NoElemento, ctx: Contexto, estado: Estado): string {
  const linhas = linhasDaTabela(el);
  if (linhas.length === 0) return "";
  const grade: (Vaga | undefined)[][] = linhas.map(() => []);

  for (let r = 0; r < linhas.length; r++) {
    const celulas = linhas[r].filhos.filter((n): n is NoElemento => n.tipo === "elemento" && TAGS_DE_CELULA.has(n.tag));
    let c = 0;
    for (const celula of celulas) {
      while (grade[r][c] !== undefined) c++;
      const colspan = inteiroDoAtributo(celula.atributos.colspan, 24);
      const rowspan = Math.min(inteiroDoAtributo(celula.atributos.rowspan, linhas.length), linhas.length - r);
      grade[r][c] = { papel: "celula", celula, colspan, rowspan };
      for (let k = 1; k < colspan; k++) grade[r][c + k] = { papel: "coberta" };
      // `rowspan` em OOXML não é atributo: é uma célula de CONTINUAÇÃO (`<w:vMerge/>`) em cada linha
      // de baixo. Sem essas células a linha fica curta e o Word desalinha a tabela inteira.
      for (let j = 1; j < rowspan; j++) {
        grade[r + j][c] = { papel: "continuacao", colspan };
        for (let k = 1; k < colspan; k++) grade[r + j][c + k] = { papel: "coberta" };
      }
      c += colspan;
    }
  }

  const colunas = Math.max(1, ...grade.map((l) => l.length));
  const larguraDaColuna = Math.max(1, Math.round(mmParaTwips(larguraUtilMm(PAGINA_A4.margens)) / colunas));
  const tblGrid = `<w:tblGrid>${`<w:gridCol w:w="${larguraDaColuna}"/>`.repeat(colunas)}</w:tblGrid>`;

  const celulaVazia = (largura: number, extra: string) => `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>${extra}<w:vAlign w:val="top"/></w:tcPr><w:p/></w:tc>`;

  const trs = grade
    .map((linha) => {
      const tcs: string[] = [];
      for (let c = 0; c < colunas; c++) {
        const vaga = linha[c];
        // Linha mais curta que a tabela: célula vazia de verdade, senão o Word encolhe a linha.
        if (vaga === undefined) {
          tcs.push(celulaVazia(larguraDaColuna, ""));
          continue;
        }
        if (vaga.papel === "coberta") continue;
        const gridSpan = vaga.colspan > 1 ? `<w:gridSpan w:val="${vaga.colspan}"/>` : "";
        const tcW = `<w:tcW w:w="${larguraDaColuna * vaga.colspan}" w:type="dxa"/>`;
        if (vaga.papel === "continuacao") {
          tcs.push(celulaVazia(larguraDaColuna * vaga.colspan, `${gridSpan}<w:vMerge/>`));
          continue;
        }
        const vMerge = vaga.rowspan > 1 ? `<w:vMerge w:val="restart"/>` : "";
        const dentro = blocosDeNos(
          vaga.celula.filhos,
          {
            // Dentro da célula o espaço depois do parágrafo é ZERO: a margem interna da célula é o
            // `<w:tblCellMar>` abaixo, e somar os dois estufaria toda linha de tabela.
            props: { ...propsDoBloco(vaga.celula, { ...ctx.props, espacoDepoisTwips: 0 }, estado.perdas), espacoDepoisTwips: 0 },
            aparencia: ctx.aparencia,
            numeracao: undefined,
            cadeia: [],
          },
          estado,
        );
        // Toda `<w:tc>` termina em `<w:p>` — exigência do formato. Uma célula que acaba em tabela
        // aninhada sem isso deixa o arquivo inválido.
        const conteudo = dentro.length > 0 ? dentro.join("") : "<w:p/>";
        const fecho = conteudo.endsWith("</w:p>") || conteudo.endsWith("<w:p/>") ? "" : "<w:p/>";
        tcs.push(`<w:tc><w:tcPr>${tcW}${gridSpan}${vMerge}<w:vAlign w:val="top"/></w:tcPr>${conteudo}${fecho}</w:tc>`);
      }
      return `<w:tr>${tcs.join("")}</w:tr>`;
    })
    .join("");

  const tblCellMar =
    `<w:tblCellMar><w:top w:w="${CELULA_MARGEM_VERTICAL_TWIPS}" w:type="dxa"/><w:left w:w="${CELULA_MARGEM_HORIZONTAL_TWIPS}" w:type="dxa"/>` +
    `<w:bottom w:w="${CELULA_MARGEM_VERTICAL_TWIPS}" w:type="dxa"/><w:right w:w="${CELULA_MARGEM_HORIZONTAL_TWIPS}" w:type="dxa"/></w:tblCellMar>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDA_DA_TABELA}</w:tblBorders>${tblCellMar}</w:tblPr>${tblGrid}${trs}</w:tbl>`;
}

// ── O PERCURSO ────────────────────────────────────────────────────────────────────────────────

type Contexto = {
  props: PropsParagrafo;
  aparencia: Aparencia;
  /** A numeração da lista aberta agora — é o que faz um `<li>` sair como item, e não como parágrafo. */
  numeracao: Numeracao | undefined;
  cadeia: NivelDeLista[];
};

function blocosDeNos(nos: No[], ctx: Contexto, estado: Estado): string[] {
  const blocos: string[] = [];
  let corridas: string[] = [];
  let propsAbertas = ctx.props;

  const fechar = () => {
    if (corridas.length === 0) return;
    blocos.push(paragrafoXml(corridas.join(""), propsAbertas));
    corridas = [];
  };

  // A NUMERAÇÃO VIAJA NAS PROPS DO PARÁGRAFO, não no contexto: é `paragrafoXml` que escreve o
  // `<w:numPr>`, e ele só vê as props com que o parágrafo foi aberto. O contexto de DENTRO do bloco
  // sai com a numeração zerada — um `<p>` ou uma tabela dentro de um `<li>` não é outro item da
  // lista, e herdar a numeração faria aparecer um marcador a mais no Word.
  const blocoAninhado = (el: NoElemento, c: Contexto, props: PropsParagrafo) => {
    fechar();
    const dentro = blocosDeNos(el.filhos, { ...c, props, numeracao: undefined, aparencia: aparenciaDoElemento(el, c.aparencia, estado.perdas) }, estado);
    // Bloco sem conteúdo nenhum é uma LINHA EM BRANCO de propósito (o advogado apertou Enter):
    // descartá-la deixaria o Word com um parágrafo a menos do que a folha mostra.
    blocos.push(...(dentro.length > 0 ? dentro : [paragrafoXml("", props)]));
  };

  const percorrer = (lista: No[], c: Contexto) => {
    for (let k = 0; k < lista.length; k++) {
      const no = lista[k];
      if (no.tipo === "texto") {
        if (corridas.length === 0) propsAbertas = c.props;
        corridas.push(corrida(no.texto, c.aparencia));
        continue;
      }
      const tag = no.tag;
      if (tag === "br") {
        // `<br>` no FIM do bloco é o marcador que o contentEditable deixa para a linha existir: ele
        // não desenha linha nenhuma na tela, e virar `<w:br/>` abriria um vão que a folha não mostra.
        if (k === lista.length - 1 || corridas.length === 0) continue;
        corridas.push("<w:r><w:br/></w:r>");
        continue;
      }
      if (TAGS_INLINE.has(tag)) {
        percorrer(no.filhos, { ...c, aparencia: aparenciaDoElemento(no, c.aparencia, estado.perdas) });
        continue;
      }
      if (TAGS_DE_LISTA.has(tag)) {
        fechar();
        const cadeia: NivelDeLista[] = [...c.cadeia, { tipo: tag === "ol" ? "ol" : "ul", estilo: estiloDaLista(no, estado.perdas) }];
        const chave = cadeia.map((n) => `${n.tipo}:${n.estilo}`).join(">");
        if (!estado.abstratos.has(chave)) estado.abstratos.set(chave, { indice: estado.abstratos.size, cadeia });
        const nivel = cadeia.length - 1;
        let indiceDaInstancia: number;
        if (estado.instancias.length < MAXIMO_DE_LISTAS) {
          indiceDaInstancia = estado.instancias.length;
          estado.instancias.push({ chave, nivel });
        } else {
          anotar(estado.perdas, `mais de ${MAXIMO_DE_LISTAS} listas no documento — as demais dividem uma numeração e não recomeçam a contagem`);
          indiceDaInstancia = Math.max(
            0,
            estado.instancias.findIndex((i) => i.chave === chave && i.nivel === nivel),
          );
        }
        const semMarcador = cadeia[nivel].estilo === "none";
        percorrer(no.filhos, {
          ...c,
          cadeia,
          numeracao: semMarcador ? undefined : { numId: estado.deslocamento + indiceDaInstancia, nivel },
          props: semMarcador ? { ...c.props, recuoDeListaTwips: RECUO_DE_NIVEL_TWIPS * (nivel + 1) } : c.props,
        });
        continue;
      }
      if (tag === "li") {
        const props: PropsParagrafo = {
          ...propsDoBloco(no, c.props, estado.perdas),
          espacoDepoisTwips: ESPACO_DEPOIS_DE_ITEM_TWIPS,
          recuoDeListaTwips: c.props.recuoDeListaTwips,
          numeracao: c.numeracao,
        };
        blocoAninhado(no, c, props);
        continue;
      }
      if (tag === "table") {
        fechar();
        const xml = tabelaXml(no, c, estado);
        if (xml !== "") {
          blocos.push(xml);
          // O `<w:p>` OBRIGATÓRIO depois de uma tabela (ver a perda 6 no cabeçalho): sem ele duas
          // tabelas vizinhas viram uma, e uma tabela no fim do corpo deixa o arquivo inválido.
          blocos.push(paragrafoXml("", { ...PROPS_INICIAIS, espacoDepoisTwips: 0 }));
        }
        continue;
      }
      if (TAGS_DE_BLOCO.has(tag)) {
        blocoAninhado(no, c, propsDoBloco(no, c.props, estado.perdas));
        continue;
      }
      // `<tr>`/`<td>` solto (fora de tabela, depois do saneamento) e qualquer tag que sobre: o
      // conteúdo segue, a caixa é ignorada. Nunca perder texto de peça por causa de uma tag.
      percorrer(no.filhos, c);
    }
  };

  percorrer(nos, ctx);
  fechar();
  return blocos;
}

// ── A PORTA DO MÓDULO ─────────────────────────────────────────────────────────────────────────

export type CorpoFormatadoDocx = {
  /** A sequência de `<w:p>`/`<w:tbl>` do corpo da peça, pronta para entrar no `<w:body>`. */
  corpoXml: string;
  /** O texto puro do MESMO HTML, derivado pela função única — é sobre ele que o fecho é reconferido. */
  textoPuro: string;
  /** O que acrescentar ao `word/numbering.xml` do pacote, ou `null` quando a minuta não tem lista. */
  numeracao: NumeracaoDocx | null;
  /** O que o OOXML não representou — ver a lista comentada no cabeçalho deste módulo. */
  perdas: string[];
};

/**
 * O corpo do .docx a partir do HTML da folha.
 *
 * `deslocamentoDeNumeracao` é o primeiro id de numeração livre do pacote: num .docx do zero é 1, e
 * num timbrado é um acima de tudo o que ele já usa — senão a lista da peça brigaria com a lista do
 * timbrado e uma das duas sairia com o marcador da outra.
 */
export function corpoDocxDoHtmlDaMinuta(html: string, deslocamentoDeNumeracao = 1): CorpoFormatadoDocx {
  const limpo = sanitizarMinutaHtml(html ?? "");
  const estado: Estado = {
    perdas: [],
    deslocamento: Math.max(1, Math.trunc(deslocamentoDeNumeracao)),
    abstratos: new Map(),
    instancias: [],
  };
  const blocos = blocosDeNos(
    arvoreDoHtml(limpo),
    { props: PROPS_INICIAIS, aparencia: { tamanhoPt: TAMANHO_DO_CORPO_PT }, numeracao: undefined, cadeia: [] },
    estado,
  );
  return {
    corpoXml: blocos.join(""),
    textoPuro: textoPuroDaMinutaHtml(limpo),
    numeracao: numeracaoDoEstado(estado),
    perdas: estado.perdas,
  };
}
