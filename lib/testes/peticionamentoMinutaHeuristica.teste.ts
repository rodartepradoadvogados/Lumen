import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  htmlDaMinutaDoTextoPuro,
  htmlParaAbrirAFolha,
  normalizarTextoPuroDaMinuta,
  sanitizarMinutaHtml,
  textoPuroDaMinutaHtml,
} from "@/lib/peticionamentoMinutaFormatada";
import { papelDoParagrafoDaMinuta, paragrafosDoTextoPuroDaMinuta } from "@/lib/peticionamentoMinutaHeuristica";
import { montarPeticaoWord, type DadosPeticaoDocx, type MetadadosPeticaoDocx } from "@/lib/peticionamentoDocx";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { hashDeTexto, normalizarTextoCitacao } from "@/lib/peticionamentoCitacoes";

// ════════════════════════════════════════════════════════════════════════════════════════════
// A SEMENTE NASCE COM O QUE A HEURÍSTICA ADIVINHAVA ESCONDIDO — e o que isso NÃO pode mexer.
//
// O PROBLEMA. Antes do editor, o negrito do título e o alinhamento à direita da data aconteciam
// INVISIVELMENTE, na hora de montar o Word do texto puro. Com o editor, quem manda é a folha. Então
// uma minuta ANTIGA bastava ser ABERTA E SALVA para passar a exportar um Word SEM negrito de título
// e SEM data à direita — rebaixamento silencioso do produto do trabalho do advogado, causado por só
// editar. A decisão do dono: "com o negrito". A semente (`htmlDaMinutaDoTextoPuro`) passa a aplicar
// a MESMA heurística, agora visível na tela e editável na barra.
//
// O QUE ESTES CASOS GUARDAM, e é a metade difícil:
//
//   1. `minutaTexto` NÃO MUDA EM NADA. A semente produz HTML; o texto puro derivado de volta é
//      byte a byte o mesmo, com e sem título, antes e depois do saneamento do servidor.
//   2. O HASH DAS CITAÇÕES não muda. Ele é a trava do "li e revisei": mudar invalidaria em silêncio
//      toda confirmação que o advogado já deu.
//   3. O FECHO continua conferível sobre o texto puro.
//   4. O WORD de uma sessão SEM `minutaFormatadaHtml` continua saindo do caminho antigo.
//   5. Sessão que JÁ tem formatação gravada não é tocada pela semente.
//   6. HÁ UMA implementação da heurística, não duas — senão o Word e a tela divergem em silêncio,
//      sem nenhum teste acusar.
//
// MÉTODO. As asserções olham o MECANISMO, e toleram grafia: `text-align: right` sai do saneamento
// como `text-align:right` (sem o espaço), e uma asserção presa à grafia com espaço reprovaria o
// saneamento em vez do defeito.
// ════════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();

const TEXTO_COM_TITULO =
  "I — DOS FATOS\n\n" +
  "O autor contratou o plano em 2019, e a negativa veio em 2024.\nA recusa foi por escrito.\n\n" +
  "II — DO DIREITO\n\n" +
  "Conforme o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.\n\n" +
  "Goiânia, 23 de setembro de 2026.\n\n" +
  "Termos em que pede deferimento.";

const TEXTO_SEM_TITULO =
  "O autor contratou o plano em 2019, e a negativa veio em 2024.\n\n" +
  "Conforme o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.\n\n" +
  "Termos em que pede deferimento.";

// ── LEITURA DO HTML DA SEMENTE, por parágrafo ────────────────────────────────────────────────
//
// A leitura é BALANCEADA pelo fechamento do próprio `<p>`, e não por uma janela de N caracteres:
// uma janela escorregaria para o parágrafo vizinho e a asserção passaria (ou reprovaria) pelo
// motivo errado — o defeito 2 do cabeçalho de lib/testes/executar.ts.

type ParagrafoDaSemente = { texto: string; negrito: boolean; aDireita: boolean };

