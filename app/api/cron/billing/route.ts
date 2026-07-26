import { NextRequest, NextResponse } from "next/server";
import { runBillingCycle } from "@/lib/actions/billing";

// Ciclo diário de cobrança Asaas (Fase 2 — ver lib/actions/billing.ts:runBillingCycle):
// reconciliação (rede de segurança contra webhook perdido), lembretes de vencimento/atraso e
// bloqueio automático por inadimplência. Idempotente por natureza: TenantInvoice.remindersSent
// evita reenviar o mesmo lembrete, e suspender um escritório já SUSPENSA não faz nada de novo
// (a condição já checa office.status === "ATIVA").
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runBillingCycle();
  return NextResponse.json(result);
}

export const maxDuration = 60;
