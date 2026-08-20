import { NextRequest, NextResponse } from "next/server";
import { varrerComunicados } from "@/lib/comunicadosVarredura";

// Documento 06 (Fase 3 — Comunicados) — varredura dos 5 eventos baseados em estado (prazo/
// audiência vencendo, honorário a receber, cobrança em atraso). Roda a cada 3h (vercel.json,
// mesmo intervalo de jusbrasil-sync/robo-bridge) — não precisa ser mais frequente que isso: o
// dedupeKey diário (ver lib/comunicadosVarredura.ts) já garante no máximo um lembrete por dia por
// item em aberto, então rodar mais vezes só adiantaria a detecção em algumas horas, não muda o
// resultado do dia.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await varrerComunicados();
  return NextResponse.json(result, { status: 200 });
}
