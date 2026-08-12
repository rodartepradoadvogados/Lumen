import PizZip from "pizzip";
import type { RelatorioResultado } from "@/lib/relatorioPersonalizado";

// Gera o relatório em Word (.docx) — o formato que se anexa a e-mail e a processo.
//
// COMO O TIMBRADO ENTRA: um .docx é um pacote ZIP. Quando o escritório envia o papel timbrado em
// .docx (Office.timbradoUrl), o relatório é ACRESCENTADO ao corpo desse mesmo pacote, e todo o
// resto — cabeçalho, rodapé, margens, fontes, imagens da marca — continua exatamente como estava.
// Acrescentar (e não substituir o corpo) é deliberado: muito papel timbrado traz o logotipo como
// imagem no próprio corpo, e não no cabeçalho; substituir apagaria justamente a marca.
//
// Sem timbrado em .docx, montamos um .docx mínimo do zero, com cabeçalho textual do escritório.

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type EstiloTexto = { negrito?: boolean; tamanho?: number; cor?: string; italico?: boolean };

// `tamanho` em pontos; o OOXML usa meio-pontos, daí o dobro.
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
  return `<w:r>${rPr(e)}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

// Hiperlink como CAMPO do Word (HYPERLINK), e não como relacionamento: campo não exige mexer em
// word/_rels/document.xml.rels, o que manteria que reescrever os relacionamentos do timbrado do
// escritório — justamente o que não queremos tocar.
function linkRun(texto: string, url: string): string {
  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${esc(url)}" </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr><w:color w:val="17325C"/><w:u w:val="single"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function paragrafo(conteudo: string, opts: { alinhamento?: "center" | "right"; espacoAntes?: number; borda?: boolean } = {}): string {
  const pPr = [
    opts.alinhamento ? `<w:jc w:val="${opts.alinhamento}"/>` : "",
    opts.espacoAntes ? `<w:spacing w:before="${opts.espacoAntes}"/>` : "",
    opts.borda ? `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="C9962F"/></w:pBdr>` : "",
  ].join("");
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${conteudo}</w:p>`;
}

function celula(conteudo: string, larguraPct: number, cabecalho = false): string {
  const sombra = cabecalho ? `<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>` : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${Math.round(larguraPct * 50)}" w:type="pct"/>${sombra}</w:tcPr>` +
    `<w:p>${conteudo}</w:p></w:tc>`
  );
}

function tabela(colunasPct: number[], linhas: string[][], comLink?: (linha: number, coluna: number) => string | undefined): string {
  const bordas =
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="D9DCE0"/>`)
      .join("") +
    `</w:tblBorders>`;

  const corpo = linhas
    .map((linha, li) =>
      `<w:tr>` +
      linha
        .map((texto, ci) => {
          const url = comLink?.(li, ci);
          const cabecalho = li === 0;
          const conteudo = url ? linkRun(texto, url) : run(texto, { negrito: cabecalho, tamanho: 8 });
          return celula(conteudo, colunasPct[ci] ?? 100 / linha.length, cabecalho);
        })
        .join("") +
      `</w:tr>`
    )
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${bordas}</w:tblPr>` +
    `<w:tblGrid>${colunasPct.map((p) => `<w:gridCol w:w="${Math.round(p * 94)}"/>`).join("")}</w:tblGrid>` +
    corpo +
    `</w:tbl>`
  );
}

export type MetaRelatorio = {
  escritorio: string;
  cnpj?: string | null;
  de: string;
  ate: string;
  baseLabel: string;
  criterioLabel: string;
  emitidoPor: string;
  // Só é usado quando NÃO há papel timbrado em .docx — com timbrado, o cabeçalho já vem do
  // próprio arquivo e repetir o nome do escritório duplicaria a identificação na folha.
  incluirCabecalhoTextual: boolean;
};

function dataBR(iso: string) {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR");
}

