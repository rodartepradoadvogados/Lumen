// Fonte ÚNICA dos nomes de pasta do armazenamento. Módulo PURO de propósito (não importa Prisma
// nem nada de servidor): a tela de configuração é um componente de cliente e monta a prévia com a
// mesma `montarNomeacao` que o servidor usa para criar as pastas — o que só é possível se este
// arquivo puder ser carregado nos dois lados. Quem lê a configuração do banco é
// lib/driveNamingOffice.ts.
//
// Vale para os três provedores (Google Drive, OneDrive, Dropbox). Antes desta entrega cada módulo
// de armazenamento cravava as mesmas strings
// ("Lúmen - Processos" e companhia), o que engessava a marca da Lúmen dentro do Drive de todo
// escritório-cliente e ainda deixava a tela de relatório de pastas repetir os literais por conta
// própria, livre para divergir do que o sistema realmente cria.
//
// Agora cada escritório escolhe a pasta-mãe e o prefixo em Configurações → Geral, e TUDO —
// criação de pasta, migração e relatório — deriva daqui.
//
// COMPATIBILIDADE: os padrões abaixo reproduzem exatamente os nomes antigos, byte a byte. Um
// escritório que nunca mexer na configuração continua com a estrutura idêntica à de sempre, sem
// migração nenhuma (ver scripts/verificarNomesPadrao.ts, que trava isso).
//
// F5 — MÍDIA DO WHATSAPP NO DRIVE (setembro/2026): este arquivo também é a fonte única do nome do
// ARQUIVO de mídia recebida pelo WhatsApp (seção no fim) — o dono foi explícito em não querer um
// segundo padrão de nomenclatura correndo em paralelo a este. Diferente da nomeação de pasta acima,
// o nome do arquivo não é configurável por escritório (o canal "WHATSAPP" e o tipo são fatos sobre
// a origem do arquivo, não uma preferência de marca) — ver lib/whatsapp.ts/lib/whatsappEvolution.ts
// (que baixam a mídia e chamam `montarNomeArquivoWhatsapp`) para quem usa isto de verdade.

export const PASTA_MAE_PADRAO = "Lúmen";
export const PREFIXO_PADRAO = "Lúmen - ";

export type RaizKey =
  | "anexos"
  | "modelos"
  | "gerados"
  | "assessoria"
  | "processos"
  | "atendimentos"
  | "casos"
  | "financeiroDespesas"
  | "financeiroReceitas"
  // Aba de Peticionamento (especificação §10): pasta geral do escritório que só recebe
  // conteúdo quando a sessão está DESVINCULADA de processo/caso/atendimento/assessoria
  // (petição avulsa) — com vínculo, anexo e minuta final vão direto pra pasta do item vinculado,
  // esta raiz nem é tocada.
  | "peticionamento";

// A parte do nome que descreve a FUNÇÃO da pasta. Não é configurável de propósito: é o que o
// sistema entende ("onde ficam os processos"), enquanto o prefixo é o que identifica o escritório.
export const RAIZ_SUFIXO: Record<RaizKey, string> = {
  anexos: "Anexos",
  modelos: "Modelos de Documento",
  gerados: "Documentos Gerados",
  assessoria: "Assessoria",
  processos: "Processos",
  atendimentos: "Atendimentos",
  casos: "Casos",
  financeiroDespesas: "Financeiro - Despesas",
  financeiroReceitas: "Financeiro - Receitas",
  peticionamento: "Peticionamento",
};

export const RAIZ_ROTULO: Record<RaizKey, string> = {
  anexos: "Anexos",
  modelos: "Modelos de documento",
  gerados: "Documentos gerados",
  assessoria: "Assessoria jurídica",
  processos: "Processos",
  atendimentos: "Atendimentos",
  casos: "Casos",
  financeiroDespesas: "Financeiro — despesas",
  financeiroReceitas: "Financeiro — receitas",
  peticionamento: "Peticionamento",
};

export type NomeacaoDrive = {
  pastaMae: string;
  prefixo: string;
  raizes: Record<RaizKey, string>;
  /** Todos os nomes de raiz, na ordem de RAIZ_SUFIXO — usado pela migração da pasta-mãe. */
  todasAsRaizes: string[];
};

