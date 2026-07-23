import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ============================================================================
// Integração WhatsApp — Cloud API OFICIAL da Meta (Graph API)
//
// App Meta / WABA / webhook / app secret / verify token são únicos para toda a
// plataforma (variáveis de ambiente globais) — é o mesmo App Meta compartilhado
// por todos os escritórios. O que é por escritório é o NÚMERO de telefone: cada
// escritório cadastra seu próprio phoneNumberId + accessToken (tabela
// WhatsappConfig, ver prisma/schema.prisma), e é esse número que identifica a
// qual escritório uma mensagem recebida pertence.
// ============================================================================

const GRAPH_API_VERSION = "v21.0";

/** true somente quando o escritório já cadastrou seu número da Cloud API. */
export async function isWhatsappConfigured(officeId: string): Promise<boolean> {
  const config = await prisma.whatsappConfig.findUnique({ where: { officeId }, select: { id: true } });
  return Boolean(config);
}

/** Token esperado no handshake (GET) do webhook da Meta. Global — um único App Meta pra plataforma. */
export function getVerifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN;
}

/** Resolve a qual escritório pertence um phone_number_id recebido no webhook da Meta. */
export async function resolveOfficeIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const config = await prisma.whatsappConfig.findUnique({ where: { phoneNumberId }, select: { officeId: true } });
  return config?.officeId ?? null;
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
 * Envia uma mensagem de texto simples pela Cloud API da Meta, usando o número
 * (phoneNumberId + accessToken) cadastrado pelo escritório.
 * Nunca lança: sempre resolve para { ok, ... }. Se não configurado, retorna
 * ok:false sem tocar na rede.
 */
export async function sendWhatsappText(officeId: string, toE164: string, body: string): Promise<SendResult> {
  const config = await prisma.whatsappConfig.findUnique({ where: { officeId } });
  if (!config) {
    return { ok: false, error: "WhatsApp não configurado para este escritório." };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
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
  phoneNumberId: string;
};

// Forma parcial do payload de webhook da Meta que nos interessa.
type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
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
    const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
    if (!text || !fromNumber || !waMessageId || !phoneNumberId) return null;

    const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;

    return { fromNumber, waMessageId, text, profileName, phoneNumberId };
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
export async function ingestIncomingWhatsapp({
  fromNumber,
  waMessageId,
  text,
  profileName,
  phoneNumberId,
}: IncomingMessage): Promise<void> {
  // Dedupe: reenvio da Meta não deve reprocessar.
  const existing = await prisma.whatsappMessage.findUnique({ where: { waMessageId } });
  if (existing) return;

  const officeId = await resolveOfficeIdByPhoneNumberId(phoneNumberId);
  if (!officeId) {
    console.error(`[whatsapp] mensagem recebida em phone_number_id ${phoneNumberId} sem escritório cadastrado — ignorada.`);
    return;
  }

  // Procura conversa aberta (não arquivada) para este telefone; a mais recente.
  let attendance = await prisma.attendance.findFirst({
    where: { officeId, waPhone: fromNumber, status: { not: "ARQUIVADO" } },
    orderBy: { createdAt: "desc" },
  });

  if (!attendance) {
    attendance = await prisma.attendance.create({
      data: {
        officeId,
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
      officeId,
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
