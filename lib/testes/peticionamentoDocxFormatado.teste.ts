import { readFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { montarPeticaoWord, type DadosPeticaoDocx, type MetadadosPeticaoDocx } from "@/lib/peticionamentoDocx";
import { corpoDocxDoHtmlDaMinuta } from "@/lib/peticionamentoDocxFormatado";
import { htmlDaMinutaDoTextoPuro, textoPuroDaMinutaHtml } from "@/lib/peticionamentoMinutaFormatada";
import { mmParaTwips } from "@/lib/peticionamentoPaginaA4";
import { garantirFecho } from "@/lib/peticionamentoFecho";
import { hashDeTexto, normalizarTextoCitacao } from "@/lib/peticionamentoCitacoes";

// ════════════════════════════════════════════════════════════════════════════════════════════
// A FORMATAÇÃO VIAJANDO PARA O WORD — e as três coisas que esta entrega NÃO podia mexer.
//
// A etapa A deu à minuta uma folha A4 com barra de formatação; o .docx continuava saindo do texto
// puro, sem negrito, sem cor, sem lista, sem tabela. Aqui se prova que a formatação chega ao
// arquivo — e, no mesmo arquivo de teste, que as travas que não são aparência continuam de pé:
//
//   1. O CAMINHO ANTIGO (sem `minutaFormatadaHtml`, sessão anterior ao editor) sai igual ao de
//      antes. Se ele mudar, minuta velha exporta diferente sem ninguém ter pedido.
//   2. O HASH DAS CITAÇÕES não muda. Ele é a trava do "li e revisei": se mudar, toda confirmação
//      que o advogado já deu é invalidada em silêncio.
//   3. O FECHO continua conferido sobre o TEXTO PURO, e o .docx nunca sai sem ele.
//
// E uma disciplina de método: as asserções olham o MECANISMO (o elemento OOXML que produz o
// efeito), não o rótulo nem uma grafia só. `<w:b/>` pode vir antes ou depois de `<w:i/>`; o que não
// pode é não haver negrito nenhum.
// ════════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();

const meta: MetadadosPeticaoDocx = {
  confirmadoPorNome: "Camila Prado",
  confirmadoPorOab: "GO 34.221",
  confirmadoEm: new Date(2026, 8, 23, 10, 0),
  sessaoId: "b71c22aa",
};

const dadosBase: DadosPeticaoDocx = {
  notaObrigatoriaTexto: ["MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA", "Este documento é um rascunho..."].join("\n"),
  notaRiscos: [],
  corpoMinuta: "DOS FATOS\n\nAlgo aconteceu.\n\nGoiânia, 23 de setembro de 2026.\n\nTermos em que pede deferimento.",
  tituloPeca: "Réplica — Processo nº 123",
};

function parte(buffer: Buffer, caminho: string): string | null {
  const arquivo = new PizZip(buffer).file(caminho);
  return arquivo ? arquivo.asText() : null;
}

function exigirParte(buffer: Buffer, caminho: string): string {
  const xml = parte(buffer, caminho);
  verdade(xml !== null, `${caminho} deveria existir no .docx gerado`);
  return xml!;
}

/** O .docx montado a partir de um HTML de folha — o caminho novo desta entrega. */
function docxDaFolha(html: string, timbrado?: Buffer): Buffer {
  return montarPeticaoWord({ ...dadosBase, corpoMinutaFormatadaHtml: html }, meta, timbrado ?? null);
}

/**
 * Só o corpo da peça — tudo depois da caixa da nota obrigatória.
 *
 * O corte é ANCORADO no texto da nota, e não no "último `</w:tbl>` do arquivo": a peça pode ter
 * tabela própria (é o que esta entrega acrescenta), e cortar pelo último fecharia fora justamente o
 * que se quer examinar. Achar a nota é o que garante que o corte é o fim das notas.
 */
function corpoDaPeca(documentXml: string): string {
  const naNota = documentXml.indexOf("MINUTA GERADA POR IA");
  verdade(naNota > 0, "a caixa da nota obrigatória não foi encontrada — o corte do corpo estaria cego");
  const fimDaNota = documentXml.indexOf("</w:tbl>", naNota);
  verdade(fimDaNota > 0, "a caixa da nota obrigatória não fecha — o corte do corpo estaria cego");
  return documentXml.slice(fimDaNota + "</w:tbl>".length);
}

// ── XML DE VERDADE, NÃO SÓ `includes` ────────────────────────────────────────────────────────
//
// Um .docx é um zip, e um OOXML malformado passa em qualquer teste de `includes` — e o Word recusa
// abrir o arquivo. O conferidor abaixo é balanceado: pilha de tags, elemento vazio reconhecido, e
// texto fora de tag sem `<` cru nem `&` que não seja entidade. Sem dependência nova.

function conferirTexto(trecho: string, contexto: string): void {
  verdade(!trecho.includes("<"), `${contexto}: "<" cru no texto do XML`);
  for (const casa of trecho.matchAll(/&([^;\s]*);?/g)) {
    verdade(/^(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos)$/.test(casa[1]), `${contexto}: "&${casa[1]}" não é entidade válida em XML`);
  }
}

/**
 * A DEFINIÇÃO DE NÍVEL que o Word de fato usaria para um `<w:numPr>` — resolvida como ele resolve:
 * numId → abstractNumId → `<w:lvl>` daquele ilvl.
 *
 * Existe porque a asserção ingênua ("o primeiro `<w:lvl w:ilvl="1">` do arquivo") lê a definição de
 * OUTRA lista: um documento com lista simples e sub-tópico tem mais de uma definição, e a primeira
 * quase nunca é a que o item examinado aponta. Testar o caminho de resolução é testar o mecanismo.
 */
function nivelResolvido(numeracaoXml: string, numId: string, ilvl: number): string {
  const num = numeracaoXml.match(new RegExp(`<w:num w:numId="${numId}">[\\s\\S]*?</w:num>`))?.[0] ?? "";
  verdade(num !== "", `numId ${numId} não existe em numbering.xml`);
  const abstractNumId = num.match(/<w:abstractNumId w:val="(\d+)"\/>/)?.[1];
  verdade(!!abstractNumId, `numId ${numId} não aponta para nenhuma definição`);
  const abstrato = numeracaoXml.match(new RegExp(`<w:abstractNum w:abstractNumId="${abstractNumId}">[\\s\\S]*?</w:abstractNum>`))?.[0] ?? "";
  verdade(abstrato !== "", `a definição ${abstractNumId} não existe em numbering.xml`);
  const nivel = abstrato.match(new RegExp(`<w:lvl w:ilvl="${ilvl}">[\\s\\S]*?</w:lvl>`))?.[0] ?? "";
  verdade(nivel !== "", `a definição ${abstractNumId} não tem o nível ${ilvl} — o item sairia sem marcador`);
  return nivel;
}

/** Os pares (nível, numId) de cada item de lista do corpo, na ordem em que aparecem. */
function itensDeLista(documentXml: string): { nivel: string; numId: string }[] {
  return [...documentXml.matchAll(/<w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/g)].map((m) => ({ nivel: m[1], numId: m[2] }));
}

function conferirXmlBemFormado(xml: string, contexto: string): void {
  const pilha: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const abre = xml.indexOf("<", i);
    if (abre < 0) {
      conferirTexto(xml.slice(i), contexto);
      break;
    }
    if (abre > i) conferirTexto(xml.slice(i, abre), contexto);
    if (xml.startsWith("<?", abre)) {
      const fim = xml.indexOf("?>", abre);
      verdade(fim > 0, `${contexto}: declaração XML não fechada`);
      i = fim + 2;
      continue;
    }
    if (xml.startsWith("<!--", abre)) {
      const fim = xml.indexOf("-->", abre);
      verdade(fim > 0, `${contexto}: comentário não fechado`);
      i = fim + 3;
      continue;
    }
    const fecha = xml.indexOf(">", abre);
    verdade(fecha > 0, `${contexto}: tag não fechada perto de ${JSON.stringify(xml.slice(abre, abre + 40))}`);
    const rotulo = xml.slice(abre + 1, fecha);
    i = fecha + 1;
    if (rotulo.startsWith("/")) {
      const nome = rotulo.slice(1).trim();
      const topo = pilha.pop();
      verdade(topo === nome, `${contexto}: </${nome}> fecha <${topo ?? "nada"}>`);
      continue;
    }
    if (rotulo.endsWith("/")) continue;
    pilha.push(rotulo.split(/[\s]/)[0]);
  }
  igual(pilha, [], `${contexto}: tag aberta e nunca fechada: `);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// 1. O CAMINHO ANTIGO NÃO PODE MUDAR DE RESULTADO
// ════════════════════════════════════════════════════════════════════════════════════════════

teste("SEM minutaFormatadaHtml, o Word sai EXATAMENTE como saía — nada do caminho novo aparece", () => {
  const doc = exigirParte(montarPeticaoWord(dadosBase, meta, null), "word/document.xml");

  // As marcas do caminho do TEXTO PURO, uma a uma — é este comportamento que não pode ter mudado.
  verdade(doc.includes("DOS FATOS"), "o corpo do texto puro desapareceu");
  const trechoDoTitulo = doc.slice(doc.indexOf("DOS FATOS") - 400, doc.indexOf("DOS FATOS"));
  verdade(trechoDoTitulo.includes("<w:b/>"), "a heurística pareceTitulo parou de pôr o título em negrito no caminho antigo");
  verdade(doc.includes('<w:jc w:val="both"/>'), "o caminho antigo parou de justificar o corpo");
  verdade(doc.includes('<w:jc w:val="right"/>'), "o caminho antigo parou de alinhar a data/fecho à direita");
  // Espaço TOLERADO no meio do elemento de propósito: o caminho antigo monta `<w:spacing` com um
  // buraco onde `w:before` não aparece, e uma asserção presa a uma grafia só reprovaria a correção
  // desse buraco em vez do defeito.
  verdade(/<w:spacing\s+w:after="160"/.test(doc), "o espaçamento de parágrafo do caminho antigo mudou");

  // E NADA do caminho novo: nem numeração, nem sombreamento de letra, nem sublinhado.
  verdade(!doc.includes("<w:numPr>"), "o caminho antigo passou a emitir numeração de lista");
  verdade(!doc.includes("<w:u "), "o caminho antigo passou a emitir sublinhado");
  igual((doc.match(/<w:tbl>/g) ?? []).length, 1, "o caminho antigo deveria ter só a tabela da caixa da nota obrigatória: ");
});

teste("SEM minutaFormatadaHtml, o pacote NÃO ganha numbering.xml nem a relação dela", () => {
  const buffer = montarPeticaoWord(dadosBase, meta, null);
  igual(parte(buffer, "word/numbering.xml"), null, "numbering.xml apareceu num .docx sem lista nenhuma: ");
  const tipos = exigirParte(buffer, "[Content_Types].xml");
  const rels = exigirParte(buffer, "word/_rels/document.xml.rels");
  verdade(!tipos.includes("numbering.xml"), "[Content_Types].xml declarou uma parte que não existe no pacote");
  verdade(!rels.includes("numbering.xml"), "document.xml.rels apontou para uma parte que não existe no pacote");
});

teste("html ausente, nulo, vazio e só com espaço são o MESMO caminho antigo, byte a byte", () => {
  const referencia = exigirParte(montarPeticaoWord(dadosBase, meta, null), "word/document.xml");
  for (const html of [null, undefined, "", "   ", "\n\t "]) {
    const doc = exigirParte(montarPeticaoWord({ ...dadosBase, corpoMinutaFormatadaHtml: html }, meta, null), "word/document.xml");
    igual(doc === referencia, true, `HTML ${JSON.stringify(html)} deveria cair no caminho antigo e produzir o mesmo arquivo: `);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 2. O HASH DAS CITAÇÕES NÃO MUDA — a trava do "li e revisei"
// ════════════════════════════════════════════════════════════════════════════════════════════

teste("A IDENTIDADE DE CADA CITAÇÃO SOBREVIVE a esta entrega — hash igual, byte a byte", () => {
  // O caso real: o advogado já marcou "li e revisei" em cada citação. Se esta entrega mudasse a
  // forma do texto puro (ou fizesse o Word derivá-lo por outra regra), toda confirmação já dada
  // seria invalidada em silêncio, e ninguém veria acontecer.
  const corpo = "Conforme o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.\n\nSúmula 608 do STJ.\n\nTermos em que pede deferimento.";
  const antes = hashDeTexto(corpo);

  const html = htmlDaMinutaDoTextoPuro(corpo);
  const formatado = corpoDocxDoHtmlDaMinuta(html);
  igual(hashDeTexto(formatado.textoPuro), antes, "o texto puro que o gerador do Word usa deixou de casar com o da sessão: ");
  igual(formatado.textoPuro, textoPuroDaMinutaHtml(html), "o módulo do Word derivou texto puro por uma regra PRÓPRIA em vez da função única: ");

  // E com o texto DE FATO formatado na folha (negrito, cor, alinhamento, recuo) o hash é o mesmo:
  // aparência não entra na identidade da citação.
  const enfeitado =
    '<p style="text-align: justify; text-indent: 12.5mm">Conforme o <b>STJ</b>, <span style="color: #b91c1c">REsp 1.874.782/SP</span> (Tema 990), o pedido procede.</p>' +
    "<p><u>Súmula 608 do STJ</u>.</p><p><b>Termos em que pede deferimento.</b></p>";
  igual(hashDeTexto(corpoDocxDoHtmlDaMinuta(enfeitado).textoPuro), antes, "formatar a folha mudou a identidade das citações: ");
  igual(
    normalizarTextoCitacao(corpoDocxDoHtmlDaMinuta(enfeitado).textoPuro).includes(normalizarTextoCitacao("REsp 1.874.782/SP (Tema 990)")),
    true,
    "a citação deixou de ser ENCONTRÁVEL no corpo depois de formatada: ",
  );
});

teste("O FECHO continua conferido sobre o TEXTO PURO, e o .docx nunca sai sem ele", () => {
  // Folha que já termina no fecho: o fecho aparece UMA vez, ninguém acrescenta nada.
  const comFecho = docxDaFolha("<p>Requer a procedência.</p><p><b>Termos em que pede deferimento.</b></p>");
  const corpoComFecho = corpoDaPeca(exigirParte(comFecho, "word/document.xml"));
  igual((corpoComFecho.match(/Termos em que pede deferimento\./g) ?? []).length, 1, "o fecho foi duplicado numa folha que já o tinha: ");

  // Folha SEM fecho (o advogado apagou): o texto puro da sessão tem o fecho porque `garantirFecho`
  // o acrescentou na gravação — e o .docx não pode sair sem ele.
  const semFecho = "<p>Requer a procedência, e nada mais.</p>";
  igual(corpoDocxDoHtmlDaMinuta(semFecho).textoPuro.endsWith("Termos em que pede deferimento."), false, "o HTML de teste não deveria ter fecho: ");
  const corpoSemFecho = corpoDaPeca(exigirParte(docxDaFolha(semFecho), "word/document.xml"));
  verdade(corpoSemFecho.includes("Termos em que pede deferimento."), "HARD GATE: o .docx saiu de uma folha sem fecho e sem o fecho");

  // E `garantirFecho` continua sendo a régua, sobre o texto puro derivado — não sobre o HTML.
  igual(garantirFecho(corpoDocxDoHtmlDaMinuta(semFecho).textoPuro).endsWith("Termos em que pede deferimento."), true);
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 3. A FORMATAÇÃO CHEGA AO WORD — item por item do que a barra oferece
// ════════════════════════════════════════════════════════════════════════════════════════════

teste("negrito, itálico, sublinhado, riscado, sobrescrito e subscrito viram OOXML de verdade", () => {
  const doc = corpoDaPeca(
    exigirParte(
      docxDaFolha("<p><b>negrito</b> <i>itálico</i> <u>sublinhado</u> <s>riscado</s> m<sup>2</sup> H<sub>2</sub>O</p>"),
      "word/document.xml",
    ),
  );
  const exigidos: [string, RegExp][] = [
    ["negrito", /<w:b\/>/],
    ["itálico", /<w:i\/>/],
    ["sublinhado", /<w:u w:val="single"\/>/],
    ["riscado", /<w:strike\/>/],
    ["sobrescrito", /<w:vertAlign w:val="superscript"\/>/],
    ["subscrito", /<w:vertAlign w:val="subscript"\/>/],
  ];
  igual(exigidos.filter(([, r]) => !r.test(doc)).map(([n]) => n), [], "formatação da barra que não chegou ao Word: ");
  // E o texto todo continua lá — formatação que come palavra não serve de nada.
  for (const palavra of ["negrito", "itálico", "sublinhado", "riscado"]) verdade(doc.includes(palavra), `a palavra "${palavra}" desapareceu`);
});

teste("`<strong>`/`<em>` valem o mesmo que `<b>`/`<i>`, e a aparência é HERDADA pelo que está dentro", () => {
  const doc = corpoDaPeca(exigirParte(docxDaFolha("<p><strong>forte <em>e também itálico</em></strong></p>"), "word/document.xml"));
  // O trecho de dentro tem de sair negrito E itálico: o `<em>` está dentro do `<strong>`.
  const corridas = [...doc.matchAll(/<w:r>(.*?)<\/w:r>/g)].map((m) => m[1]);
  const aninhada = corridas.find((c) => c.includes("e também itálico"));
  verdade(!!aninhada, "a corrida aninhada não foi encontrada");
  verdade(/<w:b\/>/.test(aninhada!), "o negrito do <strong> não foi herdado pelo <em> de dentro");
  verdade(/<w:i\/>/.test(aninhada!), "o itálico do <em> não saiu");
});

teste("cor da letra vira <w:color>, e cor de fundo vira <w:shd> (não <w:highlight>) — a cor EXATA", () => {
  const doc = corpoDaPeca(
    exigirParte(
      docxDaFolha('<p><span style="color: #b91c1c">vermelha</span> <span style="background-color: rgb(255, 233, 168)">fundo</span></p>'),
      "word/document.xml",
    ),
  );
  verdade(/<w:color w:val="B91C1C"\/>/.test(doc), `a cor da letra não virou <w:color>: ${doc.slice(0, 400)}`);
  // `w:highlight` só aceita um punhado de nomes fixos; a barra dá hexadecimal arbitrário. Usar
  // highlight obrigaria a empurrar a cor do advogado para a "mais parecida" — aproximação silenciosa.
  verdade(/<w:shd w:val="clear" w:color="auto" w:fill="FFE9A8"\/>/.test(doc), `a cor do fundo não virou <w:shd> com a cor exata: ${doc.slice(0, 600)}`);
  verdade(!doc.includes("<w:highlight"), "a cor de fundo voltou a usar w:highlight, que quantiza a cor escolhida");
});

teste("os quatro alinhamentos da barra viram <w:jc>, com justificado escrito 'both'", () => {
  const html =
    '<p style="text-align: left">esquerda</p><p style="text-align: center">centro</p>' +
    '<p style="text-align: right">direita</p><p style="text-align: justify">justificado</p>';
  const doc = corpoDaPeca(exigirParte(docxDaFolha(html), "word/document.xml"));
  for (const jc of ["left", "center", "right", "both"]) {
    verdade(doc.includes(`<w:jc w:val="${jc}"/>`), `alinhamento ${jc} não chegou ao Word`);
  }
  verdade(!doc.includes('w:val="justify"'), "justify do CSS foi escrito cru no OOXML, que chama isso de 'both'");
});

teste("os TRÊS recuos viram <w:ind> em TWIPS, pela conversão única de lib/peticionamentoPaginaA4.ts", () => {
  const doc = corpoDaPeca(
    exigirParte(docxDaFolha('<p style="text-indent: 12.5mm; margin-left: 25mm; margin-right: 10mm">recuado</p>'), "word/document.xml"),
  );
  // Os números abaixo são LITERAIS de propósito, e não `mmParaTwips(...)`: 1440 twip por polegada é
  // constante do OOXML, então 25 mm são 1417 twips e 12,5 mm são 709, independentemente do que a
  // função desta casa devolva. Uma asserção escrita com a própria função sobreviveria a ela passar a
  // devolver milímetro — e o recuo sairia 57 vezes menor no Word sem nenhum teste reprovar.
  verdade(/w:left="1417"/.test(doc), `recuo à esquerda de 25 mm deveria ser 1417 twips: ${doc.slice(0, 400)}`);
  verdade(/w:right="567"/.test(doc), `recuo à direita de 10 mm deveria ser 567 twips: ${doc.slice(0, 400)}`);
  verdade(/w:firstLine="709"/.test(doc), `recuo de primeira linha de 12,5 mm deveria ser 709 twips: ${doc.slice(0, 400)}`);
  // E a função da casa concorda com esses números — se ela divergir, os dois lados caem juntos.
  igual([mmParaTwips(25), mmParaTwips(10), mmParaTwips(12.5)], [1417, 567, 709], "a conversão de mm para twip mudou de resultado: ");
});

teste("recuo NEGATIVO de primeira linha (parágrafo pendente) vira w:hanging — OOXML não tem firstLine negativo", () => {
  const doc = corpoDaPeca(exigirParte(docxDaFolha('<p style="text-indent: -10mm">pendente</p>'), "word/document.xml"));
  verdade(/w:hanging="567"/.test(doc), `o recuo pendente não virou w:hanging: ${doc.slice(0, 400)}`);
  verdade(!/w:firstLine="-/.test(doc), "saiu firstLine negativo, que o Word não aceita");
});

// ── LISTA: numbering.xml, os oito formatos e o sub-tópico ───────────────────────────────────

const FORMATOS_ESPERADOS: [string, string, string][] = [
  // [list-style-type da setinha, tag, numFmt do OOXML]
  ["disc", "ul", "bullet"],
  ["circle", "ul", "bullet"],
  ["square", "ul", "bullet"],
  ["decimal", "ol", "decimal"],
  ["lower-alpha", "ol", "lowerLetter"],
  ["upper-alpha", "ol", "upperLetter"],
  ["lower-roman", "ol", "lowerRoman"],
  ["upper-roman", "ol", "upperRoman"],
];

teste("OS OITO FORMATOS da setinha têm numFmt próprio no numbering.xml — nenhum cai no de outro", () => {
  for (const [estilo, tag, numFmt] of FORMATOS_ESPERADOS) {
    const buffer = docxDaFolha(`<${tag} style="list-style-type: ${estilo}"><li>um</li><li>dois</li></${tag}>`);
    const numeracao = exigirParte(buffer, "word/numbering.xml");
    verdade(numeracao.includes(`<w:numFmt w:val="${numFmt}"/>`), `o formato "${estilo}" não virou numFmt ${numFmt}: ${numeracao.slice(0, 300)}`);
    const doc = exigirParte(buffer, "word/document.xml");
    igual((doc.match(/<w:numPr>/g) ?? []).length, 2, `os dois itens de "${estilo}" deveriam ter numeração: `);
  }
  // As TRÊS bolinhas são bullet, mas com marcador DIFERENTE — senão "◦ bolinha vazia" e
  // "▪ quadradinho" sairiam iguais à bolinha cheia e a setinha não serviria para nada.
  const marcadores = FORMATOS_ESPERADOS.filter(([, , f]) => f === "bullet").map(([estilo]) => {
    const numeracao = exigirParte(docxDaFolha(`<ul style="list-style-type: ${estilo}"><li>x</li></ul>`), "word/numbering.xml");
    return (numeracao.match(/<w:lvlText w:val="([^"]*)"\/>/) ?? [])[1];
  });
  igual(new Set(marcadores).size, marcadores.length, `as três bolinhas saíram com o mesmo marcador (${marcadores.join(" / ")}): `);
});

teste("SUB-TÓPICO ANINHADO sai no nível 2, com o formato do nível de baixo valendo só ali", () => {
  const buffer = docxDaFolha(
    '<ul style="list-style-type: disc"><li>Pai<ol style="list-style-type: lower-alpha"><li>Filho um</li><li>Filho dois</li></ol></li></ul>',
  );
  const doc = exigirParte(buffer, "word/document.xml");
  const numeracao = exigirParte(buffer, "word/numbering.xml");

  const itens = itensDeLista(doc);
  igual(itens.map((i) => i.nivel), ["0", "1", "1"], "o pai deveria estar no nível 0 e os dois filhos no nível 1: ");
  // O formato do nível de baixo vale SÓ ali — e a definição conferida é a que o Word RESOLVERIA
  // para cada item, não a primeira do arquivo (que é de outra lista).
  const nivel0 = nivelResolvido(numeracao, itens[0].numId, 0);
  const nivel1 = nivelResolvido(numeracao, itens[1].numId, 1);
  verdade(nivel0.includes('<w:numFmt w:val="bullet"/>'), `o nível 0 deveria ser bolinha: ${nivel0}`);
  verdade(nivel1.includes('<w:numFmt w:val="lowerLetter"/>'), `o nível 1 deveria ser letra minúscula: ${nivel1}`);
  // O marcador do nível 1 se escreve "%2.", não "%1." — em OOXML o número do nível entra no texto.
  verdade(/<w:lvlText w:val="%2\."\/>/.test(nivel1), `o texto do marcador do nível 1 está errado: ${nivel1}`);
  // E o recuo do sub-tópico é um passo maior que o do pai, no mesmo passo da régua da tela.
  const passo = mmParaTwips(12.5);
  verdade(nivel0.includes(`w:left="${passo}"`) && nivel1.includes(`w:left="${passo * 2}"`), `o recuo do sub-tópico não é um passo maior que o do pai: ${nivel0} | ${nivel1}`);
});

teste("cada lista RECOMEÇA a contagem — a segunda lista numerada não continua de onde a primeira parou", () => {
  const buffer = docxDaFolha("<ol><li>um</li><li>dois</li></ol><p>meio</p><ol><li>um de novo</li></ol>");
  const doc = exigirParte(buffer, "word/document.xml");
  const numeracao = exigirParte(buffer, "word/numbering.xml");
  const ids = [...new Set([...doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]))];
  igual(ids.length, 2, `duas listas deveriam ter dois numId (achei ${ids.join(", ")}): `);
  // `startOverride` é o que faz a contagem recomeçar; sem ele a segunda lista sairia "3.".
  igual((numeracao.match(/<w:startOverride w:val="1"\/>/g) ?? []).length, 2, "cada instância de lista precisa do startOverride: ");
  // Duas listas do MESMO formato dividem uma definição só — instância é por lista, definição é por formato.
  igual((numeracao.match(/<w:abstractNum /g) ?? []).length, 1, "duas listas do mesmo formato deveriam dividir uma definição: ");
});

teste("lista sem marcador (`list-style-type: none`) sai recuada e SEM numeração — nunca com marcador inventado", () => {
  const doc = exigirParte(docxDaFolha('<ul style="list-style-type: none"><li>sem marcador</li></ul>'), "word/document.xml");
  verdade(!doc.includes("<w:numPr>"), "uma lista sem marcador ganhou marcador no Word");
  verdade(doc.includes(`w:left="${mmParaTwips(12.5)}"`), "a lista sem marcador perdeu o recuo que a tela mostra");
});

// ── TABELA, MOLDURA, colspan e rowspan ──────────────────────────────────────────────────────

teste("tabela N×M vira <w:tbl> com borda nas quatro faces e por dentro — a moldura que a tela mostra", () => {
  const buffer = docxDaFolha("<table><tbody><tr><td>Parcela</td><td>Valor</td></tr><tr><td>1</td><td>R$ 10,00</td></tr></tbody></table>");
  const doc = exigirParte(buffer, "word/document.xml");
  const corpo = corpoDaPeca(doc);
  verdade(corpo.includes("<w:tbl>"), "a tabela não virou <w:tbl>");
  igual((corpo.match(/<w:tr>/g) ?? []).length, 2, "número de linhas errado: ");
  igual((corpo.match(/<w:tc>/g) ?? []).length, 4, "número de células errado: ");
  igual((corpo.match(/<w:gridCol /g) ?? []).length, 2, "a grade de colunas não corresponde à tabela: ");
  for (const face of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
    verdade(new RegExp(`<w:${face} w:val="single"`).test(corpo), `a tabela saiu sem a borda ${face}, que o CSS da folha desenha`);
  }
  for (const celula of ["Parcela", "Valor", "R$ 10,00"]) verdade(corpo.includes(celula), `a célula "${celula}" desapareceu`);
});

teste("MOLDURA DE UMA CÉLULA (linhas ao redor do texto) sai como tabela 1×1 com borda", () => {
  const corpo = corpoDaPeca(
    exigirParte(docxDaFolha("<p>Antes.</p><table><tbody><tr><td>Trecho emoldurado.</td></tr></tbody></table><p>Depois.</p>"), "word/document.xml"),
  );
  igual((corpo.match(/<w:tbl>/g) ?? []).length, 1, "a moldura deveria ser uma tabela: ");
  igual((corpo.match(/<w:tc>/g) ?? []).length, 1, "a moldura deveria ter exatamente uma célula: ");
  verdade(corpo.includes("Trecho emoldurado."), "o texto emoldurado desapareceu");
  verdade(corpo.indexOf("Antes.") < corpo.indexOf("Trecho emoldurado.") && corpo.indexOf("Trecho emoldurado.") < corpo.indexOf("Depois."), "a moldura saiu fora de ordem");
});

teste("colspan vira <w:gridSpan>, e rowspan vira <w:vMerge> com célula de continuação em cada linha de baixo", () => {
  const corpo = corpoDaPeca(
    exigirParte(
      docxDaFolha(
        '<table><tbody><tr><td colspan="2">cabeçalho largo</td></tr>' +
          '<tr><td rowspan="2">alta</td><td>a</td></tr><tr><td>b</td></tr></tbody></table>',
      ),
      "word/document.xml",
    ),
  );
  verdade(/<w:gridSpan w:val="2"\/>/.test(corpo), `colspan não virou gridSpan: ${corpo.slice(0, 600)}`);
  verdade(/<w:vMerge w:val="restart"\/>/.test(corpo), "rowspan não abriu a mesclagem vertical");
  verdade(/<w:vMerge\/>/.test(corpo), "rowspan não gerou a célula de continuação na linha de baixo — a linha sairia curta e a tabela desalinhada");
  // TODA linha tem de terminar com o mesmo número de colunas ocupadas (2), senão o Word desalinha.
  const linhas = [...corpo.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((m) => m[1]);
  igual(linhas.length, 3, "número de linhas errado: ");
  for (const linha of linhas) {
    const largura = [...linha.matchAll(/<w:tc>[\s\S]*?<\/w:tcPr>/g)].reduce((soma, m) => soma + Number((m[0].match(/<w:gridSpan w:val="(\d+)"\/>/) ?? [])[1] ?? 1), 0);
    igual(largura, 2, `linha com número de colunas diferente do resto da tabela: `);
  }
});

teste("tabela ANINHADA numa célula não rouba as linhas da tabela de fora", () => {
  const corpo = corpoDaPeca(
    exigirParte(docxDaFolha("<table><tbody><tr><td><table><tbody><tr><td>dentro</td></tr></tbody></table></td></tr></tbody></table>"), "word/document.xml"),
  );
  igual((corpo.match(/<w:tbl>/g) ?? []).length, 2, "deveriam sair duas tabelas, uma dentro da outra: ");
  igual((corpo.match(/<w:tr>/g) ?? []).length, 2, "a tabela de fora recolheu a linha da de dentro: ");
  verdade(corpo.includes("dentro"), "o texto da tabela aninhada desapareceu");
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 4. O PACOTE: um .docx é um zip, e um OOXML malformado passa em qualquer `includes`
// ════════════════════════════════════════════════════════════════════════════════════════════

const HTML_COMPLETO =
  '<p style="text-align: center"><b>I — DOS FATOS</b></p>' +
  '<p style="text-align: justify; text-indent: 12.5mm">O autor contratou o plano em <b>2019</b>, e a <span style="color: #b91c1c">negativa</span> veio em 2024.<br>A recusa foi verbal.</p>' +
  '<ul style="list-style-type: square"><li>a citação do réu;<ol style="list-style-type: lower-roman"><li>com prazo em dobro;</li></ol></li><li>a produção de prova.</li></ul>' +
  '<table><tbody><tr><td colspan="2"><b>Quadro</b></td></tr><tr><td rowspan="2">Parcela</td><td>R$ 10,00</td></tr><tr><td>R$ 20,00</td></tr></tbody></table>' +
  '<p><span style="background-color: #ffe9a8">Trecho marcado</span> com &amp; e &lt;sinais&gt; perigosos.</p>' +
  '<p style="text-align: right">Termos em que pede deferimento.</p>';

teste("O .DOCX ABRE: document.xml e numbering.xml são XML bem formado, e as partes novas estão declaradas", () => {
  const buffer = docxDaFolha(HTML_COMPLETO);
  const doc = exigirParte(buffer, "word/document.xml");
  const numeracao = exigirParte(buffer, "word/numbering.xml");
  conferirXmlBemFormado(doc, "word/document.xml");
  conferirXmlBemFormado(numeracao, "word/numbering.xml");
  conferirXmlBemFormado(exigirParte(buffer, "[Content_Types].xml"), "[Content_Types].xml");
  conferirXmlBemFormado(exigirParte(buffer, "word/_rels/document.xml.rels"), "word/_rels/document.xml.rels");
  conferirXmlBemFormado(exigirParte(buffer, "docProps/custom.xml"), "docProps/custom.xml");

  // AS TRÊS PARTES DA NUMERAÇÃO SÃO OBRIGATÓRIAS JUNTAS: sem a declaração ou sem a relação, o Word
  // abre o arquivo e mostra os itens como parágrafo comum — sem bolinha, sem número, sem recuo.
  verdade(exigirParte(buffer, "[Content_Types].xml").includes('PartName="/word/numbering.xml"'), "[Content_Types].xml não declara word/numbering.xml");
  verdade(exigirParte(buffer, "word/_rels/document.xml.rels").includes('Target="numbering.xml"'), "document.xml.rels não relaciona numbering.xml");

  // Todo numId referenciado no corpo EXISTE na numeração — um <w:numPr> apontando para o vazio é
  // exatamente o defeito que um teste de `includes` não vê.
  const definidos = new Set([...numeracao.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]));
  for (const casa of doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)) {
    verdade(definidos.has(casa[1]), `o corpo aponta para o numId ${casa[1]}, que não existe em numbering.xml`);
  }
  // E o esquema exige TODOS os <w:abstractNum> antes de qualquer <w:num>.
  verdade(numeracao.lastIndexOf("</w:abstractNum>") < numeracao.indexOf("<w:num "), "numbering.xml pôs <w:num> antes de <w:abstractNum> — o Word recusa o arquivo");
});

teste("TIMBRADO com numeração PRÓPRIA: os ids não colidem e a numeração do timbrado continua inteira", () => {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
  );
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="7"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="TIMBRADO%1."/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="7"/></w:num></w:numbering>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>LOGOTIPO FICTÍCIO</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );

  const buffer = docxDaFolha("<ol><li>item da peça</li></ol>", zip.generate({ type: "nodebuffer" }));
  const doc = exigirParte(buffer, "word/document.xml");
  const numeracao = exigirParte(buffer, "word/numbering.xml");
  conferirXmlBemFormado(numeracao, "word/numbering.xml do timbrado mesclado");

  verdade(doc.includes("LOGOTIPO FICTÍCIO"), "o conteúdo do timbrado foi apagado");
  verdade(numeracao.includes("TIMBRADO%1."), "a numeração PRÓPRIA do timbrado foi apagada ao acrescentar a da peça");
  // O id da peça tem de ficar ACIMA do maior id do timbrado (7) — reusar faria a lista da peça sair
  // com o marcador da lista do timbrado, ou apagar a dele.
  const idsDaPeca = [...doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => Number(m[1]));
  igual(idsDaPeca.length, 1, "o item da peça deveria ter um numId: ");
  verdade(idsDaPeca[0] > 7, `o numId da peça (${idsDaPeca[0]}) colidiu com o do timbrado (7)`);
  verdade(numeracao.lastIndexOf("</w:abstractNum>") < numeracao.indexOf("<w:num "), "a mesclagem pôs <w:num> antes de <w:abstractNum> — o Word recusa o arquivo");
  // Só UMA relação de numeração e um Override, mesmo com o timbrado já tendo os seus.
  igual((exigirParte(buffer, "word/_rels/document.xml.rels").match(/Target="numbering\.xml"/g) ?? []).length, 1, "relação de numeração duplicada: ");
  igual((exigirParte(buffer, "[Content_Types].xml").match(/PartName="\/word\/numbering\.xml"/g) ?? []).length, 1, "Override de numbering.xml duplicado: ");
  // E o metadado de rascunho de IA continua (hard gate, no caminho com timbrado também).
  verdade(exigirParte(buffer, "docProps/custom.xml").includes("LumenPeticionamentoRascunhoIA"), "HARD GATE: metadado obrigatório sumiu no caminho formatado com timbrado");
});

teste("HTML sujo, torto ou hostil não produz XML quebrado — e nunca perde o texto da peça", () => {
  const casos = [
    '<p>Peça legítima.</p><img src=x onerror="alert(1)"><script>alert(2)</script>',
    "<p>tag não fechada<b>negrito",
    "</p></ul></td><li>item órfão</li>",
    "<p>um < dois > três & quatro</p>",
    '<table><tbody><tr><td colspan="99" rowspan="99">absurdo</td></tr></tbody></table>',
    '<p style="margin-left: 200%">medida relativa</p>',
    '<ul style="list-style-type: hebrew"><li>formato que OOXML não tem</li></ul>',
  ];
  for (const html of casos) {
    const buffer = docxDaFolha(html);
    conferirXmlBemFormado(exigirParte(buffer, "word/document.xml"), `word/document.xml de ${JSON.stringify(html.slice(0, 30))}`);
    const numeracao = parte(buffer, "word/numbering.xml");
    if (numeracao) conferirXmlBemFormado(numeracao, `word/numbering.xml de ${JSON.stringify(html.slice(0, 30))}`);
  }
  const limpo = exigirParte(docxDaFolha(casos[0]), "word/document.xml");
  verdade(limpo.includes("Peça legítima."), "o texto legítimo foi perdido no saneamento");
  verdade(!/onerror/i.test(limpo) && !/<script/i.test(limpo), "gatilho de script sobreviveu ao saneamento da porta do módulo");
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 5. O QUE SE PERDE É ANOTADO, NUNCA APROXIMADO EM SILÊNCIO
// ════════════════════════════════════════════════════════════════════════════════════════════

teste("o que o OOXML não representa é DECLARADO em `perdas` — nenhuma aproximação silenciosa", () => {
  const relativa = corpoDocxDoHtmlDaMinuta('<p style="margin-left: 200%">x</p>');
  verdade(relativa.perdas.some((p) => /relativa/i.test(p)), `medida relativa deveria ser anotada como perda: ${JSON.stringify(relativa.perdas)}`);
  verdade(!/w:left="200"/.test(relativa.corpoXml), "200% foi tratado como 200 twips — aproximação silenciosa");

  const formato = corpoDocxDoHtmlDaMinuta('<ul style="list-style-type: hebrew"><li>x</li></ul>');
  verdade(formato.perdas.some((p) => p.includes("hebrew")), `formato de tópico inexistente deveria ser anotado: ${JSON.stringify(formato.perdas)}`);

  const alfa = corpoDocxDoHtmlDaMinuta('<p><span style="color: rgba(20, 30, 40, 0.5)">x</span></p>');
  verdade(alfa.perdas.some((p) => /alfa/i.test(p)), `canal alfa deveria ser anotado: ${JSON.stringify(alfa.perdas)}`);
  verdade(/<w:color w:val="141E28"\/>/.test(alfa.corpoXml), "o RGB deveria ser mantido mesmo perdendo a transparência");

  const nome = corpoDocxDoHtmlDaMinuta('<p><span style="color: rebeccapurple">x</span></p>');
  verdade(nome.perdas.some((p) => p.includes("rebeccapurple")), `cor por nome desconhecida deveria ser anotada: ${JSON.stringify(nome.perdas)}`);
  verdade(!/<w:color/.test(nome.corpoXml), "uma cor por nome desconhecida foi adivinhada em hexadecimal");

  // Sem nada de estranho, nada é anotado — uma lista de perdas que enche sempre não diz nada.
  igual(corpoDocxDoHtmlDaMinuta(HTML_COMPLETO).perdas, [], "formatação que o editor produz de verdade não deveria gerar perda: ");
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 6. VARREDURA: as regras que não cabem num teste de mesa
// ════════════════════════════════════════════════════════════════════════════════════════════

teste("HARD GATE: a exportação passa a formatação da folha ao gerador, e o texto puro continua indo junto", () => {
  const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, `corpoDaFuncao não achou confirmarExportacao (${corpo.length} caracteres) — varredura cega`);
  verdade(/corpoMinutaFormatadaHtml:\s*sessao\.minutaFormatadaHtml/.test(corpo), "a exportação não entrega a formatação da folha ao gerador — o Word sairia cru de novo");
  verdade(/corpoMinuta:\s*garantirFecho\(sessao\.minutaTexto\)/.test(corpo), "a exportação parou de reconferir o fecho sobre o TEXTO PURO");

  // A TRAVA DE CITAÇÃO PENDENTE continua ANTES de montar o arquivo. A APROVAÇÃO, que esta asserção
  // mantinha FORA daqui ("é outra entrega"), passou a ser consumida na etapa C — que é essa outra
  // entrega. A prova de que ela vem antes do arquivo mora em peticionamentoSaidaAprovada.teste.ts.
  const idxContagem = corpo.indexOf("peticionamentoCitacao.count(");
  const idxDocx = corpo.indexOf("montarPeticaoWord(");
  verdade(idxContagem !== -1 && idxDocx !== -1 && idxContagem < idxDocx, "a checagem de citações pendentes precisa vir ANTES de montar o arquivo");
});

teste("HARD GATE: o gerador NÃO tem uma segunda conversão de milímetro para twip", () => {
  for (const rel of ["lib/peticionamentoDocx.ts", "lib/peticionamentoDocxFormatado.ts"]) {
    const codigo = codigoDe(readFileSync(join(RAIZ, rel), "utf8"));
    verdade(codigo.includes("mmParaTwips("), `${rel} deixou de usar a conversão única de lib/peticionamentoPaginaA4.ts`);
    verdade(!/1440/.test(codigo), `${rel} voltou a escrever 1440 twip/polegada à mão — duas conversões divergem`);
    verdade(!/TWIPS_POR_MM\s*=/.test(codigo), `${rel} redefiniu a constante de conversão em vez de importá-la`);
  }
  // E o passo de recuo mora num lugar só: a régua da tela e o numbering.xml usam o MESMO.
  const EDITOR = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "MinutaEditor.tsx"), "utf8"));
  verdade(EDITOR.includes("PASSO_DE_RECUO_MM"), "o editor deixou de usar o passo de recuo compartilhado");
  verdade(!/const PASSO_DE_RECUO_MM\s*=/.test(EDITOR), "o passo de recuo voltou a ser escrito no editor, em paralelo ao do .docx");
});

teste("HARD GATE: o caminho novo monta o corpo do HTML, e o caminho antigo continua no arquivo", () => {
  const FONTE = readFileSync(join(RAIZ, "lib", "peticionamentoDocx.ts"), "utf8");
  const codigo = codigoDe(FONTE);
  verdade(codigo.includes("corpoDocxDoHtmlDaMinuta("), "o gerador não converte mais o HTML da folha — a formatação voltaria a ser só de tela");
  verdade(codigo.includes("function corpoDaMinuta("), "o caminho do TEXTO PURO foi removido — sessão anterior ao editor exportaria diferente");
  const montar = codigoDe(corpoDaFuncao(FONTE, "montarPeticaoWord"));
  verdade(montar.length > 200, `corpoDaFuncao não achou montarPeticaoWord (${montar.length} caracteres) — varredura cega`);
  verdade(montar.includes("acrescentarMetadados(zip, meta)"), "HARD GATE: o metadado obrigatório deixou de ser sempre acrescentado");
  // A escolha entre os dois caminhos é pela PRESENÇA do HTML, e o corpo formatado só é montado quando
  // ele existe — não por uma bandeira que alguém possa esquecer de ligar.
  verdade(/corpoMinutaFormatadaHtml[\s\S]{0,200}length > 0/.test(montar), "a escolha do caminho deixou de depender da presença do HTML da folha");
});

resumo("Peticionamento — a formatação da minuta no .docx");
