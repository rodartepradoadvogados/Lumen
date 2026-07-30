import { NextRequest, NextResponse } from "next/server";
import { syncPncpParaSite } from "@/lib/pncpBridge";

export const maxDuration = 60;

// Ciclo diário da ponte PNCP (ver lib/pncpBridge.ts) — a captura em si roda no robô Python
// (robo-publicacoes/src/pncp.py, Railway); esta rota só lê o que já foi coletado e cria as
// Publication correspondentes, uma vez por dia (vercel.json: "0 7 * * *"). Guard idêntico ao
// de app/api/cron/robo-bridge/route.ts.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncPncpParaSite();
  return NextResponse.json(result);
}
