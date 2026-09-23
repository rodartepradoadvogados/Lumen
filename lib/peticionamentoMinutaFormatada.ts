// A FORMATAÇÃO DA MINUTA — e a única tradução possível entre ela e o texto puro.
//
// ── O PROBLEMA, E POR QUE ELE NÃO SE RESOLVE GUARDANDO HTML NO LUGAR DO TEXTO ─────────────────
//
// `PeticionamentoSessao.minutaTexto` é TEXTO PURO, e QUATRO coisas dependem disso hoje:
//
//   1. lib/peticionamentoFecho.ts — `garantirFecho()` confere o fim literal da peça em TODA
//      gravação; ele compara o fim da string, não o fim de uma árvore de tags.
//   2. lib/peticionamentoCitacoes.ts — `normalizarTextoCitacao()`/`hashDeTexto()` são a
//      IDENTIDADE de cada citação e a trava do "li e revisei". Se a forma do texto mudar, ou toda
//      confirmação que o advogado já deu é invalidada, ou a citação deixa de ser encontrada no
//      corpo — as duas falhas em silêncio.
//   3. lib/peticionamentoDocx.ts — divide o corpo por `\n{2,}` (parágrafo) e por `\n` (quebra
//      simples dentro do parágrafo) para montar o Word.
//   4. lib/peticionamentoPasso.ts — `minutaTexto.trim().length > 0` é o que decide se já existe
//      minuta.
//
// Guardar HTML naquela coluna quebraria as quatro de uma vez, e nenhuma delas gritaria. Então a
// formatação ganhou coluna NOVA e OPCIONAL (`minutaFormatadaHtml`) e `minutaTexto` continua sendo
// o texto puro, a fonte das citações, do fecho e do Word.
//
// ── A REGRA QUE IMPEDE AS DUAS REPRESENTAÇÕES DE DIVERGIREM ───────────────────────────────────
//
// O texto puro NUNCA é digitado em paralelo ao HTML: ele é DERIVADO do HTML, por
// `textoPuroDaMinutaHtml` — esta função, uma só, aqui. A Server Action de gravação recebe SÓ o
// HTML; se ela recebesse os dois, bastaria um bug de tela para gravar um corpo que não é o que
// está na folha, e o advogado exportaria um Word que não corresponde ao que ele revisou.
//
// A derivação preserva exatamente o que o Word precisa:
//   • fim de bloco (parágrafo, título, lista, tabela) → `\n\n`
//   • quebra simples (<br>, item de lista, linha de tabela) → `\n`
//   • célula de tabela → separada por tabulação
//
// ── SEGURANÇA ─────────────────────────────────────────────────────────────────────────────────
//
// `sanitizarMinutaHtml` roda SEMPRE no servidor, em TRÊS momentos — antes de gravar, antes de
// derivar, e de novo ao ABRIR a folha (`htmlParaAbrirAFolha`), porque o que sai dela vai para
// `innerHTML` e um escritor futuro que esqueça de sanear não pode virar XSS armazenado — mesma
// disciplina de lib/richText.ts (achado V9 da auditoria de 05/09/2026: sanitizar HTML só com
// regex é frágil contra mutation-XSS). A lista de tags aqui é MAIOR que a de lib/richText.ts
// porque o editor da minuta faz mais que aquele: alinhamento, recuo, cor, tabela. Por isso as
// duas listas são separadas de propósito — ampliar a de lá para caber tabela e `style` abriria
// superfície nas Anotações e na Descrição de Tarefa, que não precisam de nada disso.
//
// A derivação abaixo percorre a string com um varredor próprio em vez de um parser de árvore: ela
// só corre DEPOIS da sanitização, sobre um conjunto fechado e conhecido de tags, e o que ela
// produz é texto — nunca HTML que volte a ser interpretado por um navegador. Sanitizar é trabalho
// do sanitize-html; aqui é tradução.

import sanitizeHtml from "sanitize-html";

