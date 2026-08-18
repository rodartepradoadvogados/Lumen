import { NextRequest, NextResponse } from "next/server";
import { sendDailyDigestEmails } from "@/lib/email";

// Envia um e-mail por usuário ativo, sequencial (SMTP) — sem maxDuration, a rota corria no
// default da plataforma (menor que os outros 10 crons que declaram 60 ou 300), arriscando
// timeout no meio do laço numa plataforma com muitos usuários, sem retry para quem ficou de fora.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDailyDigestEmails();
  return NextResponse.json(result, { status: 200 });
}
