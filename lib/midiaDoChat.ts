// ============================================================================
// A MÍDIA NO BALÃO DO CHAT (PR 8 do aplicativo de Atendimento) — a parte que não toca em banco nem em
// React: que tipos o servidor entrega "na tela", o recorte de bytes que o player pede (Range), os cabeçalhos
// da resposta e as frases de tamanho/tipo do cartão.
//
// O ARQUIVO SAI SÓ PELA ROTA AUTENTICADA `/api/atendimento/[id]/midia/[mensagemId]` (recorte de acesso do
// Atendimento: 401 / 403 / 404). Nunca a URL do Drive, nunca um endereço público adivinhável. A rota confere
// o dono da conversa ANTES de olhar a mensagem e a mensagem ANTES de olhar o arquivo.
//
// O QUE O SERVIDOR ENTREGA INLINE. Só o que o navegador desenha ou toca sem executar nada: imagem raster,
// áudio, vídeo e PDF. Tudo o mais (SVG, HTML, XML, script, Office, zip, tipo desconhecido) vai como
// `octet-stream` + `attachment` — o navegador baixa em vez de abrir. `nosniff` em toda resposta: o tipo que
// a rota disse é o tipo que vale. O tipo vem do que o Drive devolveu, mas SÓ vale se estiver na lista; o
// nome do arquivo (que o cliente escolheu) nunca decide o tipo de uma resposta.
// ============================================================================

/** Acima disto a rota não abre o arquivo no aplicativo (a memória da função é finita). O WhatsApp limita a 16 MB. */
export const LIMITE_DA_MIDIA_BYTES = 30 * 1024 * 1024;

const INLINE: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "audio/ogg": "audio/ogg",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/aac": "audio/aac",
  "audio/amr": "audio/amr",
  "audio/webm": "audio/webm",
  "audio/wav": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "video/mp4": "video/mp4",
  "video/webm": "video/webm",
  "video/3gpp": "video/3gpp",
  "video/quicktime": "video/quicktime",
  "application/pdf": "application/pdf",
};

const EXTENSAO_PARA_TIPO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  amr: "audio/amr",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mov: "video/quicktime",
  pdf: "application/pdf",
};

/** O tipo sem parâmetros ("audio/ogg; codecs=opus" -> "audio/ogg"), em minúsculas. */
export function tipoBase(mime: string | null | undefined): string {
  return (mime || "").split(";")[0].trim().toLowerCase();
}

function extensaoDe(nome: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec((nome || "").trim());
  return m ? m[1].toLowerCase() : "";
}

export type TipoParaServir = { contentType: string; inline: boolean };

/**
 * Que Content-Type e que disposição a resposta leva. O tipo do Drive manda quando é um dos da lista; o Drive
 * às vezes devolve `application/octet-stream` (Dropbox), e aí a extensão do NOME DO ARQUIVO NO DRIVE (montado
 * pelo Lúmen, não pelo cliente) escolhe entre os mesmos tipos seguros. Nada fora da lista sai inline.
 */
export function tipoParaServir(mimeDoDrive: string | null | undefined, nome: string | null | undefined): TipoParaServir {
  const base = tipoBase(mimeDoDrive);
  if (INLINE[base]) return { contentType: INLINE[base], inline: true };
  if (!base || base === "application/octet-stream" || base === "binary/octet-stream") {
    const porExtensao = EXTENSAO_PARA_TIPO[extensaoDe(nome)];
    if (porExtensao) return { contentType: porExtensao, inline: true };
  }
  return { contentType: "application/octet-stream", inline: false };
}

// ── RANGE (o player de áudio e de vídeo do iPhone só toca se o servidor souber responder a um recorte) ──────

export type FaixaDeBytes = { inicio: number; fim: number };

/**
 * Lê `Range: bytes=...` para um arquivo de `total` bytes.
 *   `null`            sem cabeçalho (ou de outra unidade): serve o arquivo inteiro (200).
 *   `"invalida"`      pedido fora do arquivo ou malformado: 416.
 *   `{inicio, fim}`   o recorte (fim inclusivo), 206. Só uma faixa: várias viram a primeira.
 */
export function lerFaixa(cabecalho: string | null | undefined, total: number): FaixaDeBytes | "invalida" | null {
  if (!cabecalho) return null;
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(cabecalho);
  if (!m) return null;
  const primeira = m[1].split(",")[0].trim();
  const p = /^(\d*)\s*-\s*(\d*)$/.exec(primeira);
  if (!p || (p[1] === "" && p[2] === "")) return "invalida";
  if (total <= 0) return "invalida";
  if (p[1] === "") {
    const sufixo = Number(p[2]);
    if (!Number.isSafeInteger(sufixo) || sufixo <= 0) return "invalida";
    return { inicio: Math.max(0, total - sufixo), fim: total - 1 };
  }
  const inicio = Number(p[1]);
  if (!Number.isSafeInteger(inicio) || inicio >= total) return "invalida";
  let fim = p[2] === "" ? total - 1 : Number(p[2]);
  if (!Number.isSafeInteger(fim) || fim < inicio) return "invalida";
  if (fim > total - 1) fim = total - 1;
  return { inicio, fim };
}

