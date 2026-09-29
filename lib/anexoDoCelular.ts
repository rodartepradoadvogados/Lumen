// ============================================================================
// ENVIAR ARQUIVO PELO CELULAR PARA O ATENDIMENTO (PR 9) — a regra pura (sem banco, sem React).
//
// NÃO É ENVIO AO CLIENTE. O arquivo vai para os Anexos do atendimento (Drive do escritório), o mesmo lugar e o
// mesmo fluxo do site (Vercel Blob -> Drive, lib/actions/attachments.ts:finalizeAttachmentUpload). Mandar mídia
// ao cliente pelo WhatsApp é outra etapa (PR 14).
//
// LIMITE: 25 MB, o MESMO de app/api/attachments/blob-token/route.ts (o token do Blob recusa mais que isso; o
// teste compara os dois números). TIPOS: o site aceita qualquer arquivo; o celular, onde o arquivo vem da
// galeria, da câmera ou de "Arquivos", aceita uma lista de documentos, imagens, áudio e vídeo. Programa, script
// e página (exe, bat, js, html, svg...) ficam de fora: o anexo abre numa aba do navegador de quem o consulta.
// ============================================================================

export const LIMITE_DO_ANEXO_BYTES = 25 * 1024 * 1024;

export const EXTENSOES_ACEITAS = [
  "pdf", "doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx",
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
  "mp3", "m4a", "ogg", "opus", "aac", "amr", "wav",
  "mp4", "mov", "webm", "3gp",
  "zip",
] as const;

/** O `accept` do input: as extensões, para o seletor do aparelho já filtrar. */
export const ACCEPT_DO_ANEXO = EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",");
/** A câmera pede só foto: um único tipo, e o aparelho abre a câmera. */
export const ACCEPT_DA_CAMERA = "image/*";

const PREFIXOS_DE_TIPO_ACEITOS = ["image/", "audio/", "video/"];

export function extensaoDoNome(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Nome para gravar: sem caminho (o Windows manda `C:\x\y.pdf`), sem controle, no máximo 120 caracteres, com a extensão preservada. */
export function nomeDoAnexo(bruto: string): string {
  const semCaminho = bruto.split(/[\\/]/).pop() ?? "";
  const limpo = semCaminho.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  if (limpo.length <= 120) return limpo;
  const ext = extensaoDoNome(limpo);
  return ext ? `${limpo.slice(0, 120 - ext.length - 1).trimEnd()}.${ext}` : limpo.slice(0, 120);
}

export type ArquivoDoCelular = { name: string; size: number; type: string };

/**
 * Pode subir? Frases para a pessoa. Foto da câmera às vezes vem sem nome ou sem extensão (`image.jpg`,
 * ou nada): imagem sem extensão aceita pelo tipo (`image/*`), e a extensão que faltava é a que o tipo diz.
 */
export function validarArquivoDoCelular(a: ArquivoDoCelular): { ok: true } | { ok: false; erro: string } {
  if (!Number.isFinite(a.size) || a.size <= 0) return { ok: false, erro: "O arquivo está vazio." };
  if (a.size > LIMITE_DO_ANEXO_BYTES) return { ok: false, erro: `O arquivo passa de ${LIMITE_DO_ANEXO_BYTES / (1024 * 1024)} MB. Envie um menor ou use o Lúmen no computador.` };
  const ext = extensaoDoNome(a.name);
  const tipo = (a.type || "").toLowerCase();
  if (ext) {
    if (!(EXTENSOES_ACEITAS as readonly string[]).includes(ext)) return { ok: false, erro: `Arquivo .${ext} não é aceito. Envie PDF, Word, Excel, imagem, áudio, vídeo ou zip.` };
    return { ok: true };
  }
  if (PREFIXOS_DE_TIPO_ACEITOS.some((p) => tipo.startsWith(p)) && !tipo.includes("svg")) return { ok: true };
  return { ok: false, erro: "Não foi possível saber o tipo deste arquivo. Renomeie com a extensão (por exemplo, .pdf) e envie de novo." };
}

const EXTENSAO_DO_TIPO: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/aac": "aac", "audio/wav": "wav",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

/** Nome final: o dado pela pessoa, ou o do arquivo; e, se não tem extensão, a do tipo (foto da câmera). */
export function nomeFinalDoAnexo(nomeDado: string, arquivo: ArquivoDoCelular): string {
  const base = nomeDoAnexo(nomeDado) || nomeDoAnexo(arquivo.name) || "foto";
  if (extensaoDoNome(base)) return base;
  const ext = EXTENSAO_DO_TIPO[(arquivo.type || "").toLowerCase()];
  return ext ? `${base}.${ext}` : base;
}

/** Desfazer só vale para quem enviou, logo depois, e nunca para a mídia que o cliente mandou pelo WhatsApp. */
export const JANELA_DO_DESFAZER_MS = 10 * 60 * 1000;

export function podeDesfazerAnexo(
  a: { uploadedById: string | null; createdAt: Date; docType: string },
  quem: { id: string },
  agora: Date,
): boolean {
  if (a.docType === "MIDIA_WHATSAPP") return false;
  if (!a.uploadedById || a.uploadedById !== quem.id) return false;
  const idade = agora.getTime() - a.createdAt.getTime();
  return idade >= 0 && idade <= JANELA_DO_DESFAZER_MS;
}
