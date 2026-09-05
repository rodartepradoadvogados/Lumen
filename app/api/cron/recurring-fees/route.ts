import { NextRequest, NextResponse } from "next/server";
import { ensureRecurringFeeReceivables } from "@/lib/recurringFeesEngine";

export const maxDuration = 60;

// Roda diariamente (ver vercel.json) — idempotente: a constraint única (recurringFeeId,
// competencia) em Receivable garante que gerar todo dia em vez de só no dia 1 não duplica nada.
// Mesmo padrão de app/api/cron/assessoria-honorarios/route.ts.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureRecurringFeeReceivables();
  return NextResponse.json(result);
}
