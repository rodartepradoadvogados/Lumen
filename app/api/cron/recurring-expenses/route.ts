import { NextRequest, NextResponse } from "next/server";
import { ensureRecurringExpensePayables } from "@/lib/actions/financeiro";

export const maxDuration = 60;

// Roda diariamente (ver vercel.json) — idempotente: a constraint única (recurringExpenseId,
// competencia) em Payable garante que gerar todo dia em vez de só no dia 1 não duplica nada.
// Mesmo padrão de app/api/cron/recurring-fees/route.ts (que faz o mesmo do lado das Receivable).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureRecurringExpensePayables();
  return NextResponse.json(result);
}
