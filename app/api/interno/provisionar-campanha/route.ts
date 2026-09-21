import { NextRequest } from "next/server";
import crypto from "crypto";
import { processarProvisionamentoDoEscritorio } from "@/lib/actions/provisionamentoCampanhas";

export const dynamic = "force-dynamic";
// Uma chamada a `provisionarNoHermes` sozinha já pode levar até 120s (ver lib/hermesPonte.ts).
export const maxDuration = 150;

// ============================================================================
// A ROTA INTERNA QUE PROVISIONA O PERFIL DE CAMPANHA, FORA DO WEBHOOK DA ASAAS.
//
// Chamada de DOIS lugares só: o disparo imediato logo depois do pagamento confirmar
// (lib/actions/provisionamentoCampanhas.ts:dispararProvisionamentoAssincrono) e, indiretamente
// (sem passar por HTTP — no mesmo processo), a rede de segurança por cron
// (app/api/cron/campanhas-provisionamento, que já resolve a lista de perfis pendentes direto).
//
// FAIL-CLOSED, mesmo padrão de app/api/transcricao/processar/route.ts: sem
// CAMPANHA_PROVISIONAMENTO_INTERNO_SECRET configurado, recusa qualquer pedido — esta rota não é
// de leitura, ela TERMINA falando com a máquina do Hermes em nome do escritório.
// ============================================================================
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const segredo = process.env.CAMPANHA_PROVISIONAMENTO_INTERNO_SECRET;

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
    const corpo = (await req.json()) as { officeId?: unknown };
    if (typeof corpo.officeId === "string" && corpo.officeId) {
      await processarProvisionamentoDoEscritorio(corpo.officeId);
    }
  } catch (e) {
    // NUNCA lança daqui: quem chamou (o disparo imediato) já seguiu em frente sem esperar a
    // resposta; um erro aqui só precisa ficar registrado — a rede de segurança por cron ainda
    // pega o item na próxima varredura.
    console.error("[interno/provisionar-campanha] erro ao processar:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