// Caracteres que nenhum dos três provedores aceita em nome de pasta.
const PROIBIDOS = /[\\/:*?"<>|]/;

export function validarNomeacao(pastaMae: string, prefixo: string): string | null {
  if (!pastaMae.trim()) return "O nome da pasta-mãe não pode ficar em branco.";
  if (PROIBIDOS.test(pastaMae)) return 'O nome da pasta-mãe não pode conter \\ / : * ? " < > |';
  if (PROIBIDOS.test(prefixo)) return 'O prefixo não pode conter \\ / : * ? " < > |';
  if (pastaMae.length > 60) return "O nome da pasta-mãe ficou longo demais (máximo 60 caracteres).";
  if (prefixo.length > 60) return "O prefixo ficou longo demais (máximo 60 caracteres).";
  return null;
}

export function montarNomeacao(pastaMae?: string | null, prefixo?: string | null): NomeacaoDrive {
  // `prefixo` distingue "não configurado" (null/undefined → usa o padrão) de "configurado como
  // vazio" (string vazia → pastas sem prefixo nenhum, ex.: só "Processos"). Por isso o teste é
  // contra null/undefined, e não pela verdade do valor.
  const mae = pastaMae?.trim() || PASTA_MAE_PADRAO;
  const pre = prefixo === null || prefixo === undefined ? PREFIXO_PADRAO : prefixo;

  const raizes = Object.fromEntries(
    (Object.keys(RAIZ_SUFIXO) as RaizKey[]).map((k) => [k, `${pre}${RAIZ_SUFIXO[k]}`])
  ) as Record<RaizKey, string>;

  return { pastaMae: mae, prefixo: pre, raizes, todasAsRaizes: Object.values(raizes) };
}

// ============================================================================
// F5 — NOME DO ARQUIVO DE MÍDIA RECEBIDA PELO WHATSAPP.
//
// Padrão pedido pelo dono, literal: "2026_09_20_WHATSAPP_IMG-….jpg" — data em AAAA_MM_DD, o canal,
// o tipo (IMG/DOC/AUD/VID) e "o resto", que aqui é o nome original do arquivo (documento, quando o
// cliente manda um) ou um hash curto e determinístico do id da mensagem (imagem/áudio/vídeo, que
// quase nunca chegam com nome). O hash do id nunca colide entre duas mídias reais — waMessageId é
// @unique no banco (WhatsappMessage) — ao contrário de um contador em memória, que colidiria entre
// duas mensagens processadas ao mesmo tempo por instâncias serverless diferentes.
// ============================================================================

export type TipoMidiaWhatsapp = "IMG" | "DOC" | "AUD" | "VID";

// Extensão a usar quando o nome original não veio junto (áudio, vídeo, a maioria das imagens) —
// mapa pelo tipo MIME "de base" (sem parâmetro, ex.: "audio/ogg" de "audio/ogg; codecs=opus", que é
// como o áudio de voz do WhatsApp chega). Não precisa ser exaustivo: um tipo fora da lista cai no
// subtipo do próprio MIME (ver extensaoDoArquivo abaixo), que já acerta a maioria.
const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "application/zip": "zip",
};

const TIPO_MIDIA_ROTULO: Record<TipoMidiaWhatsapp, string> = { IMG: "imagem", DOC: "documento", AUD: "áudio", VID: "vídeo" };

/** Classifica o MIME type recebido no webhook nos quatro tipos do pedido — null só quando o MIME veio vazio. */
export function tipoMidiaWhatsapp(mimeType: string): TipoMidiaWhatsapp | null {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (!base) return null;
  if (base.startsWith("image/")) return "IMG";
  if (base.startsWith("video/")) return "VID";
  if (base.startsWith("audio/")) return "AUD";
  // Qualquer outro binário (pdf, word, planilha, zip, o que o WhatsApp chamar de "documento") é
  // tratado como documento — é exatamente o que o cliente também chama de "documento" ao anexar.
  return "DOC";
}

