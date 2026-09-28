import { NextRequest } from "next/server";
import { getVerifyToken, verifySignature, parseIncoming, ingestIncomingWhatsapp } from "@/lib/whatsapp";
import { atendenteResponde } from "@/lib/atendenteResponde";
import { confirmarRecebimentoDeAudio } from "@/lib/confirmacaoDeAudio";
import { dispararTranscricaoAssincrona } from "@/lib/transcricaoAssincrona";
import { dispararAvisoFigurinha } from "@/lib/avisoFigurinha";

export const dynamic = "force-dynamic";
// O agente pode levar dezenas de segundos, e a resposta sai dentro deste mesmo pedido — isto
// continua valendo para mensagem de TEXTO. Para ÁUDIO não vale mais: a transcrição e a resposta de
// verdade rodam FORA deste pedido (ver app/api/transcricao/processar/route.ts), exatamente porque
// as duas juntas (Hermes + transcrição) somavam mais que este teto — ver lib/orcamentoDoPedido.ts.
export const maxDuration = 120;

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
      const attendanceId = await ingestIncomingWhatsapp(incoming);
      if (attendanceId) {
        // ÁUDIO: confirmação FIXA na hora (não passa pelo Hermes) + transcrição disparada FORA
        // deste pedido. A resposta de verdade (baseada na transcrição) sai depois, como uma
        // SEGUNDA mensagem — ver app/api/transcricao/processar/route.ts.
        if (incoming.midia?.tipo === "AUD") {
          await confirmarRecebimentoDeAudio(attendanceId);
          dispararTranscricaoAssincrona(incoming.waMessageId);
        } else if (incoming.figurinha) {
          // FIGURINHA: nada de resposta AGORA — a Ana só avisa que não identifica esse tipo de
          // mensagem depois de 15 segundos, e só se nada mais chegar nesse meio-tempo (ver
          // lib/avisoFigurinha.ts). Chamar atendenteResponde aqui seria responder na hora, o
          // oposto do que foi pedido.
          dispararAvisoFigurinha(incoming.waMessageId);
        } else {
          await atendenteResponde(attendanceId);
        }
      }
    }
  } catch (e) {
    // NUNCA deixa a Meta reenviar infinitamente por erro interno: registra e ack 200.
    console.error("[whatsapp webhook] erro ao processar payload:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
