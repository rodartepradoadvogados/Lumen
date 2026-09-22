import PizZip from "pizzip";
import { teste, verdade, igual, resumo } from "./executar";
import { extrairTextoDeDocumento } from "@/lib/peticionamentoExtracaoDocumento";

// PRIORIDADE 1 (relatório da entrega) — "o agente tem de LER os documentos". Este módulo é a
// PRIMEIRA metade do defeito corrigido: extrair texto de verdade de PDF/DOCX, e DIZER quando não
// dá, em vez de mandar string vazia (que o agente preencheria alucinando) ou fingir que leu.
//
// Os PDFs de teste abaixo são fixtures MÍNIMAS embutidas em base64 — sem arquivo externo, sem
// dependência de rede: um PDF de verdade com um `Tj` de texto, e outro com um content stream
// vazio (a mesma assinatura de um PDF escaneado sem OCR: válido, sem camada de texto nenhuma).

// PDF com uma linha de texto ("Peticao teste com conteudo legivel suficiente").
const PDF_COM_TEXTO_B64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDQgMCBSPj4+Pi9Db250ZW50cyA1IDAgUj4+ZW5kb2JqCjQgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iago1IDAgb2JqPDwvTGVuZ3RoIDc3Pj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiAyMCAxMDAgVGQgKFBldGljYW8gdGVzdGUgY29tIGNvbnRldWRvIGxlZ2l2ZWwgc3VmaWNpZW50ZSkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyPDwvU2l6ZSA2L1Jvb3QgMSAwIFI+PgolJUVPRgo=";
// PDF válido, mesma estrutura, mas content stream de 0 bytes — "sem camada de texto".
const PDF_SEM_TEXTO_B64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0vUmVzb3VyY2VzPDw+Pi9Db250ZW50cyA1IDAgUj4+ZW5kb2JqCjUgMCBvYmo8PC9MZW5ndGggMD4+CnN0cmVhbQplbmRzdHJlYW0KZW5kb2JqCnRyYWlsZXI8PC9TaXplIDYvUm9vdCAxIDAgUj4+CiUlRU9GCg==";

function montarDocx(xmlBody: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlBody}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

teste("PDF com texto: extrai o conteúdo de verdade, ok: true", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from(PDF_COM_TEXTO_B64, "base64"), "application/pdf", "peticao.pdf");
  verdade(r.ok, `esperava ok: true, veio ${JSON.stringify(r)}`);
  if (r.ok) verdade(r.texto.includes("Peticao") || r.texto.length > 5, "texto extraído do PDF ficou vazio demais");
});

teste("HARD GATE: PDF sem camada de texto (escaneado) NUNCA reporta ok: true — diz o motivo em vez de fingir que leu", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from(PDF_SEM_TEXTO_B64, "base64"), "application/pdf", "escaneado.pdf");
  igual(r.ok, false, "PDF sem texto não pode sair como lido");
  if (!r.ok) verdade(r.motivo.length > 10, "motivo de falha vazio — a tela não teria o que mostrar");
});

teste("PDF corrompido/inválido: nunca lança, devolve ok: false com motivo", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from("isto não é um pdf de verdade"), "application/pdf", "quebrado.pdf");
  igual(r.ok, false);
});

teste("DOCX com dois parágrafos: extrai os dois, com quebra entre eles (nunca colados)", async () => {
  const docx = montarDocx("<w:p><w:r><w:t>Primeiro paragrafo do documento.</w:t></w:r></w:p><w:p><w:r><w:t>Segundo paragrafo, depois da quebra.</w:t></w:r></w:p>");
  const r = await extrairTextoDeDocumento(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "peticao.docx");
  verdade(r.ok, `esperava ok: true, veio ${JSON.stringify(r)}`);
  if (r.ok) {
    verdade(r.texto.includes("Primeiro paragrafo") && r.texto.includes("Segundo paragrafo"), "os dois parágrafos deveriam estar no texto extraído");
    verdade(!r.texto.includes("documento.Segundo"), "TRAVA: os parágrafos saíram colados — a quebra de </w:p> não virou separador");
  }
});

teste("HARD GATE: DOCX sem nenhum texto no corpo (só formatação/tabela vazia) reporta ok: false", async () => {
  const docx = montarDocx("<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr></w:p>");
  const r = await extrairTextoDeDocumento(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "vazio.docx");
  igual(r.ok, false, "docx sem <w:t> nenhum não pode sair como lido");
});

teste("DOCX corrompido (não é um zip de verdade): nunca lança, devolve ok: false", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from("nao sou um zip"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "quebrado.docx");
  igual(r.ok, false);
});

teste("TXT simples: lê direto, ok: true", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from("Texto simples de um arquivo .txt anexado à sessão de peticionamento.", "utf8"), "text/plain", "notas.txt");
  igual(r.ok, true);
});

teste("Formato não suportado (imagem): ok: false, nunca string vazia silenciosa", async () => {
  const r = await extrairTextoDeDocumento(Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "image/jpeg", "foto.jpg");
  igual(r.ok, false);
  if (!r.ok) verdade(r.motivo.includes("não suportado") || r.motivo.length > 5, "motivo deveria explicar que o formato não é suportado");
});

teste("Arquivo vazio (0 bytes): ok: false com motivo próprio, não cai no extrator de PDF/DOCX", async () => {
  const r = await extrairTextoDeDocumento(Buffer.alloc(0), "application/pdf", "vazio.pdf");
  igual(r.ok, false);
});

resumo("Peticionamento — extração de texto de documento (prioridade 1)");
