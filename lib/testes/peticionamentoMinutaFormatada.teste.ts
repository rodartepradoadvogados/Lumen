import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  htmlDaMinutaDoTextoPuro,
  htmlParaAbrirAFolha,
  normalizarTextoPuroDaMinuta,
  sanitizarMinutaHtml,
  textoPuroDaMinutaHtml,
} from "../peticionamentoMinutaFormatada";
import { PAGINA_A4, limitarMargem, larguraUtilMm, mmParaTwips } from "../peticionamentoPaginaA4";
import { garantirFecho } from "../peticionamentoFecho";
import { hashDeTexto } from "../peticionamentoCitacoes";

// ════════════════════════════════════════════════════════════════════════════════════════════
// A DERIVAÇÃO DE TEXTO PURO — a trava desta entrega inteira.
//
// `PeticionamentoSessao.minutaTexto` é texto PURO e quatro coisas dependem disso (fecho, citação,
// Word, "já existe minuta?"). A formatação ganhou coluna própria; o texto puro é DERIVADO do HTML
// por UMA função. Se essa função devolver HTML cru, ou perder a diferença entre `\n\n` e `\n`, as
// quatro quebram em silêncio — e é exatamente isso que os casos abaixo existem para não deixar
// passar.
// ════════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();

teste("parágrafo separado por \\n\\n e quebra simples por \\n — o contrato do Word", () => {
  const texto = textoPuroDaMinutaHtml("<p>Primeiro.</p><p>Segundo,<br>na mesma ideia.</p>");
  igual(texto, "Primeiro.\n\nSegundo,\nna mesma ideia.");
  // A divisão que lib/peticionamentoDocx.ts faz de verdade, refeita aqui: dois parágrafos, e o
  // segundo com uma quebra interna (que lá vira <w:br/>, não um parágrafo novo).
  igual(texto.split(/\n{2,}/).length, 2, "o Word montaria um número errado de parágrafos: ");
  igual(texto.split(/\n{2,}/)[1].split("\n").length, 2, "a quebra simples dentro do parágrafo sumiu: ");
});

