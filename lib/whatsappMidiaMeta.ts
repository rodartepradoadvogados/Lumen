import type { MidiaParaEnviar } from "@/lib/whatsappEvolution";
import type { SendResult } from "@/lib/whatsapp";

// ============================================================================
// ENVIO DE MÍDIA PELA CLOUD API DA META — em DOIS pedidos, porque é assim que a API funciona:
//   1. `POST /{phone-number-id}/media` (multipart: `messaging_product`, `type`, `file`) -> `{ id }`. Isto NÃO manda nada ao cliente:
//      só guarda o arquivo na Meta. Se falhar aqui (mesmo sem resposta), nada saiu, e a falha NÃO é incerta.
//   2. `POST /{phone-number-id}/messages` com o `id` (`image`/`video`/`audio`/`document`, legenda, nome do documento). É ESTE
//      pedido que envia. Sem resposta dele = `incerto` (pode ter saído), como no texto.
//
// Sem dependência de banco: quem chama (lib/whatsapp.ts) entrega o número e o token. `base` só existe para o teste apontar para
// um servidor falso em 127.0.0.1; a produção usa sempre o padrão. NUNCA loga o arquivo nem o token.
// ============================================================================

export const GRAPH_BASE_PADRAO = "https://graph.facebook.com";
export const GRAPH_VERSAO = "v21.0";

const ESPERA_DO_UPLOAD_MS = 60_000;
const ESPERA_DO_ENVIO_MS = 30_000;

type RespostaGraph = {
  id?: string;
  messages?: { id?: string }[];
  error?: { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string } };
};

/** O texto do erro da Graph API. A janela de 24 h vira a frase que o resto do sistema já reconhece (lib/janelaDe24h.ts). */
export function erroDaGraph(data: RespostaGraph | null, status: number): string {
  const err = data?.error;
  if (!err) return `Falha HTTP ${status} ao enviar o arquivo.`;
  const code = err.code ?? err.error_subcode;
  const raw = `${err.message ?? ""} ${err.error_data?.details ?? ""}`.toLowerCase();
  if (code === 131047 || code === 131051 || raw.includes("24 hour") || raw.includes("24h") || (raw.includes("re-engagement") && raw.includes("message")) || raw.includes("outside the allowed window")) {
    return "Não foi possível enviar: fora da janela de 24h do WhatsApp — o cliente precisa enviar uma nova mensagem primeiro.";
  }
  return err.message || err.error_data?.details || `Falha HTTP ${status} ao enviar o arquivo.`;
}

async function comRelogio(url: string, init: RequestInit, esperaMs: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), esperaMs);
  try {
    return await fetch(url, { ...init, signal: c.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function lerJson(res: Response): Promise<RespostaGraph | null> {
  try {
    return (await res.json()) as RespostaGraph;
  } catch {
    return null;
  }
}

/** O corpo do pedido 2 (a mensagem). Exportado só para o teste conferir o formato campo a campo. */
export function corpoDaMensagemDeMidia(paraE164: string, mediaId: string, m: Pick<MidiaParaEnviar, "tipo" | "nome" | "legenda">): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to: paraE164 };
  if (m.tipo === "imagem") return { ...base, type: "image", image: { id: mediaId, ...(m.legenda ? { caption: m.legenda } : {}) } };
  if (m.tipo === "video") return { ...base, type: "video", video: { id: mediaId, ...(m.legenda ? { caption: m.legenda } : {}) } };
  if (m.tipo === "audio") return { ...base, type: "audio", audio: { id: mediaId } };
  return { ...base, type: "document", document: { id: mediaId, filename: m.nome, ...(m.legenda ? { caption: m.legenda } : {}) } };
}

export async function enviarMidiaPelaMeta(
  config: { phoneNumberId: string; accessToken: string },
  paraE164: string,
  m: MidiaParaEnviar,
  base: string = GRAPH_BASE_PADRAO,
): Promise<SendResult> {
  const raiz = `${base}/${GRAPH_VERSAO}/${encodeURIComponent(config.phoneNumberId)}`;
  const autorizacao = { Authorization: `Bearer ${config.accessToken}` };

  // 1. O UPLOAD. Falhar aqui, mesmo sem resposta, não é incerto: ainda não houve mensagem nenhuma.
  let mediaId: string | undefined;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", m.mime);
    form.append("file", new Blob([new Uint8Array(m.buffer)], { type: m.mime }), m.nome);
    const res = await comRelogio(`${raiz}/media`, { method: "POST", headers: autorizacao, body: form }, ESPERA_DO_UPLOAD_MS);
    const data = await lerJson(res);
    if (!res.ok) return { ok: false, error: erroDaGraph(data, res.status) };
    mediaId = data?.id;
  } catch (e) {
    return { ok: false, error: `Não foi possível enviar o arquivo à Meta: ${e instanceof Error && e.name === "AbortError" ? "tempo esgotado" : "falha de rede"}.` };
  }
  if (!mediaId) return { ok: false, error: "A Meta não devolveu o identificador do arquivo." };

  // 2. A MENSAGEM. Daqui em diante, sem resposta = pode ter saído.
  try {
    const res = await comRelogio(
      `${raiz}/messages`,
      { method: "POST", headers: { ...autorizacao, "Content-Type": "application/json" }, body: JSON.stringify(corpoDaMensagemDeMidia(paraE164, mediaId, m)) },
      ESPERA_DO_ENVIO_MS,
    );
    const data = await lerJson(res);
    if (!res.ok) return { ok: false, error: erroDaGraph(data, res.status) };
    return { ok: true, waMessageId: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: `Falha ao contatar a API do WhatsApp: ${e instanceof Error && e.name === "AbortError" ? "tempo esgotado" : "falha de rede"}`, incerto: true };
  }
}