/** As tags que o editor da minuta produz — qualquer outra é removida, o texto de dentro fica. */
export const TAGS_DA_MINUTA = [
  "p", "div", "br", "span",
  "b", "strong", "i", "em", "u", "s", "sup", "sub",
  "h1", "h2", "h3", "blockquote",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "td", "th",
];

// Propriedades de estilo aceitas — exatamente o que os botões da barra e a régua produzem.
// Cor em #hex ou rgb()/rgba(); medida em mm/cm/pt/px/em/%; nada de url(), expression() ou
// qualquer coisa que carregue recurso externo.
const COR = [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\(\s*[\d.\s,%]+\)$/, /^[a-zA-Z]+$/];
const MEDIDA = [/^-?\d+(\.\d+)?(mm|cm|pt|px|em|rem|%)$/, /^0$/];
const ESTILOS_DA_MINUTA: Record<string, RegExp[]> = {
  color: COR,
  "background-color": COR,
  "text-align": [/^(left|right|center|justify)$/],
  "text-indent": MEDIDA,
  "margin-left": MEDIDA,
  "margin-right": MEDIDA,
  "list-style-type": [/^[a-z-]+$/],
  "font-weight": [/^(bold|normal|[1-9]00)$/],
  "font-style": [/^(italic|normal)$/],
  "text-decoration": [/^(underline|line-through|none)$/],
  "vertical-align": [/^(super|sub|baseline)$/],
};

/**
 * O HTML que pode ser gravado — ponto único de defesa, nunca confia em quem chamou.
 * `colspan`/`rowspan` são o único atributo além de `style`: sem eles uma tabela colada de fora
 * perderia a forma e viraria um monte de célula solta.
 */
export function sanitizarMinutaHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: TAGS_DA_MINUTA,
    allowedAttributes: { "*": ["style"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedStyles: { "*": ESTILOS_DA_MINUTA },
    allowedSchemes: [],
  }).trim();
}

// ── DERIVAÇÃO ─────────────────────────────────────────────────────────────────────────────────

// Marcadores internos, fora da faixa de caractere que texto de petição usa. Existem para que a
// FORÇA da quebra possa ser comparada depois de tudo percorrido: `</li></ul>` pede quebra simples
// e quebra de bloco no mesmo ponto, e quem manda é a mais forte — não a última vista.
const BLOCO = "\u0001"; // vira "\n\n"
const LINHA = "\u0002"; // vira "\n"
const CELULA = "\u0003"; // vira "\t"

/** Tags cujo início e fim terminam um BLOCO (o Word transforma cada bloco num parágrafo). */
const TAGS_DE_BLOCO = new Set(["p", "div", "h1", "h2", "h3", "blockquote", "ul", "ol", "table", "thead", "tbody"]);
/** Tags cujo início e fim terminam uma LINHA dentro do mesmo bloco. */
const TAGS_DE_LINHA = new Set(["li", "tr", "br"]);
const TAGS_DE_CELULA = new Set(["td", "th"]);

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", deg: "°", ordm: "º", ordf: "ª", sect: "§", middot: "·", bull: "•",
};

function decodificarEntidades(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (inteiro, corpo: string) => {
    if (corpo.startsWith("#")) {
      const codigo = corpo[1] === "x" || corpo[1] === "X" ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      return Number.isFinite(codigo) && codigo > 0 ? String.fromCodePoint(codigo) : inteiro;
    }
    return ENTIDADES[corpo.toLowerCase()] ?? inteiro;
  });
}

/**
 * O TEXTO PURO de um HTML de minuta — a função que o resto do sistema tem de usar, sempre.
 *
 * O contrato com lib/peticionamentoDocx.ts: parágrafo separado por `\n\n`, quebra simples por
 * `\n`. Sem isso o Word sai com tudo colado num parágrafo só, ou com um parágrafo por linha.
 */
