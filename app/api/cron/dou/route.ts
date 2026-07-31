import { NextRequest, NextResponse } from "next/server";
import { syncDouParaSite } from "@/lib/douBridge";

export const maxDuration = 60;

// Ciclo diário da ponte DOU/INLABS (ver lib/douBridge.ts) — a captura e o casamento contra os
// termos de vigilância acontecem no robô Python (robo-publicacoes/src/inlabs.py, Railway);
// esta rota só lê o que já foi coletado/casado e cria as Publication correspondentes, uma vez
// por dia, DEPOIS do robô ter rodado de manhã (vercel.json: "0 8 * * *", 1h depois do PNCP:
// "0 7 * * *"). Guard idêntico ao de app/api/cron/robo-bridge/route.ts e app/api/cron/pncp/route.ts.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncDouParaSite();
  return NextResponse.json(result);
}