function paragrafosDaSemente(html: string): ParagrafoDaSemente[] {
  const achados: ParagrafoDaSemente[] = [];
  let i = 0;
  while (i < html.length) {
    const abre = html.indexOf("<p", i);
    if (abre < 0) break;
    const fimDaAbertura = html.indexOf(">", abre);
    const fecha = html.indexOf("</p>", fimDaAbertura);
    verdade(fimDaAbertura > 0 && fecha > 0, `parágrafo sem fechamento no HTML da semente: ${html.slice(abre, abre + 60)}`);
    const abertura = html.slice(abre, fimDaAbertura + 1);
    const interno = html.slice(fimDaAbertura + 1, fecha);
    achados.push({
      texto: textoPuroDaMinutaHtml(interno),
      // O negrito pode ser `<b>` ou `<strong>`, e pode vir embrulhado noutra tag: o que não pode é
      // não haver negrito nenhum.
      negrito: /<(b|strong)\b/.test(interno),
      // Grafia tolerada de propósito: o saneamento devolve `text-align:right`, sem o espaço.
      aDireita: /text-align\s*:\s*right/i.test(abertura),
    });
    i = fecha + "</p>".length;
  }
  return achados;
}

// ── 1. A SEMENTE APLICA A HEURÍSTICA ────────────────────────────────────────────────────────

teste("A SEMENTE nasce com o negrito do título e com a data e o fecho à direita", () => {
  const paragrafos = paragrafosDaSemente(htmlDaMinutaDoTextoPuro(TEXTO_COM_TITULO));
  igual(paragrafos.length, 6, "a semente perdeu ou inventou parágrafo: ");

  const negritados = paragrafos.filter((p) => p.negrito).map((p) => p.texto);
  igual(negritados, ["I — DOS FATOS", "II — DO DIREITO"], "os títulos que saem em negrito na semente: ");

  const aDireita = paragrafos.filter((p) => p.aDireita).map((p) => p.texto);
  igual(aDireita, ["Goiânia, 23 de setembro de 2026.", "Termos em que pede deferimento."], "o que sai à direita na semente: ");

  // E o parágrafo comum não ganha nem um nem outro — a semente não enfeita o que a heurística não
  // adivinha.
  const comum = paragrafos.find((p) => p.texto.startsWith("O autor contratou"));
  verdade(!!comum, "o parágrafo comum desapareceu da semente");
  verdade(!comum!.negrito, "parágrafo comum saiu em negrito");
  verdade(!comum!.aDireita, "parágrafo comum saiu alinhado à direita");
});

teste("A SEMENTE de um texto SEM título nenhum não inventa negrito", () => {
  const paragrafos = paragrafosDaSemente(htmlDaMinutaDoTextoPuro(TEXTO_SEM_TITULO));
  igual(paragrafos.filter((p) => p.negrito).length, 0, "a semente inventou negrito onde não há título: ");
  igual(paragrafos.filter((p) => p.aDireita).map((p) => p.texto), ["Termos em que pede deferimento."], "o último parágrafo é o único à direita: ");
});

teste("TÍTULO QUE TAMBÉM É O ÚLTIMO PARÁGRAFO sai em negrito, e NÃO à direita — a ordem das duas regras", () => {
  // A ordem entre as duas regras mora dentro de `papelDoParagrafoDaMinuta` justamente para os dois
  // lados não a aplicarem em ordens diferentes.
  const paragrafos = paragrafosDaSemente(htmlDaMinutaDoTextoPuro("Do exposto, requer.\n\nIII — DOS PEDIDOS"));
  const ultimo = paragrafos[paragrafos.length - 1];
  igual(ultimo.texto, "III — DOS PEDIDOS");
  verdade(ultimo.negrito, "o título que é o último parágrafo perdeu o negrito");
  verdade(!ultimo.aDireita, "o título que é o último parágrafo ganhou alinhamento à direita — a ordem das regras inverteu");
});

