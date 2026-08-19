import { NextRequest, NextResponse } from "next/server";
import { drainNotificationOutbox } from "@/lib/notificationOutboxDrain";

export const maxDuration = 300;

// Drenador de NotificationOutbox (documento 06, Fase 3) — NÃO cadastrado em vercel.json de
// propósito ainda: ativá-lo é uma decisão separada, tomada só depois de conferir os dados
// acumulados em sombra (ver comentário no topo de lib/notificationOutbox.ts) e de remover os
// envios em tempo real/crons de horário fixo equivalentes — senão duplicaria notificação pra
// quem já recebe pelo caminho antigo. A rota em si já funciona (protegida por CRON_SECRET, mesmo
// padrão dos demais crons) — pode ser disparada manualmente pra inspecionar o resultado antes de
// decidir agendar.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await drainNotificationOutbox();
  return NextResponse.json(result);
}
