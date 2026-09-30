import type { FamiliaDeConteudo } from "@/lib/midiaDeSaida";

// ============================================================================
// O TIPO DETECTADO PELO CONTEÚDO (servidor). A extensão e o `type` que o navegador declara são palpite de quem
// envia; os primeiros bytes do arquivo não. Aqui se lê a "assinatura" e se decide:
//   1. é programa, script ou página (mesmo com nome de imagem)? -> recusa, para QUALQUER extensão;
//   2. a família detectada é uma das que a extensão exige? -> senão, recusa ("o conteúdo não confere").
// Sem dependência de biblioteca e sem `crypto`: só bytes.
// ============================================================================

const ASCII = (b: Uint8Array, de: number, s: string) => {
  if (b.length < de + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[de + i] !== s.charCodeAt(i)) return false;
  return true;
};

const MINUSCULO = (b: Uint8Array, de: number, ate: number) => {
  let s = "";
  for (let i = de; i < Math.min(ate, b.length); i++) s += String.fromCharCode(b[i] < 128 ? b[i] : 63);
  return s.toLowerCase();
};

/** Programa (Windows, Linux, macOS, Java), script com shebang (menos AMR, que também começa por "#!") ou página/SVG/XML. */
export function pareceExecutavelOuPagina(b: Uint8Array): string | null {
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return "programa do Windows";
  if (ASCII(b, 0, "\x7fELF")) return "programa do Linux";
  if (b.length >= 4) {
    const m = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (m === 0xfeedface || m === 0xfeedfacf || m === 0xcefaedfe || m === 0xcffaedfe) return "programa do macOS";
    if (m === 0xcafebabe) return "programa Java/macOS";
  }
  if (ASCII(b, 0, "#!") && !ASCII(b, 0, "#!AMR")) return "script";
  // Página, SVG, XML e script embutido: o começo do arquivo (depois de espaços e do BOM) é uma marcação.
  let i = 0;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  if (i < b.length && b[i] === 0x3c) return "página ou marcação (HTML, SVG, XML)";
  const inicio = MINUSCULO(b, 0, 1024);
  if (/<\s*(!doctype\s+html|html|svg|script|iframe|body|head)\b/.test(inicio)) return "página ou marcação (HTML, SVG, XML)";
  return null;
}

/** A família do conteúdo, ou null quando não bate com nenhuma das que o Lúmen envia. */
export function detectarFamiliaDeConteudo(b: Uint8Array): FamiliaDeConteudo | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ASCII(b, 1, "PNG\r\n\x1a\n")) return "png";
  if (ASCII(b, 0, "RIFF") && ASCII(b, 8, "WEBP")) return "webp";
  if (ASCII(b, 0, "OggS")) return "ogg";
  if (ASCII(b, 0, "#!AMR")) return "amr";
  if (ASCII(b, 4, "ftyp")) {
    const marca = MINUSCULO(b, 8, 12);
    if (marca === "m4a " || marca === "m4b " || marca === "m4p ") return "m4a";
    if (marca.startsWith("3gp") || marca.startsWith("3g2")) return "3gp";
    if (marca === "qt  " || marca === "heic" || marca === "heix" || marca === "mif1" || marca === "msf1" || marca === "avif" || marca === "avis" || marca === "hevc") return null;
    return "mp4";
  }
  if (ASCII(b, 0, "ID3")) return "mp3";
  if (b.length >= 2 && b[0] === 0xff) {
    // Quadro de áudio MPEG (sincronia 11 bits) ou ADTS/AAC (0xFFF1 / 0xFFF9).
    if ((b[1] & 0xf6) === 0xf0) return "aac";
    if ((b[1] & 0xe0) === 0xe0) return "mp3";
  }
  const pdf = MINUSCULO(b, 0, 1024).indexOf("%pdf-");
  if (pdf >= 0) return "pdf";
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) return "ole";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)) return "zip";
  // Texto: sem byte nulo nos primeiros 8 KB (e sem marcação, já recusada acima).
  const n = Math.min(b.length, 8192);
  for (let i = 0; i < n; i++) if (b[i] === 0) return null;
  return "texto";
}

export type VereditoDoConteudo = { ok: true; familia: FamiliaDeConteudo } | { ok: false; erro: string };

/** O conteúdo confere com a extensão? `esperadas` vem de `classificarArquivoDeSaida(...).familias`. */
export function conferirConteudo(b: Uint8Array, esperadas: FamiliaDeConteudo[]): VereditoDoConteudo {
  const perigo = pareceExecutavelOuPagina(b);
  if (perigo) return { ok: false, erro: `O conteúdo do arquivo é ${perigo}. Esse tipo de arquivo não pode ser enviado ao cliente.` };
  const familia = detectarFamiliaDeConteudo(b);
  if (!familia || !esperadas.includes(familia)) {
    return { ok: false, erro: "O conteúdo do arquivo não confere com o tipo do nome (ou o formato não é aceito pelo WhatsApp). Confira o arquivo e envie de novo." };
  }
  return { ok: true, familia };
}
