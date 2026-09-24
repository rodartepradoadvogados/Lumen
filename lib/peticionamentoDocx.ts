import PizZip from "pizzip";
import { PAGINA_A4, mmParaTwips } from "@/lib/peticionamentoPaginaA4";
import { FECHO_PETICAO, terminaComFechoCorreto } from "@/lib/peticionamentoFecho";
import { corpoDocxDoHtmlDaMinuta, type CorpoFormatadoDocx, type NumeracaoDocx } from "@/lib/peticionamentoDocxFormatado";
import { papelDoParagrafoDaMinuta, paragrafosDoTextoPuroDaMinuta } from "@/lib/peticionamentoMinutaHeuristica";

// GERA O .DOCX DA PETIÇÃO — sempre Word, sempre com o timbrado do escritório quando houver
// (especificação §11 + decisions.md §9 item 5: "Word é o único formato em qualquer cenário...
// o timbrado é aplicado sempre que existir; quando não existir, a tela avisa antes de exportar e
// diz onde cadastrar" — o AVISO é responsabilidade da tela/Server Action, não deste módulo, que
// só recebe `timbradoDocx` já resolvido (ou null) e produz o arquivo).
//
// Mesmo padrão OOXML "à mão" de lib/relatorioDocx.ts (PizZip + XML montado por string) — HÁ
// duplicação deliberada dos helpers pequenos (esc/run/paragrafo): os dois módulos precisam
// poder evoluir separado (petição tem caixa de nota, cabeçalho de vara, assinatura; relatório
// tem tabela de indicadores) sem um quebrar o outro por acoplamento acidental. É a mesma
// justificativa que lib/driveNamingOffice.ts já registra para não reaproveitar
// lib/publicationGrouping.ts.
//
// DOIS CAMINHOS PARA O CORPO DA PEÇA, e a razão de os dois continuarem existindo:
//
//   • COM `corpoMinutaFormatadaHtml` — o corpo é montado da FOLHA, por
//     lib/peticionamentoDocxFormatado.ts, com negrito, itálico, sublinhado, cor da letra, cor de
//     fundo, alinhamento, os três recuos, as listas (os oito formatos da setinha e o sub-tópico
//     aninhado, via word/numbering.xml) e as tabelas, inclusive a moldura de uma célula. O que o
//     advogado revisou na tela é o que sai no Word.
//   • SEM ela (nulo ou vazio) — o corpo é montado do TEXTO PURO, por `corpoDaMinuta`, exatamente
//     como antes desta entrega. Sessão anterior ao editor é estado LEGÍTIMO (ver o contrato de
//     `minutaFormatadaHtml` no schema), e para ela o arquivo tem de sair byte a byte igual ao que
//     saía. É por isso que `corpoDaMinuta` continua aqui, e produz exatamente o mesmo XML.
//     A heurística que ela usa (título em negrito, data e fecho à direita) passou para
//     lib/peticionamentoMinutaHeuristica.ts, porque a SEMENTE da folha aplica a mesma — uma
//     implementação, dois consumidores.
//
// O TEXTO PURO continua sendo a fonte de tudo o que NÃO é aparência: o fecho, a identidade de cada
// citação e a resposta a "já existe minuta?". Nenhuma das três passou para o HTML.
//
// A TRAVA DE METADADO (especificação §3 e §5): todo .docx gerado aqui carrega, nas propriedades
// do PRÓPRIO ARQUIVO (docProps/custom.xml — nunca texto visível no corpo), que é rascunho de IA,
// quem confirmou a exportação e quando. Isto não depende do texto que o Hermes escreveu; é
// código, sempre executado, hard gate de sistema.

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type EstiloTexto = { negrito?: boolean; tamanho?: number; cor?: string; italico?: boolean };

function rPr(e: EstiloTexto = {}): string {
  const partes = [
    e.negrito ? "<w:b/>" : "",
    e.italico ? "<w:i/>" : "",
    e.cor ? `<w:color w:val="${e.cor}"/>` : "",
    e.tamanho ? `<w:sz w:val="${e.tamanho * 2}"/><w:szCs w:val="${e.tamanho * 2}"/>` : "",
  ].join("");
  return partes ? `<w:rPr>${partes}</w:rPr>` : "";
}

