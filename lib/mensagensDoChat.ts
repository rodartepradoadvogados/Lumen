import { diaDeBrasilia, horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { rotuloDoDia } from "@/lib/relogioDoAtendimento";
import { entregaDaLinha, entregaMaisAvancada, type EntregaDaMensagem } from "@/lib/entregaDaMensagem";
import { rotuloDeTranscricaoNaTela, type TranscricaoDaMensagem } from "@/lib/transcricaoDeAudio";

// ============================================================================
// O CHAT DO APLICATIVO DE ATENDIMENTO (modo leitura, ONDA A): a parte que não toca em banco nem em
// React — paginação das mensagens, rótulo de mídia e a forma serializável que vai para o celular.
//
// AS ÚLTIMAS 60, E "CARREGAR ANTERIORES". A conversa longa não vem inteira: a página traz as 60 mais
// recentes e a pessoa pede as anteriores em blocos de 60. O CURSOR é (instante, id) da mensagem mais
// antiga já na tela — e não um "offset" — porque chega mensagem nova enquanto a pessoa lê, e um
// offset deslocaria a página inteira. O id entra no cursor porque duas mensagens no MESMO instante
// (comum no ingest em rajada) sem ele seriam puladas ou repetidas na fronteira.
//
// MÍDIA NO BALÃO (PR 8): o balão mostra a imagem, toca o áudio e abre o vídeo/documento pela rota autenticada
// /api/atendimento/[id]/midia/[mensagemId] (lib/midiaDoChat.ts); o texto abaixo é a origem do rótulo.
// MÍDIA É RÓTULO. A mensagem de mídia recebida vira `[imagem]`, `[documento: nome.pdf]`, `[áudio]`
// (lib/driveNaming.ts:rotuloDaMidiaWhatsapp), com a legenda depois. O arquivo mora no Drive do
// escritório; abrir/tocar pelo celular chega numa etapa seguinte. O áudio mostra o rótulo e a
// transcrição (que é um registro à parte, nunca uma mensagem — ver TranscricaoDeAudio).
// ============================================================================

export const TAMANHO_DA_PAGINA = 60;

export type TipoDeMidia = "imagem" | "documento" | "audio" | "video" | "figurinha";

export type MidiaDaMensagem = {
  tipo: TipoDeMidia;
  /** "Imagem", "Documento", "Áudio"... — o que a bolha escreve. */
  rotulo: string;
  /** Nome do arquivo, quando o rótulo o trouxe. */
  nome: string | null;
  /** O texto que o cliente mandou junto (legenda), ou "". */
  legenda: string;
  /** Tamanho e tipo do arquivo, quando o ingest os gravou (mídia nova). Nulos = não se sabe; o cartão omite. */
  bytes?: number | null;
  mime?: string | null;
};

const ROTULO_DO_TIPO: Record<TipoDeMidia, string> = {
  imagem: "Imagem",
  documento: "Documento",
  audio: "Áudio",
  video: "Vídeo",
  figurinha: "Figurinha",
};

/** Lê o rótulo de mídia que o ingest grava em `body`. `null` = é texto de verdade. */
export function lerMidia(body: string): MidiaDaMensagem | null {
  const m = /^\[(imagem|documento|áudio|audio|vídeo|video|figurinha)(?::\s*([^\]]*))?\]\s*([\s\S]*)$/i.exec(body.trim());
  if (!m) return null;
  const bruto = m[1].toLowerCase();
  const tipo: TipoDeMidia = bruto === "áudio" || bruto === "audio" ? "audio" : bruto === "vídeo" || bruto === "video" ? "video" : (bruto as TipoDeMidia);
  const nome = m[2]?.trim() ? m[2].trim() : null;
  return { tipo, rotulo: ROTULO_DO_TIPO[tipo], nome, legenda: m[3].trim() };
}

/** A prévia da lista: mídia vira "Imagem", "Documento: contrato.pdf"..., com a legenda quando há. */
export function previaDoCorpo(body: string): string {
  const midia = lerMidia(body);
  if (!midia) return body;
  const base = midia.nome ? `${midia.rotulo}: ${midia.nome}` : midia.rotulo;
  return midia.legenda ? `${base} · ${midia.legenda}` : base;
}

