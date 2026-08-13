// Limpeza do texto de publicações e andamentos: decodificação de entidades HTML e, quando o
// teor chega como um documento HTML inteiro (caso do DJEN — ver converterHtmlParaTextoSimples
// abaixo), remoção da marcação também.
//
// O teor que chega dos diários oficiais e dos e-mails do Jusbrasil vem com o texto escapado em
// HTML — "PROTOCOLO N&ordm; ... A&Ccedil;&Atilde;O: PROCESSO C&Iacute;VEL". Nada no caminho de
// entrada desfazia isso, então a publicação era gravada e exibida com os códigos crus no lugar
// dos acentos, deixando o teor difícil de ler e quebrando a busca (procurar "AÇÃO" não achava
// "A&Ccedil;&Atilde;O").
//
// Também repara uma corrupção observada em publicação real: `A&Ccedil; Atilde;O`, em que o "&"
// de uma entidade virou espaço em algum ponto do trajeto (ver `repararEntidadesSemEComercial`).

// Entidades nomeadas que aparecem em texto jurídico brasileiro. Não é a tabela HTML inteira de
// propósito: o que não estiver aqui e for numérico (&#193; / &#xC1;) é resolvido pelo caminho
// numérico abaixo, que cobre qualquer caractere.
const ENTIDADES: Record<string, string> = {
  // Estruturais — `amp` fica na mesma passada que as demais para não haver decodificação dupla
  // (uma única varredura substitui cada ocorrência uma vez só, então "&amp;lt;" vira "&lt;", e
  // não "<", que é o comportamento correto).
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",

  // Vogais acentuadas — minúsculas
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä", aring: "å",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  iacute: "í", igrave: "ì", icirc: "î", iuml: "ï",
  oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö",
  uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  yacute: "ý", yuml: "ÿ", ccedil: "ç", ntilde: "ñ",

  // Vogais acentuadas — maiúsculas
  Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Euml: "Ë",
  Iacute: "Í", Igrave: "Ì", Icirc: "Î", Iuml: "Ï",
  Oacute: "Ó", Ograve: "Ò", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö",
  Uacute: "Ú", Ugrave: "Ù", Ucirc: "Û", Uuml: "Ü",
  Yacute: "Ý", Ccedil: "Ç", Ntilde: "Ñ",

  // Sinais frequentes em publicação (ordinais, moeda, pontuação tipográfica)
  ordm: "º", ordf: "ª", deg: "°", sect: "§", para: "¶", middot: "·", bull: "•",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  hellip: "…", mdash: "—", ndash: "–", minus: "−", times: "×", divide: "÷",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", cent: "¢", curren: "¤", yen: "¥",
  frac12: "½", frac14: "¼", frac34: "¾", sup1: "¹", sup2: "²", sup3: "³",
  iexcl: "¡", iquest: "¿", plusmn: "±", not: "¬", macr: "¯", acute: "´", cedil: "¸",
  uml: "¨", brvbar: "¦", shy: "­", ensp: " ", emsp: " ", thinsp: " ",
};

// Repara a corrupção observada em publicação real: `A&Ccedil; Atilde;O` no lugar de
// `A&Ccedil;&Atilde;O`. Em algum ponto do trajeto (conversão de HTML para texto do e-mail, ou o
// próprio diário) o "&" de uma entidade virou espaço, e sem isto o nome da entidade sobreviveria
// literalmente ao decodificador — "Atilde;O" no meio da frase.
//
// O reparo NÃO vale para toda a tabela, só para as entidades que produzem letra acentuada (mais
// ordm/ordf). Duas razões: (1) são exatamente as que arruínam a leitura do teor; (2) vários nomes
// da tabela são palavras comuns em português — `para`, `not`, `reg`, `copy`, `times` —, e repará-las
// transformaria texto legítimo em símbolo. Pela mesma cautela o "&" só é reposto quando o nome NÃO
// vem logo depois de "&" ou de letra, o que preserva "&amp;lt;" (que deve virar "&lt;", e não "<").
const NOMES_REPARAVEIS = Object.keys(ENTIDADES)
  .filter((n) => /^(a|e|i|o|u|y|c|n|A|E|I|O|U|Y|C|N)(acute|grave|circ|tilde|uml|ring|cedil)$/.test(n) || n === "ordm" || n === "ordf")
  .join("|");

const RE_SEM_E_COMERCIAL = new RegExp(`(?<![&\\w])[ \\t]?(${NOMES_REPARAVEIS});`, "g");

