import { NextRequest } from "next/server";
import crypto from "crypto";
import { processarTranscricaoAssincrona } from "@/lib/transcricaoAssincrona";

export const dynamic = "force-dynamic";
// O orçamento de UM item (baixar do Drive + transcrever + o Hermes compor a resposta de verdade)
// — ver lib/orcamentoDoPedido.ts, cuja PRESUPOSTO_TOTAL_DO_PEDIDO_MS espelha este número (um teste
// de código-fonte confere os dois).
export const maxDuration = 120;

// ============================================================================
// A ROTA INTERNA QUE TERMINA A TRANSCRIÇÃO, FORA DO WEBHOOK.
//
// Chamada de DOIS lugares só: o disparo imediato logo depois de um áudio chegar
// (lib/transcricaoAssincrona.ts:dispararTranscricaoAssincrona) e — indiretamente, sem passar por
// HTTP — a rede de segurança por cron (app/api/cron/transcricoes-pendentes chama
// processarTranscricaoAssincrona direto, no mesmo processo).
//
// FAIL-CLOSED, E EM DOBRO: isto não é um endpoint de leitura, é um endpoint que TERMINA disparando
// uma mensagem de WhatsApp em nome do escritório. Sem TRANSCRICAO_INTERNA_SECRET configurado,
// recusa qualquer pedido — mesma regra de CRON_SECRET/WHATSAPP_APP_SECRET (ver CLAUDE.md).
// ============================================================================
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const segredo = process.env.TRANSCRICAO_INTERNA_SECRET;

  if (!segredo) {
    return new Response("Unauthorized", { status: 401 });
  }
  const esperado = `Bearer ${segredo}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const corpo = (await req.json()) as { waMessageId?: unknown };
    if (typeof corpo.waMessageId === "string" && corpo.waMessageId) {
      await processarTranscricaoAssincrona(corpo.waMessageId);
    }
  } catch (e) {
    // NUNCA lança daqui: quem chamou (o disparo imediato) já seguiu em frente sem esperar a
    // resposta; um erro aqui só precisa ficar registrado.
    console.error("[transcricao/processar] erro ao processar:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