/** A extensão do arquivo — prioriza o nome original (mais preciso que adivinhar pelo MIME), cai pro MIME senão. */
export function extensaoDoArquivo(mimeType: string, nomeOriginal?: string | null): string {
  if (nomeOriginal) {
    const idx = nomeOriginal.lastIndexOf(".");
    if (idx > 0 && idx < nomeOriginal.length - 1) {
      return nomeOriginal
        .slice(idx + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    }
  }
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  return EXTENSAO_POR_MIME[base] || base.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

// O dia (fuso de Brasília) de quando a mensagem chegou — não o "agora" de quando o servidor
// processa o webhook, que pode ser alguns segundos depois, e não a meia-noite UTC (que erraria o
// dia perto da virada, como o comentário de lib/financeReceiptNaming.ts já explica para o caso
// oposto). NÃO reaproveita lib/publicationGrouping.ts (que já tem exatamente esta conta,
// `saoPauloDayKey`) DE PROPÓSITO: aquele módulo importa lib/roboBridge.ts, que importa
// @/lib/prisma — e ESTE arquivo é importado por um componente client (NomeacaoDriveForm.tsx) para
// montar a prévia da nomeação de pasta. Puxar esse import transitivo quebraria o build do cliente
// (a mesma armadilha que o CLAUDE.md descreve). Três linhas repetidas aqui custam bem menos que
// esse risco.
const FORMATADOR_DIA_BRASILIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
function diaEmBrasilia(data: Date | string): string {
  return FORMATADOR_DIA_BRASILIA.format(new Date(data));
}

function removerExtensao(nomeArquivo: string): string {
  const idx = nomeArquivo.lastIndexOf(".");
  return idx > 0 ? nomeArquivo.slice(0, idx) : nomeArquivo;
}

// Mesmo alfabeto de slug do resto do produto para nome de arquivo (sem acento, minúsculo, hífen
// entre palavras) — ver lib/financeReceiptNaming.ts:slugifyForFileName, cujo comentário explica por
// que não reaproveita lib/textNormalize.ts (aquilo é pra COMPARAR texto, não pra virar nome de
// arquivo: destruiria o hífen que aqui precisa sobreviver). Cópia pequena e isolada de propósito —
// o mesmo raciocínio do comentário de diaEmBrasilia acima: um import a menos, um risco a menos.
function slugParaArquivo(s: string, maxLength: number): string {
  const slug = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug.slice(0, maxLength).replace(/-$/, "") || "arquivo";
}

// Hash curto e determinístico (SEM `crypto` — módulo Node que não empacota no navegador, mesmo
// raciocínio do comentário de diaEmBrasilia acima) do id da mensagem — vira "o resto" do nome
// quando não há nome original. Não precisa resistir a ataque nenhum, só distinguir duas mídias
// reais a olho nu; um id de mensagem diferente quase certamente produz um hash diferente, e mesmo
// a rara colisão de hash não perde arquivo nenhum (o nome só fica menos único, o upload continua).
function hashCurto(texto: string): string {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (Math.imul(31, h) + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export type NomeArquivoWhatsappInput = {
  /** Quando a MENSAGEM chegou (não "agora") — ver comentário de diaEmBrasilia. */
  recebidoEm: Date | string;
  mimeType: string;
  /** Único por mensagem (WhatsappMessage.waMessageId) — vira "o resto" quando não há nome original. */
  waMessageId: string;
  /** Nome que o cliente deu ao arquivo — hoje só "documento" costuma trazer isto. */
  nomeOriginal?: string | null;
};

/** O nome do arquivo salvo no Drive: "AAAA_MM_DD_WHATSAPP_TIPO-resto.ext". */
export function montarNomeArquivoWhatsapp(input: NomeArquivoWhatsappInput): string {
  const tipo = tipoMidiaWhatsapp(input.mimeType) ?? "DOC";
  const dia = diaEmBrasilia(input.recebidoEm).replace(/-/g, "_");
  const ext = extensaoDoArquivo(input.mimeType, input.nomeOriginal);
  const resto = input.nomeOriginal ? slugParaArquivo(removerExtensao(input.nomeOriginal), 60) : hashCurto(input.waMessageId);
  return `${dia}_WHATSAPP_${tipo}-${resto}.${ext}`;
}

/**
 * O texto que fica no lugar do arquivo na conversa (WhatsappMessage.body é NOT NULL e não tem como
 * guardar um arquivo) — o arquivo de verdade mora no Attachment criado junto, na aba de Documentos
 * do atendimento (ver lib/whatsapp.ts:processarMidiaRecebida).
 */
export function rotuloDaMidiaWhatsapp(tipo: TipoMidiaWhatsapp, legenda?: string | null, nomeOriginal?: string | null): string {
  const base = nomeOriginal ? `[${TIPO_MIDIA_ROTULO[tipo]}: ${nomeOriginal}]` : `[${TIPO_MIDIA_ROTULO[tipo]}]`;
  return legenda?.trim() ? `${base} ${legenda.trim()}` : base;
}