function run(texto: string, e: EstiloTexto = {}): string {
  // Quebra de linha DENTRO do mesmo parágrafo (usado no corpo da minuta, onde o Hermes manda
  // parágrafos com \n simples entre itens de pedido, por exemplo) vira <w:br/>, nunca some.
  const partes = texto.split("\n");
  return partes
    .map((p, i) => `<w:r>${rPr(e)}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>${i < partes.length - 1 ? "<w:r><w:br/></w:r>" : ""}`)
    .join("");
}

function paragrafo(
  conteudo: string,
  opts: { alinhamento?: "center" | "right" | "both"; espacoAntes?: number; espacoDepois?: number } = {},
): string {
  const pPr = [
    opts.alinhamento ? `<w:jc w:val="${opts.alinhamento}"/>` : "",
    opts.espacoAntes || opts.espacoDepois ? `<w:spacing ${opts.espacoAntes ? `w:before="${opts.espacoAntes}"` : ""} ${opts.espacoDepois ? `w:after="${opts.espacoDepois}"` : ""}/>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${conteudo}</w:p>`;
}

// Uma "caixa" com borda e fundo — a nota obrigatória e a nota de riscos, tanto na tela quanto no
// .docx, precisam se destacar do corpo da peça. OOXML não tem <div>; a forma robusta e simples de
// simular um bloco com moldura é uma tabela de 1x1, com bordas nas quatro faces e sombreamento.
function caixa(paragrafosXml: string, corBorda: string, corFundo: string): string {
  const bordas = ["top", "left", "bottom", "right"].map((b) => `<w:${b} w:val="single" w:sz="12" w:space="4" w:color="${corBorda}"/>`).join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${bordas}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="${corFundo}"/><w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar></w:tcPr>${paragrafosXml}</w:tc></w:tr>` +
    `</w:tbl>${paragrafo("")}`
  );
}

export type PrecedenteParaDocx = { texto: string; fonte: string | null };

export type DadosPeticaoDocx = {
  notaObrigatoriaTexto: string; // já montado por lib/peticionamentoNotaObrigatoria.ts, uma linha por item
  notaRiscos: string[]; // já filtrada por lib/peticionamentoRiscos.ts — pode ser vazia (bloco não aparece)
  corpoMinuta: string; // texto do Hermes, com o fecho já garantido por lib/peticionamentoFecho.ts
  /**
   * A FORMATAÇÃO DA FOLHA (`PeticionamentoSessao.minutaFormatadaHtml`) — OPCIONAL de propósito.
   *
   * Quando existe, é ELA que monta o corpo, com negrito, cor, alinhamento, recuo, lista e tabela de
   * verdade (lib/peticionamentoDocxFormatado.ts). Quando é nula ou vazia — sessão anterior ao
   * editor, estado legítimo pelo contrato do schema — o corpo é montado do TEXTO PURO exatamente
   * como sempre foi, e o arquivo sai idêntico ao de antes desta entrega.
   *
   * `corpoMinuta` continua obrigatório nos dois casos: é dele que sai o caminho antigo, e é o texto
   * puro que continua sendo a fonte do fecho e da identidade das citações.
   */
  corpoMinutaFormatadaHtml?: string | null;
  tituloPeca: string; // ex.: "Réplica — Processo nº ..."
};

function paragrafosDaNota(linhas: string[], negritoPrimeiraLinha: boolean): string {
  return linhas
    .map((linha, i) => (linha === "" ? paragrafo("") : paragrafo(run(linha, { negrito: negritoPrimeiraLinha && i === 0, tamanho: 9 }))))
    .join("");
}

// A HEURÍSTICA DE TÍTULO E DE ALINHAMENTO NÃO MORA MAIS AQUI — ela está em
// lib/peticionamentoMinutaHeuristica.ts, e a SEMENTE da folha
// (lib/peticionamentoMinutaFormatada.ts: `htmlDaMinutaDoTextoPuro`) aplica a MESMA, agora visível
// na tela e editável pelo advogado. Duas cópias divergiriam no primeiro dia em que alguém mexesse
// numa só, e a divergência seria muda: o Word e a tela discordariam sem nenhum teste acusar.
//
// O QUE ESTA FUNÇÃO PRODUZ NÃO MUDOU EM NADA: os mesmos parágrafos, o mesmo negrito, o mesmo
// `<w:jc>` e o mesmo espaçamento de antes. Sessão anterior ao editor (`minutaFormatadaHtml` nulo —
// estado legítimo pelo contrato do schema) exporta o arquivo byte a byte igual ao de sempre, e
// lib/testes/peticionamentoDocxFormatado.teste.ts prova isso caso a caso.
function corpoDaMinuta(texto: string): string {
  const paragrafos = paragrafosDoTextoPuroDaMinuta(texto);
  return paragrafos
    .map((p) => {
      const papel = papelDoParagrafoDaMinuta(p, paragrafos);
      if (papel === "titulo") return paragrafo(run(p, { negrito: true, tamanho: 11 }), { espacoAntes: 240, espacoDepois: 120 });
      return paragrafo(run(p, { tamanho: 11 }), { alinhamento: papel === "direita" ? "right" : "both", espacoDepois: 160 });
    })
    .join("");
}

/**
 * O CORPO VINDO DA FOLHA — e a rede de segurança do fecho.
 *
 * O XML já vem montado por lib/peticionamentoDocxFormatado.ts. O que se decide aqui é uma coisa só:
 * o fecho. `garantirFecho()` continua conferindo o TEXTO PURO (é ele que `confirmarExportacao`
 * reconfere, defesa em profundidade que esta entrega não afrouxa), e o texto puro da SESSÃO pode ter
 * ganhado o fecho na gravação sem que o HTML da folha o tivesse. Nesse caso o corpo sairia sem o
 * fecho — e o hard gate do fecho existe justamente para isso não acontecer nunca.
 *
 * Então: se o texto puro DERIVADO DO HTML não termina no fecho literal, um parágrafo com o fecho é
 * ACRESCENTADO ao fim. Nada é apagado — nem uma variação errada que o advogado tenha deixado na
 * folha. Apagar texto de peça com base num regex é um erro pior do que repetir uma linha, e a
 * variação errada está visível na tela para ele corrigir.
 */
function corpoDaMinutaFormatada(formatado: CorpoFormatadoDocx): string {
  if (terminaComFechoCorreto(formatado.textoPuro)) return formatado.corpoXml;
  return `${formatado.corpoXml}${paragrafo(run(FECHO_PETICAO, { tamanho: 11 }), { alinhamento: "both", espacoDepois: 160 })}`;
}

function corpoDaPeticao(dados: DadosPeticaoDocx, formatado: CorpoFormatadoDocx | null): string {
  const blocos: string[] = [];
  blocos.push(
    caixa(
      paragrafosDaNota(["⚠ MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA", "", ...dados.notaObrigatoriaTexto.split("\n").slice(1)], true),
      "CAA15A",
      "FBF1DF",
    ),
  );
  if (dados.notaRiscos.length > 0) {
    blocos.push(
      caixa(
        paragrafosDaNota(["RISCOS IDENTIFICADOS NESTA MINUTA — aponta, não decide", "", ...dados.notaRiscos.map((r) => `• ${r}`)], true),
        "5B7A96",
        "EAF0F5",
      ),
    );
  }
  blocos.push(formatado ? corpoDaMinutaFormatada(formatado) : corpoDaMinuta(dados.corpoMinuta));
  return blocos.join("");
}

// A GEOMETRIA DA FOLHA vem de lib/peticionamentoPaginaA4.ts, em milímetro, e é convertida para
// twip aqui. Ela NÃO é mais escrita à mão nesta string: a tela da minuta desenha a mesma folha
// A4 e a mesma margem na régua, e duas cópias da mesma medida divergem no dia em que alguém
// ajusta uma só. 708 twips de cabeçalho/rodapé continuam literais — são posição de header/footer
// do OOXML, que a tela não desenha e não tem como discordar.
const SECT_PR_A4 =
  `<w:sectPr><w:pgSz w:w="${mmParaTwips(PAGINA_A4.larguraMm)}" w:h="${mmParaTwips(PAGINA_A4.alturaMm)}"/>` +
  `<w:pgMar w:top="${mmParaTwips(PAGINA_A4.margens.topoMm)}" w:right="${mmParaTwips(PAGINA_A4.margens.direitaMm)}" ` +
  `w:bottom="${mmParaTwips(PAGINA_A4.margens.baseMm)}" w:left="${mmParaTwips(PAGINA_A4.margens.esquerdaMm)}" ` +
  `w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

// ---------------------------------------------------------------------------
// METADADOS — docProps/custom.xml. Hard gate: nunca omite que é rascunho de IA (especificação
// §3, último item, e §5). GUID fixo abaixo é o fmtid padrão OOXML para propriedades
// personalizadas — não é segredo, é constante do formato.
const FMTID_CUSTOM = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

export type MetadadosPeticaoDocx = {
  confirmadoPorNome: string;
  confirmadoPorOab: string;
  confirmadoEm: Date;
  sessaoId: string;
};

function propriedadeCustom(pid: number, nome: string, valor: string): string {
  return `<property fmtid="${FMTID_CUSTOM}" pid="${pid}" name="${esc(nome)}"><vt:lpwstr>${esc(valor)}</vt:lpwstr></property>`;
}

function docPropsCustomXml(meta: MetadadosPeticaoDocx): string {
  const props = [
    propriedadeCustom(2, "LumenPeticionamentoRascunhoIA", "true"),
    propriedadeCustom(3, "LumenPeticionamentoConfirmadoPor", `${meta.confirmadoPorNome} — OAB ${meta.confirmadoPorOab}`),
    propriedadeCustom(4, "LumenPeticionamentoConfirmadoEm", meta.confirmadoEm.toISOString()),
    propriedadeCustom(5, "LumenPeticionamentoSessao", meta.sessaoId),
  ].join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${props}</Properties>`
  );
}

/**
 * Acrescenta docProps/custom.xml a um .docx já pronto (do zero OU timbrado) — nunca substitui
 * partes existentes do pacote (docProps/core.xml do timbrado, se houver, continua intacto).
 * Falha ALTO (lança erro) se as duas partes de controle do pacote não tiverem a forma esperada —
 * nunca falha em silêncio deixando o arquivo sair sem o metadado do hard gate.
 */
function acrescentarMetadados(zip: PizZip, meta: MetadadosPeticaoDocx): void {
  zip.file("docProps/custom.xml", docPropsCustomXml(meta));

  const contentTypes = zip.file("[Content_Types].xml");
  if (!contentTypes) throw new Error("Pacote .docx sem [Content_Types].xml — não é possível gravar o metadado obrigatório de rascunho de IA.");
  const ctXml = contentTypes.asText();
  const overridePart = `<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>`;
  const fimTypes = ctXml.lastIndexOf("</Types>");
  if (fimTypes === -1) throw new Error("[Content_Types].xml do .docx em formato inesperado — não é possível gravar o metadado obrigatório de rascunho de IA.");
  if (!ctXml.includes('PartName="/docProps/custom.xml"')) {
    zip.file("[Content_Types].xml", `${ctXml.slice(0, fimTypes)}${overridePart}${ctXml.slice(fimTypes)}`);
  }

  const rels = zip.file("_rels/.rels");
  if (!rels) throw new Error("Pacote .docx sem _rels/.rels — não é possível gravar o metadado obrigatório de rascunho de IA.");
  const relsXml = rels.asText();
  const fimRels = relsXml.lastIndexOf("</Relationships>");
  if (fimRels === -1) throw new Error("_rels/.rels do .docx em formato inesperado — não é possível gravar o metadado obrigatório de rascunho de IA.");
  if (!relsXml.includes("docProps/custom.xml")) {
    const novaRel = `<Relationship Id="rIdLumenPeticionamentoCustom" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>`;
    zip.file("_rels/.rels", `${relsXml.slice(0, fimRels)}${novaRel}${relsXml.slice(fimRels)}`);
  }
}

// ---------------------------------------------------------------------------
// NUMERAÇÃO — word/numbering.xml, a parte mais pesada da formatação no Word.
//
// Lista com marcador e lista numerada não são estilo de parágrafo em OOXML: cada item traz um
// `<w:numPr>` que APONTA para uma definição guardada numa parte separada do pacote. Sem
// `word/numbering.xml`, sem a relação em `word/_rels/document.xml.rels` e sem o Override em
// `[Content_Types].xml`, o Word abre o arquivo e mostra os itens como parágrafos comuns — sem
// bolinha, sem número, sem recuo de sub-tópico. As três partes são obrigatórias juntas.

const TIPO_DE_NUMERACAO = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const RELACAO_DE_NUMERACAO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";

/**
 * O primeiro id de numeração LIVRE do pacote.
 *
 * Num .docx do zero é 1. Num TIMBRADO é um acima de tudo o que ele já usa: o timbrado do escritório
 * pode ter lista própria (um rodapé numerado, por exemplo), e reusar um `numId` dele faria a lista
 * da peça sair com o marcador da lista do timbrado — ou apagar a dele. Ler o máximo e somar um é o
 * que mantém as duas numerações independentes.
 */
function primeiroIdDeNumeracaoLivre(zip: PizZip): number {
  const arquivo = zip.file("word/numbering.xml");
  if (!arquivo) return 1;
  const xml = arquivo.asText();
  let maior = 0;
  for (const casa of xml.matchAll(/w:(?:abstractNumId|numId)="(\d+)"/g)) {
    const n = Number.parseInt(casa[1], 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior + 1;
}

/**
 * Acrescenta a numeração da peça ao pacote — criando `word/numbering.xml` quando não há, e
 * MESCLANDO quando o timbrado já tem um (nunca substituindo: sobrescrever apagaria a numeração do
 * timbrado). Falha ALTO se as partes de controle não tiverem a forma esperada, em vez de gerar em
 * silêncio um arquivo em que a lista da peça sai sem marcador.
 */
function acrescentarNumeracao(zip: PizZip, numeracao: NumeracaoDocx): void {
  const existente = zip.file("word/numbering.xml");
  if (existente) {
    const xml = existente.asText();
    const fim = xml.lastIndexOf("</w:numbering>");
    if (fim === -1) throw new Error("word/numbering.xml do timbrado em formato inesperado — a numeração das listas da minuta não pode ser acrescentada com segurança.");
    // O ESQUEMA EXIGE TODOS os <w:abstractNum> ANTES de qualquer <w:num>. Por isso as definições
    // entram antes do primeiro <w:num> existente, e só as instâncias vão para o fim.
    const primeiroNum = xml.search(/<w:num[\s>]/);
    const ondeAbstratos = primeiroNum === -1 ? fim : primeiroNum;
    zip.file(
      "word/numbering.xml",
      `${xml.slice(0, ondeAbstratos)}${numeracao.abstratosXml}${xml.slice(ondeAbstratos, fim)}${numeracao.instanciasXml}${xml.slice(fim)}`,
    );
  } else {
    zip.file(
      "word/numbering.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${NS_W}">${numeracao.abstratosXml}${numeracao.instanciasXml}</w:numbering>`,
    );
  }

  const contentTypes = zip.file("[Content_Types].xml");
  if (!contentTypes) throw new Error("Pacote .docx sem [Content_Types].xml — a numeração das listas da minuta não pode ser declarada.");
  const ctXml = contentTypes.asText();
  const fimTypes = ctXml.lastIndexOf("</Types>");
  if (fimTypes === -1) throw new Error("[Content_Types].xml do .docx em formato inesperado — a numeração das listas da minuta não pode ser declarada.");
  if (!ctXml.includes('PartName="/word/numbering.xml"')) {
    const override = `<Override PartName="/word/numbering.xml" ContentType="${TIPO_DE_NUMERACAO}"/>`;
    zip.file("[Content_Types].xml", `${ctXml.slice(0, fimTypes)}${override}${ctXml.slice(fimTypes)}`);
  }

  // A relação é do DOCUMENTO (word/_rels/document.xml.rels), não do pacote (_rels/.rels) — é
  // word/document.xml que referencia a numeração.
  const rels = zip.file("word/_rels/document.xml.rels");
  const bruto = rels
    ? rels.asText()
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  // Um pacote SEM relação nenhuma escreve `<Relationships .../>` fechado em si mesmo — é o que
  // `docxDoZero` produz. Abrir a tag antes de acrescentar evita o erro de "formato inesperado" num
  // arquivo que está perfeitamente bem formado.
  const relsXml = bruto.includes("</Relationships>") ? bruto : bruto.replace(/<Relationships([^>]*?)\s*\/>/, "<Relationships$1></Relationships>");
  const fimRels = relsXml.lastIndexOf("</Relationships>");
  if (fimRels === -1) throw new Error("word/_rels/document.xml.rels do .docx em formato inesperado — a numeração das listas da minuta não pode ser relacionada.");
  if (!relsXml.includes('Target="numbering.xml"')) {
    const novaRel = `<Relationship Id="rIdLumenMinutaNumeracao" Type="${RELACAO_DE_NUMERACAO}" Target="numbering.xml"/>`;
    zip.file("word/_rels/document.xml.rels", `${relsXml.slice(0, fimRels)}${novaRel}${relsXml.slice(fimRels)}`);
  }
}

