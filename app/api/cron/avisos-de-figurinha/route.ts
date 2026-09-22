import { NextRequest, NextResponse } from "next/server";
import { varrerAvisosFigurinhaPendentes } from "@/lib/avisoFigurinha";

// Vários itens por rodada, cada um podendo levar o tempo de uma chamada a atendenteResponde (o
// Hermes, até 105s) — 300s (mesmo teto de app/api/cron/transcricoes-pendentes, drive-sync,
// comunicados-outbox, daily-agenda e resumo-diario) dá espaço para alguns itens lentos por rodada
// sem estourar; o que sobrar espera a próxima (a cada 5 minutos, ver vercel.json).
export const maxDuration = 300;

// A REDE DE SEGURANÇA. O disparo imediato (lib/avisoFigurinha.ts:dispararAvisoFigurinha) é
// "melhor esforço" — em serverless, a função que recebeu o webhook pode congelar antes daquele
// fetch completar, e sem esta varredura uma figurinha ficaria sem aviso, e sem resposta, para
// sempre e em silêncio. Roda a cada 5 minutos, mesmo intervalo de
// app/api/cron/transcricoes-pendentes e app/api/cron/leads-sem-resposta.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await varrerAvisosFigurinhaPendentes();
  return NextResponse.json(result, { status: 200 });
}