// ── O SANEAMENTO, QUE É POR ONDE A SEMENTE DE VERDADE PASSA ──────────────────────────────────

teste("O NEGRITO e o TEXT-ALIGN da semente SOBREVIVEM ao saneamento do servidor", () => {
  // `htmlParaAbrirAFolha` saneia as duas saídas. Se `<b>` ou `text-align` não estivessem nas listas
  // aceitas (`TAGS_DA_MINUTA` / `ESTILOS_DA_MINUTA`), a semente nasceria e morreria na mesma linha —
  // a heurística voltaria a ser invisível, agora sem nem o Word para aplicá-la. Mesmo raciocínio do
  // caso que confere cada estilo que o editor produz.
  const aberto = htmlParaAbrirAFolha(null, TEXTO_COM_TITULO);
  const paragrafos = paragrafosDaSemente(aberto);
  igual(paragrafos.filter((p) => p.negrito).map((p) => p.texto), ["I — DOS FATOS", "II — DO DIREITO"], "o saneamento comeu o negrito da semente: ");
  igual(
    paragrafos.filter((p) => p.aDireita).map((p) => p.texto),
    ["Goiânia, 23 de setembro de 2026.", "Termos em que pede deferimento."],
    "o saneamento comeu o alinhamento à direita da semente: ",
  );
  // E a lista de estilos aceitos de fato contém `text-align` — a contraprova direta, isolada do
  // resto da semente.
  verdade(/text-align\s*:\s*right/i.test(sanitizarMinutaHtml('<p style="text-align: right">x</p>')), "text-align: right não sobrevive a sanitizarMinutaHtml");
  verdade(sanitizarMinutaHtml("<p><b>x</b></p>").includes("<b>"), "<b> não sobrevive a sanitizarMinutaHtml");
});

// ── 2. `minutaTexto` NÃO MUDA EM NADA ───────────────────────────────────────────────────────

teste("IDA E VOLTA byte a byte, com e sem título, antes e depois do saneamento", () => {
  const casos = [
    TEXTO_COM_TITULO,
    TEXTO_SEM_TITULO,
    "Único parágrafo.",
    "SÓ UM TÍTULO",
    "I — DOS FATOS\n\nCom & sinais < perigosos > e \"aspas\".\n\nArt. 5º, caput — dois  espaços de propósito.",
    "Goiânia, 23 de setembro de 2026.",
    "Um\r\n\r\n\r\nDois   \nTrês",
  ];
  for (const texto of casos) {
    const normal = normalizarTextoPuroDaMinuta(texto);
    const semente = htmlDaMinutaDoTextoPuro(texto);
    igual(textoPuroDaMinutaHtml(semente), normal, `a semente mudou o corpo (${JSON.stringify(texto.slice(0, 30))}…): `);
    igual(textoPuroDaMinutaHtml(sanitizarMinutaHtml(semente)), normal, `a semente saneada mudou o corpo (${JSON.stringify(texto.slice(0, 30))}…): `);
    igual(textoPuroDaMinutaHtml(htmlParaAbrirAFolha(null, texto)), normal, `abrir a folha mudou o corpo (${JSON.stringify(texto.slice(0, 30))}…): `);
  }
});

