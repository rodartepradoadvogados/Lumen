import { NextRequest, NextResponse } from "next/server";
import { rodarRetencao } from "@/lib/retencaoAtendimentos";

export const maxDuration = 60;

// A rodada diária da retenção de atendimentos sem desfecho (ver lib/retencaoAtendimentos.ts).
// Só age em escritório que escolheu um prazo em Configurações → Atendente. Fail-closed como os
// demais crons: sem CRON_SECRET configurado, recusa.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await rodarRetencao();
  return NextResponse.json(result, { status: 200 });
}
