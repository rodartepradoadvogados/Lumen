import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ============================================================================
// Integração WhatsApp — Cloud API OFICIAL da Meta (Graph API)
//
// Tudo aqui é "env-gated": enquanto as variáveis de ambiente não existirem,
// a integração fica dormente e inofensiva (isWhatsappConfigured() → false).
// Nada é enviado à Meta sem WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
// ============================================================================

const GRAPH_API_VERSION = "v21.0";

/** true somente quando token de acesso e phone number id estão presentes. */
export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Token esperado no handshake (GET) do webhook da Meta. */
export function getVerifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN;
}

// ---------------------------------------------------------------------------
// Envio de texto
// ---------------------------------------------------------------------------

export type SendResult = { ok: boolean; waMessageId?: string; error?: string };

// Forma parcial da resposta da Graph API (envio e erros).
type GraphResponse = {
  messages?: { id?: string }[];
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
    error_data?: { details?: string };
  };
};

/**
 * Envia uma mensagem de texto simples pela Cloud API da Meta.
 * Nunca lança: sempre resolve para { ok, ... }. Se não configurado, retorna
 * ok:false sem tocar na rede.
 */
export async function sendWhatsappText(toE164: string, body: string): Promise<SendResult> {
  if (!isWhatsappConfigured()) {
    return { ok: false, error: "WhatsApp não configurado" };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164,
        type: "text",
        text: { body },
      }),
    });

    let data: GraphResponse | null = null;
    try {
      data = (await res.json()) as GraphResponse;
    } catch {
      // resposta sem corpo JSON — tratado abaixo
    }

    if (!res.ok) {
      const error = extractGraphError(data) || `Falha HTTP ${res.status} ao enviar mensagem.`;
      return { ok: false, error };
    }

    const waMessageId: string | undefined = data?.messages?.[0]?.id;
    return { ok: true, waMessageId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro de rede desconhecido";
    return { ok: false, error: `Falha ao contatar a API do WhatsApp: ${message}` };
  }
}

/** Extrai uma mensagem de erro legível do payload de erro da Graph API. */
function extractGraphError(data: GraphResponse | null): string | null {
  const err = data?.error;
  if (!err) return null;
  // Detecção tolerante da janela de 24h (fora da conversa aberta pelo cliente).
  // Códigos típicos: 131047 ("Message failed to send because more than 24 hours
  // have passed since the customer last replied") / 131051 / mensagens contendo "24".
  const code = err.code ?? err.error_subcode;
  const raw = `${err.message ?? ""} ${err.error_data?.details ?? ""}`.toLowerCase();
  const outsideWindow =
    code === 131047 ||
    code === 131051 ||
    raw.includes("24 hour") ||
    raw.includes("24 hours") ||
    raw.includes("24h") ||
    (raw.includes("re-engagement") && raw.includes("message")) ||
    raw.includes("outside the allowed window");
  if (outsideWindow) {
    return "Não foi possível enviar: fora da janela de 24h do WhatsApp — o cliente precisa enviar uma nova mensagem primeiro.";
  }
  return err.message || err.error_data?.details || null;
}

// ---------------------------------------------------------------------------
// Validação de assinatura do webhook (X-Hub-Signature-256)
// ---------------------------------------------------------------------------

/**
 * Valida a assinatura HMAC-SHA256 do corpo bruto enviado pela Meta.
 * Se WHATSAPP_APP_SECRET não estiver setado, não bloqueia (retorna true) —
 * assim o esqueleto funciona em ambiente sem secret configurado.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // sem secret configurado → não valida
  if (!signatureHeader) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual exige tamanhos iguais
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Parsing do webhook de entrada
// ---------------------------------------------------------------------------

export type IncomingMessage = {
  fromNumber: string;
  waMessageId: string;
  text: string;
  profileName?: string;
};

// Forma parcial do payload de webhook da Meta que nos interessa.
type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: { type?: string; from?: string; id?: string; text?: { body?: string } }[];
        contacts?: { profile?: { name?: string } }[];
      };
    }[];
  }[];
};

/**
 * Extrai a primeira mensagem de TEXTO processável de um payload de webhook da
 * Meta. Retorna null para qualquer coisa que não seja texto (ex.: eventos de
 * status de entrega, mídias, etc.), sinalizando "nada a fazer".
 */
export function parseIncoming(payload: unknown): IncomingMessage | null {
  try {
    const value = (payload as WebhookPayload)?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return null;
    if (message.type !== "text") return null;

    const text: string | undefined = message.text?.body;
    const fromNumber: string | undefined = message.from;
    const waMessageId: string | undefined = message.id;
    if (!text || !fromNumber || !waMessageId) return null;

    const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;

    return { fromNumber, waMessageId, text, profileName };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ingestão de mensagem de entrada → Atendimento
// ---------------------------------------------------------------------------

/**
 * Transforma uma mensagem de entrada do cliente em um WhatsappMessage vinculado
 * a um Atendimento (criando um novo Atendimento se não houver conversa aberta).
 * Idempotente por waMessageId. Não faz IA nem distribuição (fases B/C).
 */
// TODO(multi-tenant / Fase 2): WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN ainda são globais (uma
// única variável de ambiente pro sistema inteiro) — não há, ainda, como saber a qual escritório
// um número de WhatsApp recebido pertence. Cada escritório precisa cadastrar seu próprio número
// da Cloud API, e o webhook precisa resolver o officeId a partir de qual número da Meta recebeu
// a mensagem (WHATSAPP_PHONE_NUMBER_ID do payload), não mais assumir um único escritório.
// Por ora, assume-se o primeiro escritório cadastrado — revisitar antes de um segundo existir.
export async function ingestIncomingWhatsapp({
  fromNumber,
  waMessageId,
  text,
  profileName,
}: IncomingMessage): Promise<void> {
  // Dedupe: reenvio da Meta não deve reprocessar.
  const existing = await prisma.whatsappMessage.findUnique({ where: { waMessageId } });
  if (existing) return;

  const office = await prisma.office.findFirst({ orderBy: { createdAt: "asc" } });
  if (!office) return;

  // Procura conversa aberta (não arquivada) para este telefone; a mais recente.
  let attendance = await prisma.attendance.findFirst({
    where: { officeId: office.id, waPhone: fromNumber, status: { not: "ARQUIVADO" } },
    orderBy: { createdAt: "desc" },
  });

  if (!attendance) {
    attendance = await prisma.attendance.create({
      data: {
        officeId: office.id,
        clientName: profileName || fromNumber,
        contact: fromNumber,
        subject: "Atendimento via WhatsApp",
        channel: "WHATSAPP",
        status: "NOVO",
        leadSource: "WHATSAPP",
        waPhone: fromNumber,
        stageChangedAt: new Date(),
      },
    });
  }

  await prisma.whatsappMessage.create({
    data: {
      officeId: office.id,
      attendanceId: attendance.id,
      direction: "IN",
      body: text,
      waMessageId,
      status: "RECEIVED",
      fromNumber,
    },
  });

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: { waLastMessageAt: new Date() },
  });

  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${attendance.id}`);
}