teste("O HASH DA CITAÇÃO não muda por a semente ter ganhado negrito e alinhamento", () => {
  // O caso real: o advogado já marcou "li e revisei" em cada citação. Se a semente mudasse o texto
  // puro, TODA confirmação já dada seria invalidada de uma vez, em silêncio.
  //
  // O SEGUNDO corpo carrega `&`, `<` e `"` DENTRO da citação de propósito. `normalizarTextoCitacao`
  // colapsa espaço em branco, então um hash só com letras e quebras não acusaria a semente deixar
  // de ESCAPAR o texto — e deixar de escapar é justamente o defeito que reescreveria o corpo.
  const corpos = [
    normalizarTextoPuroDaMinuta(TEXTO_COM_TITULO),
    'I — DO DIREITO\n\nConforme o STJ, REsp 1.874.782/SP (Tema 990) & a Súmula 608, "plano < seguro" para o rol.\n\nTermos em que pede deferimento.',
  ];
  for (const corpo of corpos) {
    const antes = hashDeTexto(corpo);
    // OS DOIS CAMINHOS, e os dois importam. `htmlParaAbrirAFolha` SANEIA, e o saneamento remenda
    // texto mal escapado — então um hash medido só ali daria por boa uma semente que deixou de
    // escapar. A semente CRUA é medida junto, porque é ela que tem de sair certa.
    for (const [oQue, derivado] of [
      ["a semente crua", textoPuroDaMinutaHtml(htmlDaMinutaDoTextoPuro(corpo))],
      ["a folha aberta (semente saneada)", textoPuroDaMinutaHtml(htmlParaAbrirAFolha(null, corpo))],
    ] as const) {
      igual(hashDeTexto(garantirFecho(derivado)), antes, `a identidade da citação mudou em ${oQue} (${JSON.stringify(corpo.slice(0, 25))}…): `);
      // E a citação continua ENCONTRÁVEL no corpo derivado — hash igual não basta se a busca por
      // trecho deixar de casar.
      verdade(
        normalizarTextoCitacao(derivado).includes(normalizarTextoCitacao("REsp 1.874.782/SP (Tema 990)")),
        `a citação deixou de ser encontrável em ${oQue} (${JSON.stringify(corpo.slice(0, 25))}…)`,
      );
    }
  }
});

// ── 3. O FECHO CONTINUA CONFERÍVEL ──────────────────────────────────────────────────────────

teste("O FECHO continua conferível sobre o texto puro da semente — inclusive à direita", () => {
  const texto = normalizarTextoPuroDaMinuta(TEXTO_COM_TITULO);
  const derivado = textoPuroDaMinutaHtml(htmlParaAbrirAFolha(null, texto));
  igual(garantirFecho(derivado), derivado, "garantirFecho quis mexer num fecho que já está certo depois da semente: ");
  // E a variação errada continua sendo corrigida — mesmo com o parágrafo à direita.
  const torto = "Requer.\n\nTermos em que, pede deferimento.";
  verdade(
    garantirFecho(textoPuroDaMinutaHtml(htmlParaAbrirAFolha(null, torto))).endsWith("Termos em que pede deferimento."),
    "a variação com vírgula deixou de ser corrigida depois da semente",
  );
});

// ── 4 e 5. O WORD ANTIGO E A SESSÃO QUE JÁ TEM FORMATAÇÃO ───────────────────────────────────

const meta: MetadadosPeticaoDocx = {
  confirmadoPorNome: "Camila Prado",
  confirmadoPorOab: "GO 34.221",
  confirmadoEm: new Date(2026, 8, 23, 10, 0),
  sessaoId: "b71c22aa",
};

const dadosBase: DadosPeticaoDocx = {
  notaObrigatoriaTexto: ["MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA", "Este documento é um rascunho..."].join("\n"),
  notaRiscos: [],
  corpoMinuta: normalizarTextoPuroDaMinuta(TEXTO_COM_TITULO),
  tituloPeca: "Réplica — Processo nº 123",
};

function documentXml(dados: DadosPeticaoDocx): string {
  const arquivo = new PizZip(montarPeticaoWord(dados, meta, null)).file("word/document.xml");
  verdade(!!arquivo, "word/document.xml deveria existir no .docx gerado");
  return arquivo!.asText();
}

/**
 * O corpo da peça, sem as caixas de nota — cortado no fim da caixa da nota obrigatória, ancorado no
 * TEXTO dela. Cortar pelo "último `</w:tbl>`" fecharia fora justamente o que se quer examinar.
 */
