import { NextRequest, NextResponse } from "next/server";
import { generateAllMonthlyHonorarios } from "@/lib/actions/assessoria";

export const maxDuration = 60;

// Roda diariamente (ver vercel.json) — idempotente: só gera o Honorario/Receivable do mês
// corrente se ainda não existir para aquela assessoria (constraint única assessoriaId+competencia
// em Honorario), então não faz mal rodar todo dia em vez de só no dia 1.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await generateAllMonthlyHonorarios();
  return NextResponse.json(result);
}
