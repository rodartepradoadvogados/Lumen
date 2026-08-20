import { NextRequest, NextResponse } from "next/server";
import { drainNotificationOutbox } from "@/lib/notificationOutboxDrain";

export const maxDuration = 300;

// Drenador de NotificationOutbox (documento 06, Fase 3) — ativo em vercel.json a cada 15min
// (corte do outbox: os envios em tempo real/crons de horário fixo equivalentes foram removidos,
// ver lib/actions/tasks.ts, lib/outlookEmailSync.ts, lib/jusbrasilEmailSync.ts, lib/roboBridge.ts).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await drainNotificationOutbox();
  return NextResponse.json(result);
}
