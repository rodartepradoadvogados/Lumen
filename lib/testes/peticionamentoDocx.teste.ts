import PizZip from "pizzip";
import { teste, igual, verdade, resumo } from "./executar";
import { montarPeticaoWord, type DadosPeticaoDocx, type MetadadosPeticaoDocx } from "@/lib/peticionamentoDocx";

const dados: DadosPeticaoDocx = {
  notaObrigatoriaTexto: [
    "MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA",
    "Este documento é um rascunho...",
    "",
    "Jurisprudência citada: nenhum precedente citado nesta minuta.",
    "Documentos-base consultados: nenhum documento consultado nesta sessão.",
    "Contexto vinculado: sem vínculo — petição avulsa.",
    "Gerado em: 21/09/2026 14:32 · Perfil: peticionamento-lumen · Sessão: a294f1e0.",
  ].join("\n"),
  notaRiscos: [],
  corpoMinuta: "DOS FATOS\n\nAlgo aconteceu.\n\nTermos em que pede deferimento.",
  tituloPeca: "Réplica — Processo nº 123",
};

const meta: MetadadosPeticaoDocx = {
  confirmadoPorNome: "Camila Prado",
  confirmadoPorOab: "GO 34.221",
  confirmadoEm: new Date(2026, 8, 21, 14, 40),
  sessaoId: "a294f1e0",
};

function lerXml(buffer: Buffer, caminho: string): string {
  const zip = new PizZip(buffer);
  const arquivo = zip.file(caminho);
  verdade(!!arquivo, `${caminho} deveria existir no .docx gerado`);
  return arquivo!.asText();
}

teste("gera um .docx válido do zero (sem timbrado)", () => {
  const buffer = montarPeticaoWord(dados, meta, null);
  const doc = lerXml(buffer, "word/document.xml");
  verdade(doc.includes("Termos em que pede deferimento"), "fecho deveria estar no corpo");
  verdade(doc.includes("MINUTA GERADA POR IA"), "nota obrigatória deveria estar no corpo");
});

teste("HARD GATE: metadado de rascunho de IA está sempre presente, mesmo sem timbrado", () => {
  const buffer = montarPeticaoWord(dados, meta, null);
  const custom = lerXml(buffer, "docProps/custom.xml");
  verdade(custom.includes("LumenPeticionamentoRascunhoIA"), "propriedade de rascunho de IA ausente");
  verdade(custom.includes(">true<"), "rascunho de IA deveria valer true");
  verdade(custom.includes("Camila Prado") && custom.includes("GO 34.221"), "quem confirmou deveria constar");
  verdade(custom.includes("a294f1e0"), "id da sessão deveria constar");
});

teste("HARD GATE: [Content_Types].xml e _rels/.rels declaram a nova parte de metadados", () => {
  const buffer = montarPeticaoWord(dados, meta, null);
  const tipos = lerXml(buffer, "[Content_Types].xml");
  const rels = lerXml(buffer, "_rels/.rels");
  verdade(tipos.includes("docProps/custom.xml"), "Content_Types deveria declarar docProps/custom.xml");
  verdade(rels.includes("docProps/custom.xml"), "_rels/.rels deveria referenciar docProps/custom.xml");
});

teste("nota de riscos vazia: bloco não aparece no corpo", () => {
  const buffer = montarPeticaoWord(dados, meta, null);
  const doc = lerXml(buffer, "word/document.xml");
  igual(doc.includes("RISCOS IDENTIFICADOS"), false);
});

teste("nota de riscos preenchida: aparece, com o selo 'aponta, não decide'", () => {
  const buffer = montarPeticaoWord({ ...dados, notaRiscos: ["Não há prova de X — considerar."] }, meta, null);
  const doc = lerXml(buffer, "word/document.xml");
  verdade(doc.includes("RISCOS IDENTIFICADOS"), "bloco de riscos deveria aparecer");
  verdade(doc.includes("aponta, não decide"), "selo deveria aparecer");
  verdade(doc.includes("considerar"), "texto do risco deveria estar presente");
});

teste("timbrado: metadado é acrescentado SEM apagar o conteúdo original do timbrado", () => {
  // Um .docx mínimo simulando um timbrado real, com um parágrafo próprio antes do sectPr.
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>LOGOTIPO DO ESCRITÓRIO FICTÍCIO</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  const timbradoBuffer = zip.generate({ type: "nodebuffer" });

  const buffer = montarPeticaoWord(dados, meta, timbradoBuffer);
  const doc = lerXml(buffer, "word/document.xml");
  verdade(doc.includes("LOGOTIPO DO ESCRITÓRIO FICTÍCIO"), "conteúdo do timbrado não pode ser apagado");
  verdade(doc.includes("Termos em que pede deferimento"), "corpo da peça deveria ter sido acrescentado");
  const custom = lerXml(buffer, "docProps/custom.xml");
  verdade(custom.includes("LumenPeticionamentoRascunhoIA"), "HARD GATE: metadado obrigatório também no caminho com timbrado");
});

teste("timbrado malformado (sem word/document.xml): erro claro, nunca falha em silêncio", () => {
  const zip = new PizZip();
  zip.file("oi.txt", "não é um docx");
  const timbradoFalso = zip.generate({ type: "nodebuffer" });
  let lancou = false;
  try {
    montarPeticaoWord(dados, meta, timbradoFalso);
  } catch {
    lancou = true;
  }
  igual(lancou, true, "timbrado malformado deveria lançar erro, nunca gerar arquivo quebrado em silêncio");
});

resumo("Peticionamento — geração do .docx");