function corpoDaPeca(xml: string): string {
  const naNota = xml.indexOf("MINUTA GERADA POR IA");
  verdade(naNota > 0, "a caixa da nota obrigatória não foi encontrada — o corte do corpo estaria cego");
  const fimDaNota = xml.indexOf("</w:tbl>", naNota);
  verdade(fimDaNota > 0, "a caixa da nota obrigatória não fecha — o corte do corpo estaria cego");
  return xml.slice(fimDaNota + "</w:tbl>".length);
}

type ParagrafoDoWord = { texto: string; negrito: boolean; alinhamento: string };

/** Cada `<w:p>` do trecho, lido até o PRÓPRIO `</w:p>` — nunca por janela de N caracteres. */
function paragrafosDoWord(xml: string): ParagrafoDoWord[] {
  const achados: ParagrafoDoWord[] = [];
  let i = 0;
  while (i < xml.length) {
    const abre = xml.indexOf("<w:p>", i);
    const abreComProps = xml.indexOf("<w:p ", i);
    const inicio = abre < 0 ? abreComProps : abreComProps < 0 ? abre : Math.min(abre, abreComProps);
    if (inicio < 0) break;
    const fecha = xml.indexOf("</w:p>", inicio);
    if (fecha < 0) break;
    const bloco = xml.slice(inicio, fecha);
    const texto = [...bloco.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
    if (texto.trim().length > 0) {
      achados.push({
        texto: texto.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'),
        negrito: bloco.includes("<w:b/>"),
        alinhamento: bloco.match(/<w:jc w:val="([a-z]+)"\/>/)?.[1] ?? "",
      });
    }
    i = fecha + "</w:p>".length;
  }
  return achados;
}

teste("O WORD de uma sessão SEM minutaFormatadaHtml continua saindo pelo caminho antigo, com a heurística", () => {
  // O caminho antigo é o que roda quando ninguém salvou a folha — a coluna segue nula. O que se
  // prova aqui é que ele NÃO passou a depender da semente e continua pondo negrito no título e
  // jogando data e fecho à direita.
  const corpo = corpoDaPeca(documentXml(dadosBase));
  const paragrafos = paragrafosDoWord(corpo);
  igual(paragrafos.filter((p) => p.negrito).map((p) => p.texto), ["I — DOS FATOS", "II — DO DIREITO"], "o negrito de título do caminho antigo: ");
  igual(
    paragrafos.filter((p) => p.alinhamento === "right").map((p) => p.texto),
    ["Goiânia, 23 de setembro de 2026.", "Termos em que pede deferimento."],
    "o alinhamento à direita do caminho antigo: ",
  );
  verdade(paragrafos.some((p) => p.alinhamento === "both"), "o caminho antigo parou de justificar o corpo");
  // E os três estados de "sem formatação" caem no MESMO arquivo, byte a byte.
  const referencia = documentXml(dadosBase);
  for (const html of [null, undefined, "", "   "]) {
    igual(documentXml({ ...dadosBase, corpoMinutaFormatadaHtml: html }) === referencia, true, `HTML ${JSON.stringify(html)} deveria cair no caminho antigo: `);
  }
});

teste("O WORD e a SEMENTE concordam: mesmos títulos em negrito, mesmos parágrafos à direita", () => {
  // A prova comportamental de que há UMA heurística. Se a semente deixasse de aplicá-la (ou a
  // aplicasse com outro corte), as duas listas divergiriam aqui — que é exatamente a divergência
  // muda que este módulo compartilhado existe para impedir.
  for (const texto of [TEXTO_COM_TITULO, TEXTO_SEM_TITULO, "Do exposto, requer.\n\nIII — DOS PEDIDOS"]) {
    const corpo = normalizarTextoPuroDaMinuta(texto);
    const noWord = paragrafosDoWord(corpoDaPeca(documentXml({ ...dadosBase, corpoMinuta: corpo })));
    const naSemente = paragrafosDaSemente(htmlDaMinutaDoTextoPuro(corpo));
    igual(
      naSemente.filter((p) => p.negrito).map((p) => p.texto),
      noWord.filter((p) => p.negrito).map((p) => p.texto),
      `tela e Word discordam sobre o que é título (${JSON.stringify(texto.slice(0, 25))}…): `,
    );
    igual(
      naSemente.filter((p) => p.aDireita).map((p) => p.texto),
      noWord.filter((p) => p.alinhamento === "right").map((p) => p.texto),
      `tela e Word discordam sobre o que vai à direita (${JSON.stringify(texto.slice(0, 25))}…): `,
    );
  }
});

teste("SESSÃO QUE JÁ TEM formatação gravada NÃO é tocada pela semente", () => {
  // A semente vale só para quem ainda não tem formatação. Se o advogado tirou o negrito do título na
  // folha e salvou, é a folha dele que abre — não a heurística de volta por cima.
  const gravado = "<p>I — DOS FATOS</p><p>Algo aconteceu.</p><p>Termos em que pede deferimento.</p>";
  const aberto = htmlParaAbrirAFolha(gravado, normalizarTextoPuroDaMinuta(TEXTO_COM_TITULO));
  verdade(!/<(b|strong)\b/.test(aberto), `a semente reinjetou negrito num HTML já gravado: ${aberto}`);
  verdade(!/text-align/i.test(aberto), `a semente reinjetou alinhamento num HTML já gravado: ${aberto}`);
  igual(textoPuroDaMinutaHtml(aberto), "I — DOS FATOS\n\nAlgo aconteceu.\n\nTermos em que pede deferimento.", "o HTML gravado deixou de ser o que abre: ");
});

// ── 6. UMA IMPLEMENTAÇÃO, NÃO DUAS ──────────────────────────────────────────────────────────
//
// Duas cópias divergiriam no primeiro dia em que alguém mexesse numa só, e a divergência seria
// MUDA. O caso comportamental acima pega a divergência DEPOIS de ela existir; os dois casos abaixo
// impedem a cópia de nascer.

/** Todo arquivo .ts/.tsx do produto — sem os testes, que citam a heurística de propósito. */
function fontesDoProduto(): string[] {
  const achados: string[] = [];
  const visitar = (pasta: string) => {
    for (const nome of readdirSync(pasta)) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) {
        if (caminho.endsWith(join("lib", "testes"))) continue;
        visitar(caminho);
      } else if (/\.tsx?$/.test(nome)) achados.push(caminho);
    }
  };
  for (const raiz of ["lib", "app", "components"]) visitar(join(RAIZ, raiz));
  return achados;
}

