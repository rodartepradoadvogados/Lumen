import { NextRequest } from "next/server";
import { getVerifyToken, verifySignature, parseIncoming, ingestIncomingWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Handshake de verificação do webhook (a Meta chama uma vez ao configurar).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token && token === getVerifyToken()) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Recebimento de eventos (mensagens e status). Segurança: assinatura + verify token.
// Não exige sessão de usuário — é a Meta chamando. O middleware já libera /api.
// A configuração (phoneNumberId/accessToken) é por escritório, então só dá pra
// saber se "está configurado" depois de ler o payload e achar o escritório dono
// do phone_number_id — ingestIncomingWhatsapp() ignora silenciosamente (com log)
// se nenhum escritório tiver esse número cadastrado.
export async function POST(req: NextRequest) {
  // Lê o corpo bruto para poder validar a assinatura HMAC.
  const rawBody = await req.text();

  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody);
    const incoming = parseIncoming(payload);
    // Sem mensagem de texto processável (ex.: status de entrega) → apenas ack.
    if (incoming) {
      await ingestIncomingWhatsapp(incoming);
    }
  } catch (e) {
    // NUNCA deixa a Meta reenviar infinitamente por erro interno: registra e ack 200.
    console.error("[whatsapp webhook] erro ao processar payload:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