/** A mensagem como ela viaja para o celular: só dados simples, horas já em Brasília. */
export type MensagemDoChat = {
  id: string;
  direction: "IN" | "OUT";
  porAgente: boolean;
  /** Texto (ou a legenda, quando é mídia). */
  texto: string;
  midia: MidiaDaMensagem | null;
  /** "falhou" só em mensagem de saída que o WhatsApp recusou. */
  falhou: boolean;
  enviada: boolean;
  /**
   * O ciclo de entrega da mensagem de SAÍDA que o provedor aceitou (R2A): "enviada" (✓), "entregue" (✓✓), "lida" (✓✓ em
   * destaque). Nulo em mensagem de entrada, nota, aviso e em mensagem que falhou. Só AVANÇA (lib/entregaDaMensagem.ts).
   * Opcional: quem monta um MensagemDoChat de outro jeito não muda.
   */
  entrega?: EntregaDaMensagem | null;
  criadoEm: string; // ISO
  hora: string;
  /** Dia de Brasília ("2026-09-29") e o rótulo dele ("Hoje", "Ontem", "27/09"). */
  dia: string;
  rotuloDoDia: string;
  transcricao: { texto: string; ehConteudo: boolean } | null;
  /**
   * A chave que o aparelho deu à mensagem que ENVIOU (nula em toda outra): é o que faz o balão "enviando"
   * virar o balão de verdade sem aparecer duas vezes.
   */
  clientMessageId: string | null;
  /** SÓ NA TELA: a mensagem que ainda não foi confirmada pelo servidor (balão "enviando", "falhou"...). */
  envioLocal?: { estado: "enviando" | "enviada" | "falhou" | "sem-confirmacao"; erro: string | null; podeTentarDeNovo: boolean };
  /**
   * AUSENTE = mensagem de WhatsApp (a de sempre). "nota" = nota interna escrita por uma pessoa; "sistema" =
   * aviso do Lúmen. Os dois vêm de `NotaDaConversa` (lib/notaDaConversa.ts), são só da equipe e nunca foram
   * nem serão enviados ao cliente. Opcional de propósito: quem monta um MensagemDoChat de WhatsApp não muda.
   */
  tipo?: "nota" | "sistema";
  /** Quem escreveu a nota (só em `tipo: "nota"`). */
  autor?: string | null;
};

export type LinhaDeMensagem = {
  id: string;
  direction: string;
  porAgente: boolean;
  body: string;
  status: string;
  createdAt: Date;
  entregueEm?: Date | null;
  lidaEm?: Date | null;
  clientMessageId?: string | null;
  midiaBytes?: number | null;
  midiaMime?: string | null;
  transcricao?: TranscricaoDaMensagem;
};

export function prepararMensagem(m: LinhaDeMensagem, agora: Date): MensagemDoChat {
  const lida = lerMidia(m.body);
  const midia = lida ? { ...lida, bytes: m.midiaBytes ?? null, mime: m.midiaMime ?? null } : null;
  const rotuloTranscricao = rotuloDeTranscricaoNaTela(m.transcricao);
  return {
    id: m.id,
    direction: m.direction === "OUT" ? "OUT" : "IN",
    porAgente: m.porAgente,
    texto: midia ? midia.legenda : m.body,
    midia,
    falhou: m.direction === "OUT" && m.status === "FAILED",
    enviada: m.direction === "OUT" && m.status === "SENT",
    entrega: entregaDaLinha(m),
    criadoEm: m.createdAt.toISOString(),
    hora: horaDeBrasilia(m.createdAt),
    dia: diaDeBrasilia(m.createdAt),
    rotuloDoDia: rotuloDoDia(m.createdAt, agora),
    transcricao: rotuloTranscricao,
    clientMessageId: m.clientMessageId ?? null,
  };
}

// ── PAGINAÇÃO ──────────────────────────────────────────────────────────────────────────────────

export type CursorDeMensagem = { criadoEm: Date; id: string };

export function codificarCursor(c: { createdAt: Date; id: string }): string {
  return `${c.createdAt.toISOString()}|${c.id}`;
}

/** O cursor que veio da URL é palpite: só vale se for um instante válido e um id razoável. */
export function lerCursor(bruto: string | null | undefined): CursorDeMensagem | null {
  if (!bruto) return null;
  const i = bruto.indexOf("|");
  if (i < 1) return null;
  const quando = new Date(bruto.slice(0, i));
  const id = bruto.slice(i + 1);
  if (Number.isNaN(quando.getTime())) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return { criadoEm: quando, id };
}

/** O pedaço de `where` que traz só o que é ANTERIOR ao cursor (instante, depois id). */
export function filtroAntesDoCursor(c: CursorDeMensagem | null) {
  if (!c) return {};
  return { OR: [{ createdAt: { lt: c.criadoEm } }, { createdAt: c.criadoEm, id: { lt: c.id } }] };
}

