// EXTRAÇÃO DE TEXTO de documento anexado/vinculado ao Peticionamento — o defeito que esta
// entrega corrige (relatório da entrega, prioridade 1 do dono): até aqui só o NOME do arquivo
// era mandado ao agente Hermes, o conteúdo nunca. Este módulo lê PDF e DOCX de verdade; para o
// que não dá para ler (imagem, PDF digitalizado sem camada de texto, formato não suportado),
// devolve o MOTIVO em vez de fingir — quem chama (lib/actions/peticionamento.ts) nunca lista um
// documento como "consultado" quando a extração aqui devolveu `ok: false`.
//
// Módulo quase-puro: recebe o BUFFER já baixado (a I/O de buscar no Google Drive, sempre atrás
// da reconferência de officeId, mora em lib/actions/peticionamento.ts) e devolve texto ou motivo
// de falha. Nunca grava nada, nunca loga o conteúdo (documento de cliente é dado sob sigilo).

import PizZip from "pizzip";
import { getDocumentProxy, extractText } from "unpdf";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

export type ResultadoExtracao = { ok: true; texto: string } | { ok: false; motivo: string };

// Abaixo disto, trata como "sem texto extraível" — um PDF escaneado por imagem (sem camada de
// texto) devolve string vazia ou quase vazia do extrator, nunca um erro; sem este piso, a sessão
// mandaria uma string vazia ao Hermes e ELE poderia alucinar conteúdo para preencher o vazio.
const LIMIAR_MINIMO_DE_CARACTERES = 10;

// 20 MB — um PDF/DOCX maior que isso quase certo tem imagem embutida em alta resolução; ler tudo
// na memória de uma função serverless para extrair só texto não vale o risco de estourar memória.
// (O limite de anexo da sessão já é 25 MB — lib/actions/peticionamento.ts:anexarNovoDocumento —
// este piso aqui é sobre o que vale a pena PROCESSAR, não sobre o que pode ser anexado.)
const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024;

function ehPdf(mimeType: string, nomeArquivo: string): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(nomeArquivo);
}

function ehDocx(mimeType: string, nomeArquivo: string): boolean {
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(nomeArquivo);
}

function ehTextoSimples(mimeType: string, nomeArquivo: string): boolean {
  return mimeType.startsWith("text/plain") || /\.txt$/i.test(nomeArquivo);
}

async function extrairDePdf(buffer: Buffer): Promise<ResultadoExtracao> {
  try {
    // verbosity: 0 — silencia os avisos internos do pdf.js (ex.: "Indexing all PDF objects" em
    // PDF sem xref bem formado). Nunca imprime conteúdo do documento; é só ruído de parser.
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: true });
    const semEspacoSobrando = text.replace(/[ \t]+/g, " ").trim();
    if (semEspacoSobrando.length < LIMIAR_MINIMO_DE_CARACTERES) {
      return { ok: false, motivo: "PDF sem camada de texto (provavelmente digitalizado por imagem/scanner) — não foi possível extrair conteúdo. Considere rodar OCR antes de anexar." };
    }
    return { ok: true, texto: text };
  } catch (e) {
    return { ok: false, motivo: `Não foi possível ler o PDF (${mensagemDeErro(e)}).` };
  }
}

// Decodifica só as cinco entidades XML previstas no padrão OOXML — nunca um parser de HTML
// inteiro (peso desnecessário para 5 substituições, e o corpo de um `<w:t>` não contém marcação
// HTML de verdade, só texto escapado do mesmo jeito que lib/peticionamentoDocx.ts:esc escreve).
function decodificarEntidadesXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// DOCX é um .zip com XML dentro — lê o texto de word/document.xml na unha. PizZip já é
// dependência da casa (lib/peticionamentoDocx.ts GERA .docx com ele); ler com a mesma lib evita
// trazer mais uma dependência só para o sentido inverso da mesma operação.
function extrairDeDocx(buffer: Buffer): ResultadoExtracao {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch (e) {
    return { ok: false, motivo: `Arquivo .docx inválido ou corrompido (${mensagemDeErro(e)}).` };
  }
  const arquivoXml = zip.file("word/document.xml");
  if (!arquivoXml) {
    return { ok: false, motivo: "Arquivo .docx sem word/document.xml — formato inesperado (pode ser um .doc antigo salvo com a extensão trocada)." };
  }
  let xml: string;
  try {
    xml = arquivoXml.asText();
  } catch (e) {
    return { ok: false, motivo: `Não foi possível ler o conteúdo do .docx (${mensagemDeErro(e)}).` };
  }
  // Marca quebra de parágrafo/linha/tabulação ANTES de tirar as tags — depois de removidas, a
  // fronteira entre "</w:p><w:p>" (dois parágrafos colados) e o texto de dentro já teria sumido.
  const comQuebras = xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  // Todo texto visível de um .docx vive dentro de tags folha (<w:t>, principalmente) — remover
  // TODA marcação restante e ficar só com o que sobrar entre tags é robusto o bastante para o
  // corpo do documento (cabeçalho/rodapé/comentário vivem em partes SEPARADAS do zip, fora do
  // escopo desta extração — o corpo é o que importa para uma minuta).
  const semTags = comQuebras.replace(/<[^>]+>/g, "");
  const texto = decodificarEntidadesXml(semTags).replace(/\n{3,}/g, "\n\n").trim();
  if (texto.length < LIMIAR_MINIMO_DE_CARACTERES) {
    return { ok: false, motivo: "Documento .docx sem texto legível no corpo (pode conter só imagens/tabelas sem texto)." };
  }
  return { ok: true, texto };
}

function extrairDeTextoSimples(buffer: Buffer): ResultadoExtracao {
  const texto = buffer.toString("utf8").trim();
  if (texto.length < LIMIAR_MINIMO_DE_CARACTERES) {
    return { ok: false, motivo: "Arquivo de texto vazio ou vazio demais para ser útil." };
  }
  return { ok: true, texto };
}

/**
 * Ponto único de entrada — decide o formato pelo mimeType (ou pela extensão, quando o Drive
 * devolve um mimeType genérico) e delega. Formato não reconhecido NUNCA é tratado como "sem
 * conteúdo" (string vazia silenciosa): sempre `ok: false` com o motivo, para a tela e a nota
 * obrigatória dizerem que este documento não entrou na leitura do agente.
 */
export async function extrairTextoDeDocumento(buffer: Buffer, mimeType: string, nomeArquivo: string): Promise<ResultadoExtracao> {
  if (buffer.length === 0) return { ok: false, motivo: "Arquivo vazio (0 bytes)." };
  if (buffer.length > TAMANHO_MAXIMO_BYTES) {
    return { ok: false, motivo: `Arquivo maior que ${TAMANHO_MAXIMO_BYTES / (1024 * 1024)} MB — não foi processado para extração de texto.` };
  }
  if (ehPdf(mimeType, nomeArquivo)) return extrairDePdf(buffer);
  if (ehDocx(mimeType, nomeArquivo)) return extrairDeDocx(buffer);
  if (ehTextoSimples(mimeType, nomeArquivo)) return extrairDeTextoSimples(buffer);
  return { ok: false, motivo: `Formato "${mimeType || "desconhecido"}" não suportado para leitura automática nesta versão (aceitos: PDF, DOCX, TXT).` };
}
