// ============================================================================
// MÍDIA DE SAÍDA PELO CELULAR (R3, PR 14 do aplicativo de Atendimento) — as regras puras (sem banco, sem rede,
// sem React, sem `crypto` do Node: este arquivo vai para o navegador E é a fonte que o servidor usa para recusar).
//
// O ARQUIVO VAI AO CLIENTE PELO WHATSAPP. Ao contrário do anexo (lib/anexoDoCelular.ts, que fica no Drive),
// enviar é irreversível. Por isso a lista é FECHADA e POR PROVEDOR:
//   - o que o provedor aceita de fato (a Meta recusa webp e zip, por exemplo; a Evolution aceita);
//   - nunca executável, página, script, SVG (a extensão manda, em QUALQUER segmento do nome, e o servidor
//     ainda confere o conteúdo: lib/midiaDeSaidaConteudo.ts);
//   - limites de tamanho por tipo (os do WhatsApp) e o teto do upload da plataforma (25 MB).
//
// A tela usa isto para avisar cedo; o SERVIDOR repete tudo (a tela pode ser contornada) e é ele que vale.
// ============================================================================

import { LIMITE_DO_ANEXO_BYTES } from "@/lib/anexoDoCelular";

export type ProvedorDoWhatsapp = "META" | "EVOLUTION";
export type TipoDeSaida = "imagem" | "video" | "audio" | "documento";

/** Os limites do WhatsApp (Cloud API). O de documento é 100 MB no WhatsApp, mas o upload da plataforma para em 25 MB. */
export const LIMITE_DA_PLATAFORMA_BYTES = LIMITE_DO_ANEXO_BYTES;
export const LIMITE_POR_TIPO: Record<TipoDeSaida, number> = {
  imagem: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  documento: Math.min(100 * 1024 * 1024, LIMITE_DA_PLATAFORMA_BYTES),
};

/** A legenda do WhatsApp vai até 1024 caracteres. Áudio não tem legenda. */
export const LIMITE_DA_LEGENDA = 1024;

export const ROTULO_DO_TIPO_DE_SAIDA: Record<TipoDeSaida, string> = { imagem: "imagem", video: "vídeo", audio: "áudio", documento: "documento" };
const ESTE_ESTA: Record<TipoDeSaida, string> = { imagem: "Esta imagem", video: "Este vídeo", audio: "Este áudio", documento: "Este documento" };

/** Que "família de conteúdo" cada extensão exige que o arquivo tenha de verdade (conferida no servidor). */
export type FamiliaDeConteudo = "jpeg" | "png" | "webp" | "mp4" | "3gp" | "ogg" | "mp3" | "aac" | "m4a" | "amr" | "pdf" | "ole" | "zip" | "texto";

type Entrada = { tipo: TipoDeSaida; mime: string; familias: FamiliaDeConteudo[] };

const OFFICE_ZIP: FamiliaDeConteudo[] = ["zip"];