function docxDoZero(conteudo: string): PizZip {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${NS_W}"><w:body>${conteudo}${SECT_PR_A4}</w:body></w:document>`,
  );
  return zip;
}

// Mesma técnica de lib/relatorioDocx.ts:injetarNoTimbrado — acrescenta ANTES do <w:sectPr> final
// (que carrega margens/cabeçalho/rodapé do timbrado, precisa continuar sendo o último elemento).
//
// Recebe o PizZip já aberto, e não o Buffer, porque o pacote do timbrado precisa ser LIDO antes de
// o conteúdo ser montado: é dele que sai o primeiro id de numeração livre (ver
// `primeiroIdDeNumeracaoLivre`), e o `<w:numPr>` de cada item de lista já sai escrito com esse id.
function injetarNoTimbrado(zip: PizZip, conteudo: string): PizZip {
  const arquivo = zip.file("word/document.xml");
  if (!arquivo) throw new Error("O arquivo cadastrado como timbrado não é um .docx válido (falta word/document.xml).");
  const xml = arquivo.asText();
  const fimCorpo = xml.lastIndexOf("</w:body>");
  if (fimCorpo === -1) throw new Error("O arquivo cadastrado como timbrado não é um .docx válido (corpo do documento não encontrado).");
  const inicioSect = xml.lastIndexOf("<w:sectPr", fimCorpo);
  const ponto = inicioSect === -1 ? fimCorpo : inicioSect;
  zip.file("word/document.xml", `${xml.slice(0, ponto)}${paragrafo("")}${conteudo}${xml.slice(ponto)}`);
  return zip;
}

export function montarPeticaoWord(dados: DadosPeticaoDocx, meta: MetadadosPeticaoDocx, timbradoDocx?: Buffer | null): Buffer {
  // O pacote do timbrado é aberto ANTES de o corpo ser montado: o id de numeração das listas da
  // peça depende do que o timbrado já usa, e ele é escrito dentro do próprio XML do corpo.
  const doTimbrado = timbradoDocx ? new PizZip(timbradoDocx) : null;
  const htmlDaFolha = (dados.corpoMinutaFormatadaHtml ?? "").trim();
  const formatado = htmlDaFolha.length > 0 ? corpoDocxDoHtmlDaMinuta(htmlDaFolha, doTimbrado ? primeiroIdDeNumeracaoLivre(doTimbrado) : 1) : null;

  const conteudo = `${paragrafo(run(dados.tituloPeca, { negrito: true, tamanho: 13 }), { alinhamento: "center", espacoDepois: 200 })}${corpoDaPeticao(dados, formatado)}`;
  const zip = doTimbrado ? injetarNoTimbrado(doTimbrado, conteudo) : docxDoZero(conteudo);
  if (formatado?.numeracao) acrescentarNumeracao(zip, formatado.numeracao);
  acrescentarMetadados(zip, meta);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
