import { NextRequest, NextResponse } from "next/server";
import { sendDailyAgendaEmail } from "@/lib/email";
import { sendDailyAgendaPushes } from "@/lib/push";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDailyAgendaEmail();
  await sendDailyAgendaPushes().catch(() => {});
  return NextResponse.json(result, { status: result.sent ? 200 : 202 });
}