// O QUE A META (Cloud API) ACEITA: imagem só jpeg/png (webp é só figurinha); vídeo mp4/3gp (H.264 + AAC); áudio aac, m4a,
// mp3, amr, ogg (opus); documento pdf, Office e txt. Zip e planilha csv NÃO.
const EXTENSOES_META: Record<string, Entrada> = {
  jpg: { tipo: "imagem", mime: "image/jpeg", familias: ["jpeg"] },
  jpeg: { tipo: "imagem", mime: "image/jpeg", familias: ["jpeg"] },
  png: { tipo: "imagem", mime: "image/png", familias: ["png"] },
  mp4: { tipo: "video", mime: "video/mp4", familias: ["mp4"] },
  "3gp": { tipo: "video", mime: "video/3gpp", familias: ["3gp"] },
  aac: { tipo: "audio", mime: "audio/aac", familias: ["aac"] },
  m4a: { tipo: "audio", mime: "audio/mp4", familias: ["m4a", "mp4"] },
  mp3: { tipo: "audio", mime: "audio/mpeg", familias: ["mp3"] },
  amr: { tipo: "audio", mime: "audio/amr", familias: ["amr"] },
  ogg: { tipo: "audio", mime: "audio/ogg", familias: ["ogg"] },
  opus: { tipo: "audio", mime: "audio/ogg", familias: ["ogg"] },
  pdf: { tipo: "documento", mime: "application/pdf", familias: ["pdf"] },
  doc: { tipo: "documento", mime: "application/msword", familias: ["ole"] },
  docx: { tipo: "documento", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", familias: OFFICE_ZIP },
  xls: { tipo: "documento", mime: "application/vnd.ms-excel", familias: ["ole"] },
  xlsx: { tipo: "documento", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", familias: OFFICE_ZIP },
  ppt: { tipo: "documento", mime: "application/vnd.ms-powerpoint", familias: ["ole"] },
  pptx: { tipo: "documento", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", familias: OFFICE_ZIP },
  txt: { tipo: "documento", mime: "text/plain", familias: ["texto"] },
};

// O QUE A EVOLUTION (WhatsApp Web / Baileys) ACEITA: o que o próprio WhatsApp aceita ao anexar. Vídeo só mp4 (mov e outros
// são recusados de propósito: chegam ao cliente como arquivo, não como vídeo).
const EXTENSOES_EVOLUTION: Record<string, Entrada> = {
  jpg: EXTENSOES_META.jpg,
  jpeg: EXTENSOES_META.jpeg,
  png: EXTENSOES_META.png,
  webp: { tipo: "imagem", mime: "image/webp", familias: ["webp"] },
  mp4: EXTENSOES_META.mp4,
  ogg: EXTENSOES_META.ogg,
  opus: EXTENSOES_META.opus,
  mp3: EXTENSOES_META.mp3,
  m4a: EXTENSOES_META.m4a,
  aac: EXTENSOES_META.aac,
  pdf: EXTENSOES_META.pdf,
  doc: EXTENSOES_META.doc,
  docx: EXTENSOES_META.docx,
  xls: EXTENSOES_META.xls,
  xlsx: EXTENSOES_META.xlsx,
  ppt: EXTENSOES_META.ppt,
  pptx: EXTENSOES_META.pptx,
  txt: EXTENSOES_META.txt,
  csv: { tipo: "documento", mime: "text/csv", familias: ["texto"] },
  zip: { tipo: "documento", mime: "application/zip", familias: ["zip"] },
};

/** Sem provedor conhecido, vale a lista mais restrita (a da Meta). */
export function extensoesDoProvedor(p: ProvedorDoWhatsapp | null | undefined): Record<string, Entrada> {
  return p === "EVOLUTION" ? EXTENSOES_EVOLUTION : EXTENSOES_META;
}

/** Barradas pelo nome, em QUALQUER segmento (`relatorio.exe.pdf` também cai): programa, script, página, atalho, pacote. */
export const EXTENSOES_BARRADAS = [
  "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "dll", "sys", "cpl", "lnk", "url", "reg", "inf", "jar", "apk", "ipa", "app", "deb", "rpm", "dmg", "iso", "bin",
  "sh", "bash", "zsh", "csh", "ps1", "psm1", "vbs", "vbe", "wsf", "wsh", "hta", "js", "mjs", "cjs", "jse", "ts", "py", "pl", "rb", "php", "phtml", "asp", "aspx", "jsp", "cgi",
  "html", "htm", "xhtml", "shtml", "mhtml", "svg", "svgz", "xml", "xsl", "xslt", "swf", "class", "docm", "xlsm", "pptm", "dotm", "xltm", "potm", "chm",
] as const;

/** O que o navegador declara (`File.type`) e que nunca é mídia para o cliente. */
const TIPOS_DECLARADOS_BARRADOS = [
  "text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml", "text/javascript", "application/javascript", "application/x-javascript",
  "application/x-msdownload", "application/x-dosexec", "application/x-msdos-program", "application/x-executable", "application/x-sh", "application/x-csh",
  "application/java-archive", "application/vnd.android.package-archive", "application/x-msi", "application/x-httpd-php", "application/x-shockwave-flash",
  "application/hta", "application/x-bat", "application/x-apple-diskimage",
];

export function extensaoDoNomeDeSaida(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Todos os segmentos depois do primeiro ponto (`a.b.c` -> `b`, `c`). */
function segmentosDeExtensao(nome: string): string[] {
  const partes = nome.split(".");
  return partes.slice(1).map((s) => s.trim().toLowerCase());
}

/**
 * O nome que vai ao cliente e ao Drive: sem caminho (o Windows manda `C:\x\y.pdf`), sem controle nem aspas nem colchetes
 * (o colchete quebraria o rótulo da mensagem), espaços comprimidos, até 100 caracteres COM a extensão preservada.
 */
export function nomeSeguroDoArquivo(bruto: string): string {
  const semCaminho = (bruto || "").split(/[\\/]/).pop() ?? "";
  const limpo = semCaminho
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/["'<>|:*?\[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (limpo.length <= 100) return limpo;
  const ext = extensaoDoNomeDeSaida(limpo);
  return ext ? `${limpo.slice(0, 100 - ext.length - 1).trimEnd()}.${ext}` : limpo.slice(0, 100);
}

const EXTENSAO_DO_TIPO_DECLARADO: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/aac": "aac",
  "application/pdf": "pdf",
};

export function tamanhoDeSaidaLegivel(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`.replace(".", ",");
}

/** A frase que diz o que esta conexão aceita, para a mensagem de recusa. */
export function frasePermitida(p: ProvedorDoWhatsapp | null | undefined): string {
  return p === "EVOLUTION"
    ? "Aceitos: imagem (JPG, PNG, WebP), vídeo MP4, áudio (OGG, MP3, M4A, AAC) e documento (PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP)."
    : "Aceitos: imagem (JPG, PNG), vídeo (MP4, 3GP), áudio (OGG, MP3, M4A, AAC, AMR) e documento (PDF, Word, Excel, PowerPoint, TXT).";
}

export type ArquivoDeSaida = { name: string; size: number; type: string };

export type ClassificacaoDeSaida =
  | { ok: true; tipo: TipoDeSaida; mime: string; nome: string; familias: FamiliaDeConteudo[] }
  | { ok: false; codigo: "TIPO_NAO_PERMITIDO" | "GRANDE_DEMAIS" | "VAZIO"; erro: string };

/**
 * Este arquivo pode ir ao cliente por este provedor? Devolve o tipo que o WhatsApp vai receber e o nome seguro, ou a frase
 * da recusa. A mesma função roda na tela e no servidor (o servidor passa o tamanho REAL do que baixou).
 */
export function classificarArquivoDeSaida(a: ArquivoDeSaida, provedor: ProvedorDoWhatsapp | null | undefined): ClassificacaoDeSaida {
  if (!Number.isFinite(a.size) || a.size <= 0) return { ok: false, codigo: "VAZIO", erro: "O arquivo está vazio." };
  const declarado = (a.type || "").split(";")[0].trim().toLowerCase();
  let nome = nomeSeguroDoArquivo(a.name);
  // Foto da câmera às vezes vem sem nome ou sem extensão: a extensão que faltava é a do tipo (só dos poucos seguros).
  if (!extensaoDoNomeDeSaida(nome)) {
    const ext = EXTENSAO_DO_TIPO_DECLARADO[declarado];
    if (!ext) return { ok: false, codigo: "TIPO_NAO_PERMITIDO", erro: `Não foi possível saber o tipo deste arquivo. Renomeie com a extensão (por exemplo, .pdf) e envie de novo. ${frasePermitida(provedor)}` };
    nome = `${nome || "arquivo"}.${ext}`;
  }
  const extensoes = segmentosDeExtensao(nome);
  const barrada = extensoes.find((e) => (EXTENSOES_BARRADAS as readonly string[]).includes(e));
  if (barrada) return { ok: false, codigo: "TIPO_NAO_PERMITIDO", erro: `Arquivo .${barrada} não pode ser enviado ao cliente. ${frasePermitida(provedor)}` };
  if (declarado && TIPOS_DECLARADOS_BARRADOS.includes(declarado)) {
    return { ok: false, codigo: "TIPO_NAO_PERMITIDO", erro: `Este tipo de arquivo não pode ser enviado ao cliente. ${frasePermitida(provedor)}` };
  }
  const ext = extensaoDoNomeDeSaida(nome);
  const regra = extensoesDoProvedor(provedor)[ext];
  if (!regra) return { ok: false, codigo: "TIPO_NAO_PERMITIDO", erro: `Arquivo .${ext} não é aceito por esta conexão do WhatsApp. ${frasePermitida(provedor)}` };
  // O tipo declarado não pode contradizer a extensão (foto renomeada para .pdf, por exemplo). "octet-stream" e vazio passam.
  const generico = !declarado || declarado === "application/octet-stream" || declarado === "binary/octet-stream";
  if (!generico) {
    const familia = declarado.split("/")[0];
    const contradiz =
      (familia === "image" && regra.tipo !== "imagem") ||
      (familia === "video" && regra.tipo !== "video" && !(regra.tipo === "audio" && (ext === "ogg" || ext === "m4a" || ext === "opus"))) ||
      (familia === "audio" && regra.tipo !== "audio") ||
      (regra.tipo === "imagem" && familia !== "image") ||
      (regra.tipo === "video" && familia !== "video");
    if (contradiz) return { ok: false, codigo: "TIPO_NAO_PERMITIDO", erro: "O tipo do arquivo não confere com a extensão do nome. Confira o arquivo e envie de novo." };
  }
  const limite = LIMITE_POR_TIPO[regra.tipo];
  if (a.size > limite) {
    const tem = tamanhoDeSaidaLegivel(a.size);
    const teto = tamanhoDeSaidaLegivel(limite);
    const quanto = tem === teto ? `é um pouco maior que o limite de ${teto}` : `tem ${tem} e o limite é ${teto}`;
    return { ok: false, codigo: "GRANDE_DEMAIS", erro: `${ESTE_ESTA[regra.tipo]} ${quanto}. Envie um menor${regra.tipo === "video" ? " (comprima o vídeo)" : ""}.` };
  }
  return { ok: true, tipo: regra.tipo, mime: regra.mime, nome, familias: regra.familias };
}

/** A legenda: só imagem, vídeo e documento; até 1024 caracteres. Devolve o texto limpo ou a frase do erro. */
export function validarLegenda(bruta: unknown, tipo: TipoDeSaida): { ok: true; legenda: string } | { ok: false; erro: string } {
  if (bruta === undefined || bruta === null) return { ok: true, legenda: "" };
  if (typeof bruta !== "string") return { ok: false, erro: "Legenda inválida." };
  const legenda = bruta.trim();
  if (!legenda) return { ok: true, legenda: "" };
  if (tipo === "audio") return { ok: false, erro: "O WhatsApp não aceita legenda em áudio. Envie o áudio sem texto e escreva o texto em outra mensagem." };
  if (legenda.length > LIMITE_DA_LEGENDA) return { ok: false, erro: `A legenda passa de ${LIMITE_DA_LEGENDA} caracteres. Encurte.` };
  return { ok: true, legenda };
}

// ── O `accept` DOS SELETORES (só ajuda o aparelho a filtrar; quem decide é a função acima e o servidor) ───────────────

/** Galeria: imagens e vídeos. Com tipos exatos o iPhone converte HEIC em JPEG ao escolher. */
export function acceptDaGaleria(p: ProvedorDoWhatsapp | null | undefined): string {
  const mimes = new Set<string>();
  for (const e of Object.values(extensoesDoProvedor(p))) if (e.tipo === "imagem" || e.tipo === "video") mimes.add(e.mime);
  return [...mimes].join(",");
}

/** Documento ou áudio: as extensões dessas duas famílias. */
export function acceptDoDocumento(p: ProvedorDoWhatsapp | null | undefined): string {
  return Object.entries(extensoesDoProvedor(p))
    .filter(([, e]) => e.tipo === "documento" || e.tipo === "audio")
    .map(([ext]) => `.${ext}`)
    .join(",");
}

/** A câmera pede só foto. */
export const ACCEPT_DA_CAMERA_DE_SAIDA = "image/*";

// ── O CAMINHO TEMPORÁRIO NO BLOB ─────────────────────────────────────────────────────────────────────────────────

const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{8,64}$/;

/** O prefixo que amarra o arquivo temporário a UMA conversa e a UMA mensagem. O servidor só aceita URL que comece por ele. */
export function prefixoDoTemporario(idDaConversa: string, clientMessageId: string): string {
  return `atd-saida/${idDaConversa}/${clientMessageId}/`;
}

export function caminhoDoTemporario(idDaConversa: string, clientMessageId: string, nome: string): string {
  return `${prefixoDoTemporario(idDaConversa, clientMessageId)}${nomeSeguroDoArquivo(nome) || "arquivo"}`;
}

/** O pathname de uma URL do Blob pertence a esta conversa e a esta chave? (o nome do Blob ganha um sufixo aleatório no fim) */
export function temporarioEDesta(urlDoBlob: string, idDaConversa: string, clientMessageId: string): boolean {
  if (!FORMATO_DA_CHAVE.test(clientMessageId) || !/^[A-Za-z0-9_-]{1,64}$/.test(idDaConversa)) return false;
  let caminho: string;
  try {
    caminho = decodeURIComponent(new URL(urlDoBlob).pathname).replace(/^\/+/, "");
  } catch {
    return false;
  }
  if (caminho.includes("..") || caminho.includes("//")) return false;
  return caminho.startsWith(prefixoDoTemporario(idDaConversa, clientMessageId));
}

// ── O CORPO DO PEDIDO ────────────────────────────────────────────────────────────────────────────────────────────

export type PedidoDeMidia = { clientMessageId: string; blobUrl: string; nome: string; legenda: string; confirmouReenvio: boolean };

export function validarPedidoDeMidia(corpo: unknown): { ok: true; pedido: PedidoDeMidia } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "Pedido inválido." };
  const c = corpo as Record<string, unknown>;
  if (typeof c.clientMessageId !== "string" || !FORMATO_DA_CHAVE.test(c.clientMessageId)) return { ok: false, erro: "Pedido sem identificador de mensagem." };
  if (typeof c.blobUrl !== "string" || c.blobUrl.length > 2048) return { ok: false, erro: "Pedido sem o arquivo." };
  if (typeof c.nome !== "string" || !c.nome.trim() || c.nome.length > 300) return { ok: false, erro: "Pedido sem o nome do arquivo." };
  if (c.legenda !== undefined && c.legenda !== null && typeof c.legenda !== "string") return { ok: false, erro: "Legenda inválida." };
  return {
    ok: true,
    pedido: { clientMessageId: c.clientMessageId, blobUrl: c.blobUrl, nome: c.nome, legenda: typeof c.legenda === "string" ? c.legenda : "", confirmouReenvio: c.confirmouReenvio === true },
  };
}

/**
 * O pedido de token do upload direto ao Blob: o caminho tem de ser `atd-saida/<ESTA conversa>/<chave>/<nome>`, sem subpasta, com nome já
 * limpo e extensão da lista do provedor. (O tipo declarado NÃO restringe o token: o navegador o declara de formas diferentes, e o
 * servidor confere o conteúdo de qualquer jeito antes de enviar.)
 */
export function validarCaminhoDoTemporario(pathname: string, idDaConversa: string, provedor: ProvedorDoWhatsapp | null | undefined): { ok: true } | { ok: false; erro: string } {
  const m = /^atd-saida\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{8,64})\/([^/]+)$/.exec(pathname || "");
  if (!m || m[1] !== idDaConversa) return { ok: false, erro: "Caminho de arquivo inválido." };
  const nome = m[3];
  if (nome !== nomeSeguroDoArquivo(nome)) return { ok: false, erro: "Nome de arquivo inválido." };
  const c = classificarArquivoDeSaida({ name: nome, size: 1, type: "" }, provedor);
  if (!c.ok) return { ok: false, erro: c.erro };
  return { ok: true };
}
