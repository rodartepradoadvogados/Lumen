import { NextRequest, NextResponse } from "next/server";
import { varrerTranscricoesPendentes } from "@/lib/transcricaoAssincrona";

// Vários itens por rodada, cada um podendo levar até o teto de app/api/transcricao/processar
// (120s) — 300s (mesmo teto de app/api/cron/drive-sync, comunicados-outbox, daily-agenda e
// resumo-diario) dá espaço para alguns itens lentos por rodada sem estourar; o que sobrar espera a
// próxima (a cada 5 minutos, ver vercel.json), sem problema — cada item é reprocessado do zero.
export const maxDuration = 300;

// A REDE DE SEGURANÇA. O disparo imediato (lib/transcricaoAssincrona.ts:dispararTranscricaoAssincrona)
// é "melhor esforço" — em serverless, a função que recebeu o webhook pode congelar antes daquele
// fetch completar, e sem esta varredura um áudio ficaria PENDENTE, e sem resposta, para sempre e
// em silêncio. Roda a cada 5 minutos, mesmo intervalo de app/api/cron/leads-sem-resposta — rápido
// o bastante para o cliente não esperar muito, sem varrer a tabela toda vira e mexe.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await varrerTranscricoesPendentes();
  return NextResponse.json(result, { status: 200 });
}