teste("A DERIVAÇÃO NUNCA DEVOLVE HTML — nenhuma tag, nenhum atributo, nenhuma entidade solta", () => {
  const html =
    '<p style="text-align: justify; margin-left: 12.5mm">Excelentíssimo <b>Senhor</b> <i>Doutor</i> <span style="color: rgb(200, 0, 0)">Juiz</span></p>' +
    '<table><tbody><tr><td><u>moldura</u></td></tr></tbody></table>';
  const texto = textoPuroDaMinutaHtml(html);
  verdade(!/<[a-zA-Z/!]/.test(texto), `sobrou marcação no texto puro: ${JSON.stringify(texto)}`);
  verdade(!/&[a-zA-Z#][a-zA-Z0-9]*;/.test(texto), `sobrou entidade HTML no texto puro: ${JSON.stringify(texto)}`);
  verdade(!/\bstyle\b|\bmargin-left\b|\brgb\(/.test(texto), `vazou nome de estilo para o corpo da peça: ${JSON.stringify(texto)}`);
  // E o texto de verdade continua todo lá — tolerando a ordem e o espaçamento que a derivação usa.
  for (const palavra of ["Excelentíssimo", "Senhor", "Doutor", "Juiz", "moldura"]) {
    verdade(texto.includes(palavra), `a palavra "${palavra}" desapareceu do corpo`);
  }
});

teste("IDA E VOLTA: texto puro → HTML → texto puro devolve a MESMA string, byte a byte", () => {
  const casos = [
    "I — DOS FATOS\n\nO autor contratou o plano em 2019.\nA negativa veio em 2024.\n\nTermos em que pede deferimento.",
    "Único parágrafo.",
    "Com & sinais < perigosos > e \"aspas\".\n\nArt. 5º, caput — dois  espaços de propósito.",
    "REsp 1.874.782/SP (Tema 990)\n\nSúmula 608 do STJ\n\nTermos em que pede deferimento.",
  ];
  for (const texto of casos) {
    const volta = textoPuroDaMinutaHtml(htmlDaMinutaDoTextoPuro(texto));
    igual(volta, texto, `ida-e-volta mudou o corpo (${JSON.stringify(texto.slice(0, 30))}…): `);
  }
});

teste("IDA E VOLTA sobrevive ao SANEAMENTO do servidor — que é por onde o HTML de verdade passa", () => {
  const texto = "I — DOS FATOS\n\nPrimeiro fato.\nSegundo, na mesma ideia.\n\nTermos em que pede deferimento.";
  igual(textoPuroDaMinutaHtml(sanitizarMinutaHtml(htmlDaMinutaDoTextoPuro(texto))), texto);
});

teste("a forma normalizada é a única com ida-e-volta garantida, e ela é explícita", () => {
  igual(normalizarTextoPuroDaMinuta("a\r\nb"), "a\nb", "CRLF: ");
  igual(normalizarTextoPuroDaMinuta("a   \nb"), "a\nb", "espaço no fim da linha: ");
  igual(normalizarTextoPuroDaMinuta("a\n\n\n\n\nb"), "a\n\nb", "quebra tripla: ");
  igual(normalizarTextoPuroDaMinuta("\n\n  a  \n\n"), "a", "borda: ");
  // E a ida-e-volta vale sobre a forma normalizada de um texto que NÃO estava normalizado.
  const torto = "Um\r\n\r\n\r\nDois   \nTrês";
  const normal = normalizarTextoPuroDaMinuta(torto);
  igual(textoPuroDaMinutaHtml(htmlDaMinutaDoTextoPuro(torto)), normal);
});

teste("A CONFIRMAÇÃO DE CITAÇÃO SOBREVIVE a uma minuta antiga ser aberta no editor e salva sem edição", () => {
  // O caso real que a coluna nova existe para não estragar: `hashDeTexto` é a identidade da
  // citação e a trava do "li e revisei". Se abrir a folha e salvar mudasse o corpo, toda
  // confirmação já dada pelo advogado seria invalidada de uma vez.
  const corpo = "Conforme o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.\n\nTermos em que pede deferimento.";
  const antes = hashDeTexto(corpo);
  const depois = hashDeTexto(garantirFecho(textoPuroDaMinutaHtml(sanitizarMinutaHtml(htmlParaAbrirAFolha(null, corpo)))));
  igual(depois, antes, "a identidade da citação mudou só por passar pelo editor: ");
});

teste("O FECHO continua conferível depois da derivação — inclusive quando ele foi formatado", () => {
  const html = '<p>Do exposto, requer a procedência.</p><p style="text-align: right"><b>Termos em que pede deferimento.</b></p>';
  const texto = textoPuroDaMinutaHtml(html);
  igual(garantirFecho(texto), texto, "garantirFecho quis mexer num fecho que já está certo: ");
  // E a variação errada continua sendo corrigida depois de passar pelo editor.
  verdade(
    garantirFecho(textoPuroDaMinutaHtml("<p>Requer.</p><p>Termos em que, pede deferimento.</p>")).endsWith("Termos em que pede deferimento."),
    "a variação com vírgula deixou de ser corrigida quando vem do editor",
  );
});

teste("lista vira uma linha por item, e a lista inteira é um bloco só", () => {
  const texto = textoPuroDaMinutaHtml("<p>Requer:</p><ul><li>a citação do réu;</li><li>a produção de prova;</li></ul><p>Por fim.</p>");
  igual(texto, "Requer:\n\na citação do réu;\na produção de prova;\n\nPor fim.");
});

teste("sub-tópico aninhado não inventa parágrafo — continua uma linha por item", () => {
  const texto = textoPuroDaMinutaHtml("<ul><li>Pai<ul><li>Filho um</li><li>Filho dois</li></ul></li></ul>");
  igual(texto.split("\n\n").length, 1, "o aninhamento virou parágrafo separado: ");
  igual(texto, "Pai\nFilho um\nFilho dois");
});

teste("tabela: célula separada por tabulação, linha por quebra simples, sem coluna fantasma", () => {
  const texto = textoPuroDaMinutaHtml("<table><tbody><tr><td>Parcela</td><td>Valor</td></tr><tr><td>1</td><td>R$ 10,00</td></tr></tbody></table>");
  igual(texto, "Parcela\tValor\n1\tR$ 10,00");
  for (const linha of texto.split("\n")) igual(linha.split("\t").length, 2, "linha com número de colunas errado: ");
});

teste("moldura de uma célula só (linhas de tabela ao redor do texto) não deixa tabulação no corpo", () => {
  const texto = textoPuroDaMinutaHtml("<p>Antes.</p><table><tbody><tr><td>Trecho emoldurado.</td></tr></tbody></table><p>Depois.</p>");
  verdade(!texto.includes("\t"), `a moldura de uma célula deixou tabulação: ${JSON.stringify(texto)}`);
  igual(texto, "Antes.\n\nTrecho emoldurado.\n\nDepois.");
});

teste("parágrafo vazio, <br> solto e bloco aninhado não multiplicam quebras", () => {
  igual(textoPuroDaMinutaHtml("<p>Um</p><p><br></p><p>Dois</p>"), "Um\n\nDois");
  igual(textoPuroDaMinutaHtml("<div><p>Um</p><p>Dois</p></div>"), "Um\n\nDois");
  igual(textoPuroDaMinutaHtml("<p>Um<br><br>Dois</p>"), "Um\nDois");
  igual(textoPuroDaMinutaHtml(""), "");
  igual(textoPuroDaMinutaHtml("<p><br></p>"), "");
});

teste("entidade é decodificada, e quebra de linha do CÓDIGO-FONTE do HTML não inventa parágrafo", () => {
  igual(textoPuroDaMinutaHtml("<p>A &amp; B &lt;C&gt; &nbsp;D &#233; &sect;5&ordm;</p>"), "A & B <C>  D é §5º");
  igual(textoPuroDaMinutaHtml("<p>uma frase\n   partida no fonte</p>"), "uma frase partida no fonte");
});

teste("espaço DUPLO digitado sobrevive — colapsar espaço mudaria o corpo sem ninguém ter pedido", () => {
  verdade(textoPuroDaMinutaHtml("<p>Art.  5º</p>").includes("Art.  5º"), "o espaço duplo foi colapsado");
});

// ── SANEAMENTO ──────────────────────────────────────────────────────────────────────────────

teste("o saneamento tira script, manipulador de evento e estilo perigoso, e mantém o que o editor produz", () => {
  const limpo = sanitizarMinutaHtml(
    '<p onclick="roubar()" style="color: #cc0000; position: fixed; background: url(http://x/y)">oi</p>' +
      "<script>alert(1)</script><iframe src=\"http://x\"></iframe>" +
      '<table><tbody><tr><td colspan="2"><b>a</b><i>b</i><u>c</u></td></tr></tbody></table>' +
      '<ul style="list-style-type: lower-roman"><li style="margin-left: 12.5mm">x</li></ul>',
  );
  for (const proibido of ["script", "iframe", "onclick", "position", "url("]) {
    verdade(!limpo.includes(proibido), `o saneamento deixou passar "${proibido}": ${limpo}`);
  }
  for (const mantido of ["color", "<b>", "<i>", "<u>", "<table>", 'colspan="2"', "list-style-type", "margin-left"]) {
    verdade(limpo.includes(mantido), `o saneamento comeu "${mantido}", que o editor produz: ${limpo}`);
  }
  verdade(!limpo.includes("alert(1)"), "o conteúdo do <script> sobreviveu como texto");
});

teste("o saneamento nunca perde o TEXTO, mesmo removendo a tag que o embrulhava", () => {
  const limpo = sanitizarMinutaHtml('<section><p>Fato relevante</p></section><a href="http://x">link</a>');
  verdade(limpo.includes("Fato relevante"), "texto dentro de tag não permitida foi descartado");
  verdade(limpo.includes("link"), "texto de <a> foi descartado junto com a tag");
  verdade(!limpo.includes("href"), "o href sobreviveu");
});

// ── A FOLHA ─────────────────────────────────────────────────────────────────────────────────

teste("htmlParaAbrirAFolha: o gravado tem prioridade; sem ele, semeia do texto puro; sem nada, vazio", () => {
  igual(htmlParaAbrirAFolha("<p>gravado</p>", "texto"), "<p>gravado</p>");
  igual(htmlParaAbrirAFolha(null, "Um\n\nDois"), "<p>Um</p><p>Dois</p>");
  igual(htmlParaAbrirAFolha("   ", "Um"), "<p>Um</p>", "HTML só com espaço deveria contar como ausente: ");
  igual(htmlParaAbrirAFolha(null, null), "");
});

teste("a geometria A4 é uma só, em milímetro, e o .docx a converte em vez de repeti-la", () => {
  igual([PAGINA_A4.larguraMm, PAGINA_A4.alturaMm], [210, 297]);
  igual(mmParaTwips(PAGINA_A4.larguraMm), 11906, "largura A4 em twip: ");
  igual(mmParaTwips(PAGINA_A4.alturaMm), 16838, "altura A4 em twip: ");
  igual(larguraUtilMm(PAGINA_A4.margens), 160, "área de texto entre as margens: ");
  // A margem nunca pode comer a folha até a área de texto virar zero.
  verdade(limitarMargem(500, 20) < PAGINA_A4.larguraMm - 20, "margem absurda não foi limitada");
  verdade(limitarMargem(-90, 20) > 0, "margem negativa não foi limitada");
  verdade(limitarMargem(Number.NaN, 20) > 0, "margem inválida virou NaN em vez de cair no mínimo");
  const FONTE_DOCX = readFileSync(join(RAIZ, "lib", "peticionamentoDocx.ts"), "utf8");
  const codigo = codigoDe(FONTE_DOCX);
  verdade(codigo.includes("mmParaTwips(PAGINA_A4."), "o .docx voltou a escrever a página à mão em vez de importar a geometria");
  verdade(!/w:w="11906"/.test(codigo), "a medida A4 voltou a ser literal no .docx — duas cópias da mesma régua");
});

// ── VARREDURA: a gravação NÃO pode receber o texto puro pronto da tela ──────────────────────
//
// A regra de verdade desta entrega, e a única que impede as duas representações de divergirem:
// quem grava recebe SÓ o HTML e DERIVA o texto puro. A varredura lê o corpo da função com
// `corpoDaFuncao` (delimitação por chave na indentação do cabeçalho, nunca janela de N
// caracteres, que escorregaria para a função vizinha) e `codigoDe` (sem comentário, que citaria
// a trava e passaria verde sozinho).

teste("HARD GATE: a gravação do corpo deriva o texto puro do HTML — nunca recebe os dois", () => {
  const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "atualizarCorpoDaMinuta"));
  verdade(corpo.length > 200, `corpoDaFuncao não achou atualizarCorpoDaMinuta (${corpo.length} caracteres) — varredura cega`);

  const assinatura = FONTE_ACOES.match(/export async function atualizarCorpoDaMinuta\(([^)]*)\)/);
  verdade(!!assinatura, "a assinatura de atualizarCorpoDaMinuta não foi encontrada");
  const parametros = assinatura![1].split(",").map((p) => p.trim()).filter(Boolean);
  igual(parametros.length, 2, `a ação deveria receber a sessão e o HTML, e nada mais — recebeu ${assinatura![1]}: `);
  verdade(
    /html/i.test(parametros[1]),
    `o segundo parâmetro deveria ser o HTML da folha, e é "${parametros[1]}" — se a tela passar o texto puro em paralelo, as duas representações divergem`,
  );

  const idxDerivar = corpo.indexOf("textoPuroDaMinutaHtml(");
  const idxSanear = corpo.indexOf("sanitizarMinutaHtml(");
  const idxGravar = corpo.indexOf("minutaTexto:");
  verdade(idxSanear !== -1, "a gravação não saneia o HTML que chegou do navegador");
  verdade(idxDerivar !== -1, "a gravação não deriva o texto puro do HTML — é a função única que sustenta o contrato do schema");
  verdade(idxSanear < idxDerivar, "sanear DEPOIS de derivar não saneia nada do que foi derivado");
  verdade(idxDerivar < idxGravar, "derivar depois de gravar não deriva nada");
  verdade(corpo.includes("garantirFecho("), "a gravação perdeu a reconferência do fecho");
  verdade(corpo.includes("minutaFormatadaHtml:"), "a gravação não guarda a formatação — a folha abriria sempre sem ela");
});

