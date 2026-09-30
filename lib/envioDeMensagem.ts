// ============================================================================
// O ENVIO DE TEXTO AO CLIENTE PELO APLICATIVO — as regras puras (sem banco, sem rede, sem React).
//
// O RISCO MAIS CARO É DUPLICAR NO WHATSAPP DO CLIENTE: mensagem enviada não volta. A defesa é uma
// RESERVA por chave (`PedidoDeEnvioWhatsapp`, `@@unique([officeId, clientMessageId])`) feita ANTES de
// chamar o WhatsApp. `decidirSobreOPedido` é a tabela de decisão de quem chega com uma chave:
//
//   sem linha              -> reserva e envia
//   ENVIADO                -> "já tinha saído": devolve a mesma mensagem, NÃO envia outra cópia
//   FALHOU                 -> o WhatsApp recusou antes: pode tentar de novo com a MESMA chave
//   RESERVADO, recente     -> outro pedido com a mesma chave ainda está em curso (duplo toque, dois
//                             aparelhos): não envia, o aparelho espera
//   RESERVADO, antigo      -> caiu no meio: ninguém sabe se saiu. NÃO reenvia às cegas ("sem
//                             confirmação"); só reenvia se a pessoa confirmar, sabendo que pode duplicar
//   outro texto na chave   -> erro do aparelho; nunca é tratado como reenvio
// ============================================================================

/** O WhatsApp aceita até 4096 caracteres por mensagem de texto. */
export const LIMITE_DO_TEXTO = 4096;

/** Depois disto uma reserva ainda RESERVADO deixa de ser "em curso" e vira "sem confirmação". */
export const RESERVA_EM_CURSO_MS = 90_000;

export type EstadoDoPedido = "RESERVADO" | "ENVIADO" | "FALHOU";

export type PedidoExistente = {
  estado: string;
  textoHash: string;
  updatedAt: Date;
  mensagemId: string | null;
};

export type DecisaoDoPedido =
  | { acao: "enviar" }
  | { acao: "ja-enviado" }
  | { acao: "reenviar-apos-falha" }
  | { acao: "em-andamento" }
  | { acao: "sem-confirmacao" }
  | { acao: "reenviar-apos-incerteza" }
  | { acao: "chave-reutilizada" };

export function decidirSobreOPedido(
  existente: PedidoExistente | null,
  entrada: { textoHash: string; agora: Date; confirmouReenvio: boolean },
): DecisaoDoPedido {
  if (!existente) return { acao: "enviar" };
  if (existente.textoHash !== entrada.textoHash) return { acao: "chave-reutilizada" };
  if (existente.estado === "ENVIADO") return { acao: "ja-enviado" };
  if (existente.estado === "FALHOU") return { acao: "reenviar-apos-falha" };
  if (existente.estado === "RESERVADO") {
    const idade = entrada.agora.getTime() - existente.updatedAt.getTime();
    if (idade < RESERVA_EM_CURSO_MS) return { acao: "em-andamento" };
    return entrada.confirmouReenvio ? { acao: "reenviar-apos-incerteza" } : { acao: "sem-confirmacao" };
  }
  // Estado que este código não conhece: nunca adivinha a favor de enviar.
  return { acao: "sem-confirmacao" };
}

// ── O CORPO DO PEDIDO ────────────────────────────────────────────────────────────────────────────

const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{8,64}$/;

export type PedidoValidado = { ok: true; clientMessageId: string; texto: string; confirmouReenvio: boolean } | { ok: false; erro: string };

/** O corpo veio da rede: nada do que está nele é confiável até passar por aqui. */
export function validarPedidoDeEnvio(corpo: unknown): PedidoValidado {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "Pedido inválido." };
  const c = corpo as Record<string, unknown>;
  if (typeof c.clientMessageId !== "string" || !FORMATO_DA_CHAVE.test(c.clientMessageId)) {
    return { ok: false, erro: "Pedido sem identificador de mensagem." };
  }
  if (typeof c.texto !== "string") return { ok: false, erro: "Digite uma mensagem antes de enviar." };
  const texto = c.texto.trim();
  if (!texto) return { ok: false, erro: "Digite uma mensagem antes de enviar." };
  if (texto.length > LIMITE_DO_TEXTO) return { ok: false, erro: `A mensagem passa de ${LIMITE_DO_TEXTO} caracteres. Divida em duas.` };
  return { ok: true, clientMessageId: c.clientMessageId, texto, confirmouReenvio: c.confirmouReenvio === true };
}

/** Uma chave nova para cada mensagem digitada. Usa o gerador do navegador; cai num aleatório simples. */
export function novaChaveDeMensagem(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10).padEnd(8, "0")).join("");
}