/** O pedaço de `where` que traz só o que é POSTERIOR ao cursor (a atualização a cada 15 s). */
export function filtroDepoisDoCursor(c: CursorDeMensagem) {
  return { OR: [{ createdAt: { gt: c.criadoEm } }, { createdAt: c.criadoEm, id: { gt: c.id } }] };
}

/** O cursor da mensagem mais nova que a tela já tem (o "depois" da próxima atualização). */
export function cursorDaMaisNova(mensagens: { id: string; criadoEm: string }[]): string | null {
  const ultima = mensagens[mensagens.length - 1];
  return ultima ? `${ultima.criadoEm}|${ultima.id}` : null;
}

/** A ordem da consulta paginada: do mais novo para o mais antigo, com o id como desempate. */
export const ORDEM_DA_PAGINA = [{ createdAt: "desc" as const }, { id: "desc" as const }];

export type PaginaDeMensagens<T> = {
  /** Da mais antiga para a mais nova — a ordem em que se lê. */
  mensagens: T[];
  temAnteriores: boolean;
  /** Passe em `antes` para pedir a página anterior. Nulo quando não há mais. */
  cursorDasAnteriores: string | null;
};

/**
 * Monta a página a partir de `limite + 1` linhas lidas da mais nova para a mais antiga: a linha a
 * mais só serve para saber se ainda há anteriores (sem uma segunda consulta de contagem).
 */
export function paginaDeMensagens<T extends { id: string; createdAt: Date }>(linhasDoMaisNovoParaOMaisAntigo: T[], limite = TAMANHO_DA_PAGINA): PaginaDeMensagens<T> {
  const temAnteriores = linhasDoMaisNovoParaOMaisAntigo.length > limite;
  const daPagina = linhasDoMaisNovoParaOMaisAntigo.slice(0, limite);
  const mensagens = [...daPagina].reverse();
  const maisAntiga = mensagens[0];
  return { mensagens, temAnteriores, cursorDasAnteriores: temAnteriores && maisAntiga ? codificarCursor(maisAntiga) : null };
}

/** Junta as mensagens que já estão na tela com as recém-chegadas: sem repetir, em ordem de leitura. */
export function mesclarMensagens(atuais: MensagemDoChat[], novas: MensagemDoChat[]): MensagemDoChat[] {
  const porId = new Map<string, MensagemDoChat>();
  for (const m of atuais) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, m);
  return Array.from(porId.values()).sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Agrupa por dia de Brasília, na ordem de chegada (o rótulo já veio pronto do servidor). */
export function agruparMensagensPorDia(mensagens: MensagemDoChat[]): { dia: string; rotulo: string; mensagens: MensagemDoChat[] }[] {
  const grupos: { dia: string; rotulo: string; mensagens: MensagemDoChat[] }[] = [];
  for (const m of mensagens) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === m.dia) ultimo.mensagens.push(m);
    else grupos.push({ dia: m.dia, rotulo: m.rotuloDoDia, mensagens: [m] });
  }
  return grupos;
}

// ── MUDANÇA DE ESTADO DE MENSAGENS JÁ VISTAS (a atualização a cada 15 s) ────────────────────────────

/** O estado de entrega de UMA mensagem de saída, como a rota de atualização o devolve. */
export type EntregaDaLinha = { id: string; entrega: EntregaDaMensagem | null; falhou: boolean };

/**
 * Aplica ao que está na tela o estado de entrega que o servidor devolveu, sem mexer em mais nada. A ENTREGA só
 * avança (`entregaMaisAvancada`): uma resposta atrasada não faz uma "lida" voltar a "entregue". A falha é a do
 * servidor (uma falha do webhook some se a entrega depois chegou). Devolve o MESMO array quando nada mudou, para a
 * tela não rerenderizar (nem a rolagem nem o rascunho são tocados de qualquer jeito: só o estado das mensagens).
 */
export function aplicarEntregas(atuais: MensagemDoChat[], entregas: EntregaDaLinha[]): MensagemDoChat[] {
  if (entregas.length === 0) return atuais;
  const porId = new Map(entregas.map((e) => [e.id, e]));
  let mudou = false;
  const novas = atuais.map((m) => {
    const e = porId.get(m.id);
    if (!e || m.direction !== "OUT" || m.tipo) return m;
    const entrega = e.falhou ? null : entregaMaisAvancada(m.entrega, e.entrega ?? "enviada");
    const enviada = !e.falhou;
    if (m.falhou === e.falhou && m.enviada === enviada && (m.entrega ?? null) === entrega) return m;
    mudou = true;
    return { ...m, falhou: e.falhou, enviada, entrega };
  });
  return mudou ? novas : atuais;
}