// ── CABEÇALHOS ────────────────────────────────────────────────────────────────────────────────────────────

/** Nome de arquivo seguro para o cabeçalho: sem barra, aspas, quebra de linha nem caractere de controle. */
export function nomeSeguroParaCabecalho(nome: string | null | undefined): string {
  const limpo = (nome || "arquivo")
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
    .replace(/[\r\n]/g, "_")
    .trim()
    .slice(0, 120);
  return limpo || "arquivo";
}

/**
 * Os cabeçalhos de uma resposta de mídia. `Cache-Control: private, no-store`: o navegador não guarda o
 * arquivo nem o entrega a outra pessoa que use o mesmo aparelho depois do Sair. `Vary: Cookie` porque a
 * resposta depende de quem pergunta. `nosniff`, `CORP: same-origin` e `no-referrer` fecham o resto. A
 * `Content-Security-Policy: sandbox` vale para tudo, menos para o PDF (o leitor de PDF do navegador não abre
 * dentro de um sandbox).
 */
export function cabecalhosDaMidia(t: TipoParaServir, nomeDoArquivo: string | null | undefined, forcarDownload: boolean): Record<string, string> {
  const nome = nomeSeguroParaCabecalho(nomeDoArquivo);
  const emBytes = encodeURIComponent(nome);
  const disposicao = t.inline && !forcarDownload ? "inline" : "attachment";
  const h: Record<string, string> = {
    "Content-Type": t.contentType,
    "Content-Disposition": `${disposicao}; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${emBytes}`,
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
  };
  if (t.contentType !== "application/pdf") h["Content-Security-Policy"] = "default-src 'none'; sandbox";
  return h;
}

// ── O CARTÃO (tamanho e tipo em português) ─────────────────────────────────────────────────────────────────

/** "1,2 MB", "340 KB", "800 B". Nulo, negativo ou inválido: "" (o cartão omite em vez de inventar). */
export function tamanhoLegivel(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`.replace(".", ",");
}

const ROTULO_DA_EXTENSAO: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Planilha",
  xlsx: "Planilha",
  csv: "Planilha",
  ppt: "Apresentação",
  pptx: "Apresentação",
  txt: "Texto",
  zip: "Arquivo compactado",
  rar: "Arquivo compactado",
  jpg: "Imagem",
  jpeg: "Imagem",
  png: "Imagem",
  mp4: "Vídeo",
  mov: "Vídeo",
  mp3: "Áudio",
  ogg: "Áudio",
};

/** "PDF", "Word", "Planilha"... a partir do tipo e, na falta dele, do nome; "Arquivo" quando não dá para saber. */
export function tipoLegivel(mime: string | null | undefined, nome: string | null | undefined): string {
  const base = tipoBase(mime);
  if (base === "application/pdf") return "PDF";
  if (base.includes("wordprocessingml") || base === "application/msword") return "Word";
  if (base.includes("spreadsheetml") || base === "application/vnd.ms-excel" || base === "text/csv") return "Planilha";
  if (base.includes("presentationml") || base === "application/vnd.ms-powerpoint") return "Apresentação";
  if (base === "text/plain") return "Texto";
  if (base.startsWith("video/")) return "Vídeo";
  if (base.startsWith("audio/")) return "Áudio";
  if (base.startsWith("image/")) return "Imagem";
  return ROTULO_DA_EXTENSAO[extensaoDe(nome)] ?? "Arquivo";
}

/** O endereço que o balão usa. O id da mensagem e o da conversa são codificados; nada mais entra na URL. */
export function enderecoDaMidia(idDaConversa: string, idDaMensagem: string, opcoes: { baixar?: boolean; tentativa?: number } = {}): string {
  const q: string[] = [];
  if (opcoes.baixar) q.push("baixar=1");
  if (opcoes.tentativa) q.push(`t=${opcoes.tentativa}`);
  return `/api/atendimento/${encodeURIComponent(idDaConversa)}/midia/${encodeURIComponent(idDaMensagem)}${q.length ? `?${q.join("&")}` : ""}`;
}

/** O id da mensagem na URL é palpite: só formato de id (cuid/uuid) passa a chegar ao banco. */
export function idDeMensagemValido(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** As frases da rota. Uma por caso, sem id, sem endereço do Drive e sem o texto do erro do provedor. */
export const FRASES_DA_MIDIA = {
  naoEncontrado: "Não encontrado",
  indisponivel: "Arquivo indisponível: ele não está mais guardado no Drive do escritório.",
  grandeDemais: "Arquivo grande demais para abrir aqui. Abra a pasta do atendimento no Drive.",
  falhaNoDrive: "Não foi possível buscar o arquivo agora. Tente de novo em instantes.",
  faixaInvalida: "Trecho pedido fora do arquivo.",
} as const;