function repararEntidadesSemEComercial(texto: string): string {
  return texto.replace(RE_SEM_E_COMERCIAL, (_m, nome: string) => `&${nome};`);
}

const RE_ENTIDADE = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

export function decodificarEntidadesHtml(texto: string): string {
  if (!texto || !texto.includes(";")) return texto;

  return repararEntidadesSemEComercial(texto).replace(RE_ENTIDADE, (inteiro, corpo: string) => {
    if (corpo[0] === "#") {
      const codigo = corpo[1] === "x" || corpo[1] === "X" ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      // Fora da faixa válida do Unicode, ou substituto isolado: devolve como veio em vez de
      // gerar um caractere inválido que quebraria a gravação no banco.
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return inteiro;
      try {
        return String.fromCodePoint(codigo);
      } catch {
        return inteiro;
      }
    }
    // Nome desconhecido volta intacto — melhor manter "&foo;" visível do que engolir texto.
    return ENTIDADES[corpo] ?? inteiro;
  });
}

// Aplica a decodificação preservando null/undefined — os campos de teor são opcionais em quase
// todas as origens (ver lib/roboBridge.ts, lib/jusbrasilEmailSync.ts).
export function decodificarOpcional<T extends string | null | undefined>(texto: T): T {
  return (typeof texto === "string" ? decodificarEntidadesHtml(texto) : texto) as T;
}

// Elementos de BLOCO — o fechamento de cada um vira quebra de linha, porque é o que separa uma
// linha de tabela da próxima, um parágrafo do seguinte etc. Célula de tabela (td/th) fica de
// fora de propósito: no teor real do DJEN cada <tr> tem só duas células ("RÓTULO" + ": valor"),
// e concatenar as duas sem separador reproduz a frase certa ("EMBARGANTE: fulano") — o DJEN
// nunca usa tabela de grade de verdade, então não há por que inserir separador entre células.
const RE_FECHO_BLOCO = /<\/(p|div|tr|table|thead|tbody|section|article|header|footer|li|ul|ol|h[1-6])\s*>/gi;

// O teor bruto do DJEN (RoboPublicacao.teor) é um documento HTML inteiro — <html><head>
// <style>...</style></head><body><article>... — porque é assim que o robô Python captura a
// página de detalhe da comunicação processual. Sem isto, a marcação inteira (inclusive o CSS
// dentro de <style>) ia parar direto no campo Publication.content e aparecia crua na tela (ver
// relato do dono do escritório com print do teor cheio de <html>/<section>/<span>).
//
// Propositalmente NÃO usa nenhuma lib de parsing HTML (cheerio/jsdom): o formato de entrada é
// estável (mesmo gerador, o robô sempre entrega a mesma estrutura) e um stripper com regex,
// hand-rolled, resolve sem adicionar dependência nova — mesmo raciocínio de
// decodificarEntidadesHtml acima.
export function converterHtmlParaTextoSimples(html: string | null | undefined): string {
  if (!html) return html ?? "";
  // Sem nenhuma tag — não é HTML, devolve como veio (não mexe no teor de fontes que já chegam
  // em texto simples, ex.: e-mail do Jusbrasil já convertido por mailparser).
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;

  const semMarcacao = html
    // <head>, <style> e <script> inteiros somem — CONTEÚDO incluso: é onde mora CSS/metadado
    // que nunca deveria virar texto visível.
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(RE_FECHO_BLOCO, "\n")
    // Todo o resto da marcação (abertura de tag, tag sem par como <meta>/<div>) só some — o
    // texto de dentro já ficou no lugar certo pelas trocas acima.
    .replace(/<[^>]+>/g, "");

  const texto = decodificarEntidadesHtml(semMarcacao);

  // Colapsa: cada linha perde espaço/tab repetido nas pontas, e uma sequência de linhas em
  // branco (parágrafo vazio, várias tags de bloco fechando em sequência) vira no máximo UMA —
  // sem isto o teor sai com dezenas de linhas em branco entre cada frase.
  const linhas: string[] = [];
  for (const bruta of texto.split("\n")) {
    const linha = bruta.replace(/[ \t]+/g, " ").trim();
    if (linha === "" && (linhas.length === 0 || linhas[linhas.length - 1] === "")) continue;
    linhas.push(linha);
  }
  while (linhas.length > 0 && linhas[linhas.length - 1] === "") linhas.pop();

  return linhas.join("\n");
}