function corpoDoRelatorio(resultado: RelatorioResultado, meta: MetaRelatorio): string {
  const blocos: string[] = [];

  if (meta.incluirCabecalhoTextual) {
    blocos.push(paragrafo(run(meta.escritorio, { negrito: true, tamanho: 14 })));
    if (meta.cnpj) blocos.push(paragrafo(run(`CNPJ ${meta.cnpj}`, { tamanho: 8, cor: "5B646E" })));
  }

  blocos.push(paragrafo(run("Relatório de produção", { negrito: true, tamanho: 13 }), { espacoAntes: meta.incluirCabecalhoTextual ? 240 : 0, borda: true }));
  blocos.push(
    paragrafo(
      run(`Período de ${dataBR(meta.de)} a ${dataBR(meta.ate)} · considerando a data de ${meta.baseLabel} · trabalho creditado a ${meta.criterioLabel.toLowerCase()}`, {
        tamanho: 8,
        cor: "5B646E",
      })
    )
  );
  blocos.push(
    paragrafo(run(`Emitido em ${new Date().toLocaleDateString("pt-BR")} por ${meta.emitidoPor}`, { tamanho: 8, cor: "5B646E" }))
  );

  // ---- Totais ----
  blocos.push(paragrafo(run("Totais do período", { negrito: true, tamanho: 11 }), { espacoAntes: 280 }));
  blocos.push(
    tabela(
      [46, 27, 27],
      [
        ["Indicador", "No período", "Período anterior"],
        ...resultado.blocos.map((b) => [b.rotulo, String(b.valor), String(b.anterior)]),
      ]
    )
  );

  // ---- Por pessoa ----
  blocos.push(paragrafo(run("Volume por pessoa", { negrito: true, tamanho: 11 }), { espacoAntes: 280 }));
  blocos.push(
    tabela(
      [50, 25, 25],
      [
        ["Pessoa", "Peças", "Compromissos"],
        ...(resultado.porPessoa.length > 0
          ? resultado.porPessoa.map((l) => [l.rotulo, String(l.pecas), String(l.compromissos)])
          : [["Sem itens no período", "—", "—"]]),
      ]
    )
  );

  // ---- Por assessoria ----
  blocos.push(paragrafo(run("Volume por assessoria", { negrito: true, tamanho: 11 }), { espacoAntes: 280 }));
  blocos.push(
    tabela(
      [50, 25, 25],
      [
        ["Assessoria", "Peças", "Compromissos"],
        ...(resultado.porAssessoria.length > 0
          ? resultado.porAssessoria.map((l) => [l.rotulo, String(l.pecas), String(l.compromissos)])
          : [["Nenhum item vinculado a assessoria", "—", "—"]]),
      ]
    )
  );
  if (resultado.semVinculoAssessoria > 0) {
    blocos.push(
      paragrafo(
        run(`${resultado.semVinculoAssessoria} item(ns) do período não entram no corte por assessoria por não terem vínculo — constam no detalhamento.`, {
          tamanho: 8,
          italico: true,
          cor: "9A6700",
        })
      )
    );
  }

  // ---- Detalhamento ----
  blocos.push(
    paragrafo(run(`Detalhamento (${resultado.detalhes.length} de ${resultado.detalhesTotal})`, { negrito: true, tamanho: 11 }), { espacoAntes: 280 })
  );
  const linhas = [
    ["Item", "Tipo", "Vínculo", "Anexou / concluiu", "Responsável", "Data"],
    ...resultado.detalhes.map((d) => [
      d.nome,
      d.tipoLabel,
      [d.assessoriaNome, d.origemLabel].filter(Boolean).join(" · "),
      d.anexadoPor ?? "—",
      d.responsavel ?? "—",
      dataBR(d.data),
    ]),
  ];
  blocos.push(
    tabela([34, 14, 18, 14, 12, 8], linhas, (li, ci) => {
      if (li === 0 || ci !== 0) return undefined;
      return resultado.detalhes[li - 1]?.driveUrl;
    })
  );

  return blocos.join("");
}

// ---------------------------------------------------------------------------

const SECT_PR_A4 =
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

function docxDoZero(conteudo: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${NS_W}"><w:body>${conteudo}${SECT_PR_A4}</w:body></w:document>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

// Acrescenta o conteúdo ao corpo do timbrado, imediatamente ANTES do <w:sectPr> final (que carrega
// margens e a ligação com cabeçalho/rodapé e, por isso, precisa continuar sendo o último elemento
// do corpo). Timbrado sem sectPr: entra no fim do corpo mesmo.
function injetarNoTimbrado(timbrado: Buffer, conteudo: string): Buffer {
  const zip = new PizZip(timbrado);
  const arquivo = zip.file("word/document.xml");
  if (!arquivo) throw new Error("O arquivo enviado como papel timbrado não é um .docx válido (falta word/document.xml).");

  const xml = arquivo.asText();
  const fimCorpo = xml.lastIndexOf("</w:body>");
  if (fimCorpo === -1) throw new Error("O arquivo enviado como papel timbrado não é um .docx válido (corpo do documento não encontrado).");

  const inicioSect = xml.lastIndexOf("<w:sectPr", fimCorpo);
  const ponto = inicioSect === -1 ? fimCorpo : inicioSect;
  // Uma quebra de parágrafo antes do relatório evita ele colar num parágrafo do timbrado.
  const novo = `${xml.slice(0, ponto)}${paragrafo("")}${conteudo}${xml.slice(ponto)}`;

  zip.file("word/document.xml", novo);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export function montarRelatorioWord(
  resultado: RelatorioResultado,
  meta: MetaRelatorio,
  timbradoDocx?: Buffer | null
): Buffer {
  const conteudo = corpoDoRelatorio(resultado, meta);
  if (timbradoDocx) return injetarNoTimbrado(timbradoDocx, conteudo);
  return docxDoZero(conteudo);
}
