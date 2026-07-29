import { NextRequest, NextResponse } from "next/server";
import { sendDailyDigestEmails } from "@/lib/email";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDailyDigestEmails();
  return NextResponse.json(result, { status: 200 });
}
