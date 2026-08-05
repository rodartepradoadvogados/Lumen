import { NextRequest, NextResponse } from "next/server";
import { expireSupportAccess } from "@/lib/supportAccess";

export const maxDuration = 60;

// Fase D: sem este cron, uma AccessSession vencida só "morre" logicamente — fica com
// endedAt: null para sempre, e a página de transparência do escritório (ver
// app/(app)/configuracoes/acessos/page.tsx) mostraria uma ENTRADA sem SAIDA correspondente,
// como se o suporte "ainda estivesse lá". Roda a cada 15 min (ver vercel.json) — mais frequente
// que os demais crons deste projeto de propósito: a sessão de suporte dura só
// SESSION_MINUTES (30 min, lib/supportAccessConstants.ts), então um cron diário deixaria o
// registro incompleto por até um dia inteiro.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await expireSupportAccess();
  return NextResponse.json(result, { status: 200 });
}
