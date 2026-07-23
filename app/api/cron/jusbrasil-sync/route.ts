import { NextRequest, NextResponse } from "next/server";
import { syncJusbrasilEmails } from "@/lib/jusbrasilEmailSync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncJusbrasilEmails();
  return NextResponse.json(result);
}
