import { NextRequest } from "next/server";
import crypto from "crypto";
import { processarAvisoFigurinha, ESPERA_ANTES_DE_AVISAR_MS } from "@/lib/avisoFigurinha";

export const dynamic = "force-dynamic";
// Os 15 segundos de espera de propósito (ver lib/avisoFigurinha.ts) + o que atendenteResponde
// pode levar para compor a resposta de verdade (até ESPERA_MS de lib/hermesPonte.ts, 105s, já que
// esta chamada não vem de um webhook correndo contra outro orçamento — não passa
// `orcamentoRestanteMs`) + folga para as consultas ao banco e o envio. 150s cobre isso com sobra.
export const maxDuration = 150;

// ============================================================================
// A ROTA INTERNA QUE TERMINA O AVISO DE FIGURINHA, FORA DO WEBHOOK.
//
// Chamada de DOIS lugares só: o disparo imediato logo depois de uma figurinha solitária chegar
// (lib/avisoFigurinha.ts:dispararAvisoFigurinha) e — indiretamente, sem passar por HTTP — a rede
// de segurança por cron (app/api/cron/avisos-de-figurinha chama processarAvisoFigurinha direto, no
// mesmo processo).
//
// FAIL-CLOSED, E EM DOBRO: isto não é um endpoint de leitura, é um endpoint que TERMINA disparando
// (se for o caso) uma mensagem de WhatsApp em nome do escritório. Sem
// AVISO_FIGURINHA_INTERNA_SECRET configurado, recusa qualquer pedido — mesma regra de
// TRANSCRICAO_INTERNA_SECRET/CRON_SECRET/WHATSAPP_APP_SECRET (ver CLAUDE.md).
// ============================================================================
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const segredo = process.env.AVISO_FIGURINHA_INTERNA_SECRET;

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
      // A ESPERA DE VERDADE ACONTECE AQUI DENTRO — ver a nota no topo de lib/avisoFigurinha.ts
      // sobre por que ela mora nesta rota, e não no webhook nem no disparo fire-and-forget.
      await processarAvisoFigurinha(corpo.waMessageId, { esperarMs: ESPERA_ANTES_DE_AVISAR_MS });
    }
  } catch (e) {
    // NUNCA lança daqui: quem chamou (o disparo imediato) já seguiu em frente sem esperar a
    // resposta; um erro aqui só precisa ficar registrado.
    console.error("[aviso-figurinha/processar] erro ao processar:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