teste("HARD GATE: a heurística existe em UM arquivo só — duas cópias divergiriam em silêncio", () => {
  const fontes = fontesDoProduto();
  verdade(fontes.length > 100, `a varredura de fontes achou só ${fontes.length} arquivos — varredura cega`);

  // Cada marca é um pedaço da heurística que NÃO tem outro motivo para existir no produto: a
  // contagem de maiúsculas, o corte de 70% e o reconhecimento da data de Goiânia. Se uma delas
  // aparecer em dois arquivos, nasceu uma cópia.
  const marcas: [string, RegExp][] = [
    ["a contagem de letras em caixa alta", /\[\^A-ZÀ-Þ\]/],
    ["o corte de 70% de maiúsculas", /maiusculas\.length\s*\/\s*letras\.length\s*>\s*0\.7/],
    ["o reconhecimento da data de Goiânia", /\^goi\[aâ\]nia,/],
  ];
  for (const [oQue, marca] of marcas) {
    const onde = fontes.filter((f) => marca.test(codigoDe(readFileSync(f, "utf8")))).map((f) => f.slice(RAIZ.length + 1));
    igual(onde, ["lib/peticionamentoMinutaHeuristica.ts"], `${oQue} deveria existir em um arquivo só: `);
  }
});

teste("HARD GATE: os DOIS consumidores chamam a heurística compartilhada, e não uma própria", () => {
  const consumidores: [string, string][] = [
    ["lib/peticionamentoDocx.ts", "corpoDaMinuta"],
    ["lib/peticionamentoMinutaFormatada.ts", "htmlDaMinutaDoTextoPuro"],
  ];
  for (const [rel, funcao] of consumidores) {
    const fonte = readFileSync(join(RAIZ, rel), "utf8");
    const codigo = codigoDe(fonte);
    verdade(
      /import\s*\{[^}]*papelDoParagrafoDaMinuta[^}]*\}\s*from\s*"@\/lib\/peticionamentoMinutaHeuristica"/.test(codigo),
      `${rel} não importa a heurística compartilhada — ou ela voltou a ser escrita lá dentro`,
    );
    const corpo = corpoDaFuncao(fonte, funcao);
    verdade(corpo.length > 100, `corpoDaFuncao não achou ${funcao} em ${rel} (${corpo.length} caracteres) — varredura cega`);
    verdade(corpo.includes("papelDoParagrafoDaMinuta("), `${funcao} de ${rel} não decide o papel do parágrafo pela função única`);
  }
  // E o módulo compartilhado não importa NADA: lib/peticionamentoDocx.ts importa de
  // lib/peticionamentoDocxFormatado.ts, que importa de lib/peticionamentoMinutaFormatada.ts — uma
  // importação aqui abriria a porta para um ciclo entre os três.
  const HEURISTICA = codigoDe(readFileSync(join(RAIZ, "lib", "peticionamentoMinutaHeuristica.ts"), "utf8"));
  verdade(!/^\s*import\b/m.test(HEURISTICA), "o módulo da heurística passou a importar algo — risco de ciclo entre os três geradores");
});

