import PizZip from "pizzip";
import { PAGINA_A4, mmParaTwips } from "@/lib/peticionamentoPaginaA4";

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
  tituloPeca: string; // ex.: "Réplica — Processo nº ..."
};

function paragrafosDaNota(linhas: string[], negritoPrimeiraLinha: boolean): string {
  return linhas
    .map((linha, i) => (linha === "" ? paragrafo("") : paragrafo(run(linha, { negrito: negritoPrimeiraLinha && i === 0, tamanho: 9 }))))
    .join("");
}

// Heurística para distinguir título de seção ("I — DOS FATOS") de parágrafo comum: curto e em
// maioria de caixa alta. Não precisa ser perfeita — só decide negrito/tamanho, nunca some texto.
function pareceTitulo(linha: string): boolean {
  const t = linha.trim();
  if (t.length === 0 || t.length > 90) return false;
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length === 0) return false;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "");
  return maiusculas.length / letras.length > 0.7;
}

function corpoDaMinuta(texto: string): string {
  const paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragrafos
    .map((p) => {
      if (pareceTitulo(p)) return paragrafo(run(p, { negrito: true, tamanho: 11 }), { espacoAntes: 240, espacoDepois: 120 });
      const alinhamento = p === paragrafos[paragrafos.length - 1] || /^goi[aâ]nia,|^\d{1,2} de [a-zç]+ de \d{4}/i.test(p) ? "right" : "both";
      return paragrafo(run(p, { tamanho: 11 }), { alinhamento: alinhamento as "right" | "both", espacoDepois: 160 });
    })
    .join("");
}

function corpoDaPeticao(dados: DadosPeticaoDocx): string {
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
  blocos.push(corpoDaMinuta(dados.corpoMinuta));
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
function injetarNoTimbrado(timbrado: Buffer, conteudo: string): PizZip {
  const zip = new PizZip(timbrado);
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
  const conteudo = `${paragrafo(run(dados.tituloPeca, { negrito: true, tamanho: 13 }), { alinhamento: "center", espacoDepois: 200 })}${corpoDaPeticao(dados)}`;
  const zip = timbradoDocx ? injetarNoTimbrado(timbradoDocx, conteudo) : docxDoZero(conteudo);
  acrescentarMetadados(zip, meta);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
