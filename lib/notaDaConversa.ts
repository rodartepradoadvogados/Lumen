import { diaDeBrasilia, horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { rotuloDoDia } from "@/lib/relogioDoAtendimento";
import { LIMITE_DO_TEXTO, validarPedidoDeEnvio, type ResultadoDoPedido } from "@/lib/envioDeMensagem";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";

// ============================================================================
// NOTA INTERNA E AVISO DE SISTEMA DA CONVERSA — as regras puras (sem banco, sem rede; vai ao navegador).
//
// O QUE É: texto da EQUIPE, guardado em `NotaDaConversa` (prisma/schema.prisma) — um registro que NÃO É
// `WhatsappMessage`. Por isso ela não tem como ir ao WhatsApp (nenhum código de envio conhece a tabela), não
// tem como virar "fala do cliente" para a Ana (`atendenteResponde` só lê mensagens), não move a atividade da
// lista nem conta como saída no relógio de 15 min, e não silencia a Ana.
//
// QUEM VÊ: quem pode ver aquele atendimento (o mesmo recorte por dono das mensagens: `atendimentoDaRota`).
//
// O MODO DO PEDIDO: o POST de /api/atendimento/[id]/mensagens ganhou `modo`. Ausente ou "mensagem" = envio
// ao cliente, como sempre. "nota" = nota interna. QUALQUER OUTRO valor é 400 — nunca "na dúvida, envia".
// ============================================================================

export type ModoDoPedido = "mensagem" | "nota";

/** `null` = modo inválido (o servidor recusa; jamais cai no envio ao cliente). */
export function lerModoDoPedido(corpo: unknown): ModoDoPedido | null {
  if (!corpo || typeof corpo !== "object") return "mensagem";
  const modo = (corpo as Record<string, unknown>).modo;
  if (modo === undefined) return "mensagem";
  return modo === "mensagem" || modo === "nota" ? modo : null;
}

export type PedidoDeNotaValidado = { ok: true; clientMessageId: string; texto: string } | { ok: false; erro: string };

/** O corpo veio da rede. Mesmas regras de chave e de tamanho do envio (uma só validação, não duas). */
export function validarPedidoDeNota(corpo: unknown): PedidoDeNotaValidado {
  const v = validarPedidoDeEnvio(corpo);
  if (!v.ok) return { ok: false, erro: v.erro === "Digite uma mensagem antes de enviar." ? "Digite a nota antes de salvar." : v.erro.replace("A mensagem passa", "A nota passa") };
  return { ok: true, clientMessageId: v.clientMessageId, texto: v.texto };
}

export const LIMITE_DA_NOTA = LIMITE_DO_TEXTO;

/** O que o balão da nota mostra quando o pedido falhou. Salvar nota é idempotente: tentar de novo NUNCA duplica. */
export function resultadoDaNota(status: number | null, corpo: { codigo?: string; erro?: string } | null): ResultadoDoPedido {
  if (status === 200) return { estado: "enviada", erro: null, podeTentarDeNovo: false };
  // Sem resposta ou 5xx: pode ter sido salva. Como a chave é única, repetir é seguro (não há "pode duplicar").
  if (status === null || status >= 500) return { estado: "falhou", erro: "Não foi possível confirmar se a nota foi salva. Tente de novo: repetir não duplica.", podeTentarDeNovo: true };
  if (status === 401) return { estado: "falhou", erro: "Sessão expirada. Entre de novo para salvar a nota.", podeTentarDeNovo: true };
  if (status === 403 || status === 404) return { estado: "falhou", erro: "Sem acesso a esta conversa.", podeTentarDeNovo: false };
  if (status === 400 || status === 415 || corpo?.codigo === "INVALIDO" || corpo?.codigo === "CHAVE_REUTILIZADA") return { estado: "falhou", erro: corpo?.erro || "Nota inválida.", podeTentarDeNovo: false };
  return { estado: "falhou", erro: corpo?.erro || "Não foi possível salvar a nota.", podeTentarDeNovo: true };
}

// ── O AVISO "A ANA NÃO RESPONDEU" ────────────────────────────────────────────────────────────────

/**
 * A chave do aviso é UMA por pergunta do cliente: a Ana pode tentar a mesma pergunta várias vezes (nova rodada,
 * "responder agora") e a equipe vê o aviso uma vez. Tem ":" de propósito: a chave do aparelho não aceita ":"
 * (lib/envioDeMensagem.ts), então nenhuma nota digitada colide com ela.
 */
export function chaveDoAvisoDaAna(perguntaId: string): string {
  return `sistema:ana-desistiu:${perguntaId}`;
}

/** O motivo vem de `decidirDepoisDaReleitura` ("uma pessoa do escritório assumiu enquanto ela redigia"). */
export function fraseDoAvisoDaAna(motivo: string): string {
  const limpo = motivo.trim().replace(/[.\s]+$/, "");
  return `A Ana não respondeu: ${limpo || "ela desistiu de enviar"}.`;
}

// ── A LINHA DO BANCO -> O QUE VAI PARA O CELULAR ─────────────────────────────────────────────────

export type LinhaDeNota = {
  id: string;
  tipo: string;
  autorNome: string | null;
  texto: string;
  clientMessageId: string;
  createdAt: Date;
};

export function prepararNota(n: LinhaDeNota, agora: Date): MensagemDoChat {
  const sistema = n.tipo === "SISTEMA";
  return {
    id: n.id,
    direction: "OUT",
    porAgente: false,
    texto: n.texto,
    midia: null,
    falhou: false,
    enviada: false,
    criadoEm: n.createdAt.toISOString(),
    hora: horaDeBrasilia(n.createdAt),
    dia: diaDeBrasilia(n.createdAt),
    rotuloDoDia: rotuloDoDia(n.createdAt, agora),
    transcricao: null,
    // A chave do aviso de sistema é interna: não sai do servidor.
    clientMessageId: sistema ? null : n.clientMessageId,
    tipo: sistema ? "sistema" : "nota",
    autor: sistema ? null : n.autorNome,
  };
}