teste("HARD GATE: gerar de novo apaga a formatação antiga — senão a folha descreve um texto que não existe mais", () => {
  const FONTE_GERACAO = readFileSync(join(RAIZ, "lib", "peticionamentoGeracaoAssincrona.ts"), "utf8");
  const codigo = codigoDe(FONTE_GERACAO);
  const idxTexto = codigo.indexOf("minutaTexto:");
  const idxHtml = codigo.indexOf("minutaFormatadaHtml: null");
  verdade(idxTexto !== -1, "a gravação da minuta gerada não foi encontrada — varredura cega");
  verdade(
    idxHtml !== -1,
    "gerar de novo troca minutaTexto e NÃO zera minutaFormatadaHtml: a tela mostraria a minuta anterior por cima do corpo novo",
  );
});

teste("HARD GATE: nenhuma outra gravação de minutaFormatadaHtml aparece sem a derivação por perto", () => {
  // Se um terceiro lugar passar a gravar a formatação, ele cai aqui — do mesmo jeito que o gate de
  // `minutaTexto` em peticionamentoHardGates.teste.ts pega um terceiro escritor do corpo.
  const arquivos = ["lib/actions/peticionamento.ts", "lib/peticionamentoGeracaoAssincrona.ts", "lib/peticionamentoCitacoesSync.ts"];
  let vistos = 0;
  for (const rel of arquivos) {
    const codigo = codigoDe(readFileSync(join(RAIZ, rel), "utf8"));
    for (const trecho of codigo.split("minutaFormatadaHtml:").slice(1)) {
      vistos++;
      const valor = trecho.slice(0, 40);
      verdade(
        /^\s*(null|htmlLimpo)\b/.test(valor),
        `gravação de minutaFormatadaHtml com valor inesperado (${valor.trim().slice(0, 30)}) — todo HTML gravado tem de ser o saneado, e todo apagamento tem de ser null`,
      );
    }
  }
  verdade(vistos >= 2, `esperava ao menos 2 gravações de minutaFormatadaHtml (edição e regeração), achei ${vistos} — a varredura parou de achar o que guarda`);
});

