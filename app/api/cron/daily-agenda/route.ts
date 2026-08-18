import { NextRequest, NextResponse } from "next/server";
import { sendDailyAgendaEmail } from "@/lib/email";
import { sendDailyAgendaPushes } from "@/lib/push";

// Mesma justificativa de app/api/cron/resumo-diario/route.ts — sem maxDuration, corria no
// default da plataforma em vez de alinhado aos outros crons (60 ou 300).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDailyAgendaEmail();
  await sendDailyAgendaPushes().catch(() => {});
  return NextResponse.json(result, { status: result.sent ? 200 : 202 });
}