export function textoPuroDaMinutaHtml(html: string): string {
  if (!html) return "";
  const pedacos: string[] = [];
  // Quantos <li> estão abertos neste ponto. Serve a UMA decisão: uma lista aninhada DENTRO de um
  // item (o sub-tópico) não é um bloco novo — é continuação da mesma lista. Sem esta conta,
  // "Pai / Filho um" virava dois parágrafos no Word, e o sub-tópico aparecia descolado do pai.
  let profundidadeDeItem = 0;
  let i = 0;
  while (i < html.length) {
    const abre = html.indexOf("<", i);
    if (abre < 0) {
      pedacos.push(textoDeNo(html.slice(i)));
      break;
    }
    if (abre > i) pedacos.push(textoDeNo(html.slice(i, abre)));
    const fecha = html.indexOf(">", abre);
    if (fecha < 0) {
      // "<" solto no fim: é texto, não tag — nunca engole o resto do documento em silêncio.
      pedacos.push(textoDeNo(html.slice(abre)));
      break;
    }
    const rotulo = html.slice(abre + 1, fecha).trim();
    const fechando = rotulo.startsWith("/");
    const tag = rotulo.replace(/^\//, "").split(/[\s/>]/)[0].toLowerCase();
    if (tag === "li") {
      profundidadeDeItem = fechando ? Math.max(0, profundidadeDeItem - 1) : profundidadeDeItem + 1;
      pedacos.push(LINHA);
    } else if ((tag === "ul" || tag === "ol") && profundidadeDeItem > 0) {
      pedacos.push(LINHA);
    } else if (TAGS_DE_BLOCO.has(tag)) pedacos.push(BLOCO);
    else if (TAGS_DE_LINHA.has(tag)) pedacos.push(LINHA);
    else if (TAGS_DE_CELULA.has(tag)) pedacos.push(CELULA);
    i = fecha + 1;
  }
  return juntar(pedacos.join(""));
}

/**
 * Texto de dentro de um nó: entidade decodificada, e quebra de linha do CÓDIGO-FONTE do HTML
 * virando espaço — em HTML ela é só espaço, e deixá-la passar inventaria parágrafo onde o
 * advogado não pediu nenhum. Espaço duplo DIGITADO é preservado (não é colapsado): ele existe em
 * texto de petição e sumir com ele mudaria o corpo sem ninguém ter pedido.
 */
function textoDeNo(bruto: string): string {
  // A quebra de linha do fonte e o recuo em volta dela são UM espaço só — é assim que o HTML se
  // comporta. Espaço duplo SEM quebra no meio fica intacto: é conteúdo do parágrafo.
  return decodificarEntidades(bruto).replace(/[^\S\r\n]*[\r\n]+[^\S\r\n]*/g, " ");
}

function juntar(comMarcadores: string): string {
  return (
    comMarcadores
      // Espaço em volta de uma quebra (ou de um limite de célula) é formatação do HTML, não
      // conteúdo do parágrafo.
      .replace(/\s*([\u0001\u0002])\s*/g, "$1")
      .replace(/\s*(\u0003+)\s*/g, "$1")
      // Marcadores seguidos: manda o mais FORTE, nunca o último. `</li></ul><p>` é uma quebra de
      // bloco, não três quebras.
      .replace(/[\u0001\u0002]{2,}/g, (m) => (m.includes(BLOCO) ? BLOCO : LINHA))
      // Limite de célula encostado numa quebra é o fim da última célula da linha, não uma coluna
      // vazia a mais.
      .replace(/\u0003*([\u0001\u0002])\u0003*/g, "$1")
      .replace(/^\u0003+|\u0003+$/g, "")
      // Abrir e fechar `<td>` marcam DUAS vezes o mesmo limite — uma tabulação, não duas.
      .replace(/\u0003+/g, "\t")
      .replace(/\u0001/g, "\n\n")
      .replace(/\u0002/g, "\n")
      .trim()
  );
}

// ── O CAMINHO DE VOLTA, E O QUE ELE GARANTE ───────────────────────────────────────────────────

/**
 * A forma NORMALIZADA de um texto puro de minuta — a única sobre a qual a ida-e-volta
 * (texto → HTML → texto) devolve a MESMA string, byte a byte:
 *
 *   • CRLF/CR viram `\n` (o Word e o editor escrevem os dois);
 *   • espaço no fim da linha cai (em HTML ele não sobrevive à volta, e não significa nada);
 *   • três ou mais quebras seguidas viram duas (o Word só conhece "parágrafo" e "quebra dentro
 *     do parágrafo" — a terceira quebra não tem para onde ir).
 *
 * É por isto que uma sessão ANTIGA, sem HTML gravado, NÃO tem `minutaTexto` reescrito na abertura
 * da tela: a folha é semeada a partir do texto que já existe, e o texto só é regravado quando o
 * advogado de fato edita — aí a normalização é consequência de uma edição, não de uma visita.
 */
export function normalizarTextoPuroDaMinuta(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[^\S\n]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * A SEMENTE da folha quando a sessão ainda não tem formatação gravada (`minutaFormatadaHtml`
 * nulo — estado legítimo, ver o contrato no schema): o texto puro vira parágrafos, preservando
 * `\n\n` como fim de parágrafo e `\n` como quebra simples.
 *
 * Inversa de `textoPuroDaMinutaHtml` para todo texto já normalizado — provado em
 * lib/testes/peticionamentoMinutaFormatada.teste.ts, que é o que sustenta a promessa de que
 * abrir e salvar uma minuta antiga sem mexer em nada não muda uma vírgula do corpo.
 */
export function htmlDaMinutaDoTextoPuro(texto: string): string {
  const normalizado = normalizarTextoPuroDaMinuta(texto ?? "");
  if (normalizado.length === 0) return "";
  return normalizado
    .split(/\n{2,}/)
    .map((paragrafo) => `<p>${paragrafo.split("\n").map(escaparHtml).join("<br>")}</p>`)
    .join("");
}

/**
 * O HTML que a folha deve abrir: o gravado, quando existe; a semente do texto puro, quando não.
 * Um só lugar decide isto — a página e qualquer outra tela futura chamam daqui em vez de
 * repetirem o `??`, que é como uma das duas acabaria semeando diferente da outra.
 */
export function htmlParaAbrirAFolha(minutaFormatadaHtml: string | null | undefined, minutaTexto: string | null | undefined): string {
  const gravado = (minutaFormatadaHtml ?? "").trim();
  // SANEADO OUTRA VEZ NA LEITURA, e não só na gravação — defesa em profundidade, a mesma régua que
  // `confirmarExportacao` já aplica ao reconferir o fecho que `atualizarCorpoDaMinuta` acabou de
  // garantir ("nunca confiar numa trava só").
  //
  // O QUE ESTA LINHA DEFENDE. O que esta função devolve vai para `corpo.innerHTML` em
  // components/peticionamento/MinutaEditor.tsx. Atribuir a `innerHTML` não executa `<script>`, mas
  // executa `<img onerror=...>` — é um ponto de injeção de verdade, não teórico. Hoje quem grava a
  // coluna é só `atualizarCorpoDaMinuta`, que saneia antes; então hoje não há furo. O risco é o
  // AMANHÃ: a etapa B, uma importação de .docx, uma colagem vinda do Word tratada noutro caminho,
  // uma correção feita direto no banco — qualquer escritor novo que esqueça de sanear vira XSS
  // armazenado num sistema de vários escritórios, e o furo não apareceria em nenhum teste do lado
  // que mudou. Sanear na leitura custa uma passada de sanitize-html por abertura de folha e fecha
  // a porta pelo lado de dentro, independentemente de quem escreveu.
  if (gravado.length > 0) return sanitizarMinutaHtml(gravado);
  // A semente escapa o texto puro (`escaparHtml`), então ela já nasce segura — mas passa pelo mesmo
  // saneamento para que exista UM caminho de saída, e não dois com garantias diferentes.
  return sanitizarMinutaHtml(htmlDaMinutaDoTextoPuro(minutaTexto ?? ""));
}