// ── A TELA ──────────────────────────────────────────────────────────────────────────────────

teste("a tela abre a folha por htmlParaAbrirAFolha e NÃO manda mais o texto puro para o cliente", () => {
  const PAGINA = codigoDe(readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "minuta", "page.tsx"), "utf8"));
  verdade(PAGINA.includes("htmlParaAbrirAFolha("), "a página não usa o resolvedor único do HTML da folha");
  verdade(!/corpoInicial=/.test(PAGINA), "a página voltou a entregar o texto puro à tela, em paralelo ao HTML");
  const CLIENTE = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "MinutaClient.tsx"), "utf8"));
  verdade(CLIENTE.includes("<MinutaEditor"), "a tela de minuta não usa mais o editor de folha A4");
  verdade(!/<textarea/.test(CLIENTE), "a caixa de texto crua voltou — a folha A4 deixou de ser o editor");
  verdade(/atualizarCorpoDaMinuta\(\s*sessaoId\s*,\s*corpo\s*\)/.test(CLIENTE), "a tela deveria gravar o HTML da folha, e só ele");
});

teste("A FOLHA E A BARRA EXISTEM, e cada item pedido pelo dono tem um comando de verdade atrás", () => {
  const FONTE = readFileSync(join(RAIZ, "components", "peticionamento", "MinutaEditor.tsx"), "utf8");
  const codigo = codigoDe(FONTE);
  verdade(codigo.includes("contentEditable"), "o corpo da folha não é editável");
  verdade(codigo.includes("PAGINA_A4"), "a folha não usa a geometria A4 compartilhada — a medida foi escrita de novo à mão");

  // Cada pedido → o que de fato o executa. A asserção olha o MECANISMO, não o rótulo: rótulo
  // sozinho passaria verde com um botão que não faz nada.
  const exigidos: [string, RegExp][] = [
    ["negrito", /execCommand|comandar\("bold"\)/],
    ["itálico", /comandar\("italic"\)/],
    ["sublinhado", /comandar\("underline"\)/],
    ["tópicos em formas", /insertUnorderedList/],
    ["tópicos em números", /insertOrderedList/],
    ["formato dos tópicos", /listStyleType/],
    ["sub-tópico", /appendChild\(bloco\)|aumentarNivel/],
    ["justificar", /textAlign = "justify"/],
    ["alinhar à esquerda", /textAlign = "left"/],
    ["centralizar", /textAlign = "center"/],
    ["alinhar à direita", /textAlign = "right"/],
    ["cor da letra", /foreColor/],
    ["cor do fundo", /hiliteColor/],
    ["linhas ao redor do texto", /<table><tbody><tr><td>/],
    ["tabela com linhas e colunas editáveis", /linhasNovaTabela[\s\S]*colunasNovaTabela/],
    ["régua: recuo de primeira linha", /textIndent/],
    ["régua: recuo à esquerda", /marginLeft/],
    ["régua: recuo à direita", /marginRight/],
    ["régua: margem da folha", /limitarMargem\(/],
  ];
  const faltando = exigidos.filter(([, mecanismo]) => !mecanismo.test(codigo)).map(([nome]) => nome);
  igual(faltando, [], "itens pedidos pelo dono sem mecanismo atrás: ");

  // O estilo que o editor produz tem de CABER na lista aceita pelo saneamento do servidor —
  // senão o advogado formata, o servidor limpa, e a formatação some sem aviso.
  const estilosUsados = ["text-align", "text-indent", "margin-left", "margin-right", "list-style-type", "color", "background-color"];
  for (const estilo of estilosUsados) {
    const html = sanitizarMinutaHtml(`<p style="${estilo}: ${estilo.includes("color") ? "#112233" : estilo === "text-align" ? "justify" : estilo === "list-style-type" ? "lower-roman" : "12.5mm"}">x</p>`);
    verdade(html.includes(estilo), `o editor produz ${estilo} e o saneamento do servidor o descarta — a formatação sumiria em silêncio`);
  }
});

teste("a régua e a folha estão no CSS da aba, com token e sem hex cru", () => {
  const CSS = readFileSync(join(RAIZ, "app", "peticionamento", "peticionamento.css"), "utf8");
  const i = CSS.indexOf("EDITOR DE MINUTA");
  verdade(i > 0, "o bloco de CSS do editor de minuta não existe");
  const bloco = CSS.slice(i);
  for (const regra of [".minuta-regua", ".minuta-folha", ".minuta-barra", ".minuta-alca", ".minuta-corpo table"]) {
    verdade(bloco.includes(regra), `o CSS perdeu a regra ${regra}`);
  }
  verdade(/width:\s*210mm/.test(bloco), "a folha deixou de ter a largura A4");
  verdade(/min-height:\s*297mm/.test(bloco), "a folha deixou de ter a altura A4");
  const semComentario = bloco.replace(/\/\*[\s\S]*?\*\//g, "");
  const hex = semComentario.match(/#[0-9a-fA-F]{3,8}\b/g);
  igual(hex, null, "hex cru no CSS do editor (a paleta da aba é só var(--token), e é ela que dá o modo claro): ");
});

resumo("Peticionamento — folha A4, régua e derivação de texto puro da minuta");