// ── O QUE A ROTA RESPONDE, E O QUE A TELA FAZ COM ISSO ───────────────────────────────────────────

export type CodigoDeEnvio =
  | "FORA_DA_JANELA"
  | "RECUSADA"
  | "SEM_CONFIRMACAO"
  | "EM_ANDAMENTO"
  | "SEM_WHATSAPP"
  | "CHAVE_REUTILIZADA"
  | "INVALIDO"
  // Mídia de saída (R3): tipo fora da lista do provedor / conteúdo que não confere, arquivo acima do limite, arquivo temporário que não
  // pôde ser lido e limite de envios por minuto. Nenhum deles chega ao WhatsApp.
  | "TIPO_NAO_PERMITIDO"
  | "GRANDE_DEMAIS"
  | "ARQUIVO_INDISPONIVEL"
  | "MUITOS_ENVIOS";

/** O estado do balão depois que o pedido terminou. */
export type EstadoDoEnvio = "enviando" | "enviada" | "falhou" | "sem-confirmacao";

export type ResultadoDoPedido = {
  estado: EstadoDoEnvio;
  /** O texto que o balão mostra junto do estado, quando há. */
  erro: string | null;
  /** false quando tentar de novo não adianta (janela fechada, sem acesso, sem WhatsApp). */
  podeTentarDeNovo: boolean;
};

const FRASE_SEM_CONFIRMACAO = "Pode ter sido enviada: confira a conversa antes de repetir.";

/**
 * O que a resposta HTTP (ou a falta dela) significa para o balão. `status === null` = o pedido não
 * chegou a voltar (rede caiu, tempo esgotado): NÃO se sabe se saiu, então é "sem confirmação" e nunca
 * "não enviada". Qualquer 5xx é a mesma coisa: o servidor pode ter chamado o WhatsApp e caído depois.
 */
export function resultadoDoPedido(status: number | null, corpo: { codigo?: string; erro?: string } | null, opcoes: { midia?: boolean } = {}): ResultadoDoPedido {
  if (status === 200) return { estado: "enviada", erro: null, podeTentarDeNovo: false };
  if (status === null || status >= 500) return { estado: "sem-confirmacao", erro: FRASE_SEM_CONFIRMACAO, podeTentarDeNovo: true };
  const codigo = corpo?.codigo;
  if (codigo === "SEM_CONFIRMACAO") return { estado: "sem-confirmacao", erro: FRASE_SEM_CONFIRMACAO, podeTentarDeNovo: true };
  if (codigo === "EM_ANDAMENTO") return { estado: "sem-confirmacao", erro: "Este envio ainda está em andamento. Espere um instante e confira a conversa.", podeTentarDeNovo: true };
  if (codigo === "FORA_DA_JANELA") return { estado: "falhou", erro: opcoes.midia ? "Fora da janela de 24 h: o WhatsApp não deixa enviar arquivo agora." : "Fora da janela de 24 h: o WhatsApp não deixa responder por texto agora.", podeTentarDeNovo: false };
  // Mídia de saída: a frase do servidor já diz o motivo (tipo, tamanho); repetir não adianta, exceto o limite por minuto e o arquivo que não pôde ser lido.
  if (codigo === "TIPO_NAO_PERMITIDO" || codigo === "GRANDE_DEMAIS") return { estado: "falhou", erro: corpo?.erro || "Este arquivo não pode ser enviado.", podeTentarDeNovo: false };
  if (codigo === "MUITOS_ENVIOS") return { estado: "falhou", erro: corpo?.erro || "Muitos arquivos em pouco tempo. Espere um instante.", podeTentarDeNovo: true };
  if (codigo === "ARQUIVO_INDISPONIVEL") return { estado: "falhou", erro: corpo?.erro || "Não foi possível ler o arquivo enviado. Tente de novo.", podeTentarDeNovo: true };
  if (codigo === "SEM_WHATSAPP") return { estado: "falhou", erro: corpo?.erro || "Este atendimento não tem WhatsApp.", podeTentarDeNovo: false };
  if (status === 401) return { estado: "falhou", erro: "Sessão expirada. Entre de novo para enviar.", podeTentarDeNovo: true };
  if (status === 403 || status === 404) return { estado: "falhou", erro: "Sem acesso a esta conversa.", podeTentarDeNovo: false };
  if (status === 400 || codigo === "INVALIDO" || codigo === "CHAVE_REUTILIZADA") return { estado: "falhou", erro: corpo?.erro || "Mensagem inválida.", podeTentarDeNovo: false };
  return { estado: "falhou", erro: corpo?.erro || "Não foi possível enviar a mensagem.", podeTentarDeNovo: true };
}
