import { NextRequest, NextResponse } from "next/server";
import { executarProvisionamentoPendente } from "@/lib/actions/provisionamentoCampanhas";

// Vários perfis pendentes por rodada, cada um podendo levar até o teto de `provisionarNoHermes`
// (120s) — 280s dá espaço para um item lento sem estourar (a Vercel corta em 300s no plano deste
// projeto, mesma folga de app/api/cron/transcricoes-pendentes com seu 300s/120s). O que sobrar
// espera a próxima rodada, sem problema — cada tentativa é idempotente por construção.
export const maxDuration = 280;

// A REDE DE SEGURANÇA do provisionamento automático (§3 da especificação de campanhas — Frente
// C). O disparo imediato (lib/actions/provisionamentoCampanhas.ts:dispararProvisionamentoAssincrono)
// é "melhor esforço" — em serverless a função que recebeu o webhook pode congelar antes daquele
// fetch completar, e sem esta varredura um perfil pago ficaria PENDENTE, sem tentar de novo, para
// sempre e em silêncio. Roda a cada 5 minutos (ver vercel.json), mesmo intervalo de
// app/api/cron/transcricoes-pendentes e app/api/cron/leads-sem-resposta.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  // Fail-closed — mesmo padrão dos demais crons: sem CRON_SECRET configurada, recusa sempre.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultado = await executarProvisionamentoPendente();
  return NextResponse.json(resultado, { status: 200 });
}