teste("a heurística compartilhada decide o que sempre decidiu — os limites, um a um", () => {
  const pedidos = paragrafosDoTextoPuroDaMinuta("I — DOS FATOS\n\nAlgo.\n\nTermos em que pede deferimento.");
  igual(pedidos, ["I — DOS FATOS", "Algo.", "Termos em que pede deferimento."], "a divisão em parágrafos mudou: ");
  igual(papelDoParagrafoDaMinuta("I — DOS FATOS", pedidos), "titulo");
  igual(papelDoParagrafoDaMinuta("Algo.", pedidos), "corpo");
  igual(papelDoParagrafoDaMinuta("Termos em que pede deferimento.", pedidos), "direita");
  igual(papelDoParagrafoDaMinuta("Goiânia, 23 de setembro de 2026.", pedidos), "direita", "a data de Goiânia: ");
  igual(papelDoParagrafoDaMinuta("23 de setembro de 2026", pedidos), "direita", "a data sem cidade: ");
  // Parágrafo longo em caixa alta NÃO é título: o limite de 90 caracteres é o que impede um
  // parágrafo inteiro gritado de virar cabeçalho.
  igual(papelDoParagrafoDaMinuta("A".repeat(91), pedidos), "corpo", "parágrafo de 91 caracteres em caixa alta: ");
  igual(papelDoParagrafoDaMinuta("A".repeat(89), pedidos), "titulo", "parágrafo de 89 caracteres em caixa alta: ");
  // Só pontuação e número não é título (não há letra para contar).
  igual(papelDoParagrafoDaMinuta("1. 2. 3.", pedidos), "corpo", "linha sem letra nenhuma: ");
  // Metade em caixa alta fica abaixo do corte de 70%.
  igual(papelDoParagrafoDaMinuta("Dos FATOS e do direito", pedidos), "corpo", "abaixo do corte de 70%: ");
});

resumo("Peticionamento — a semente da folha nasce com a heurística de título e alinhamento");
