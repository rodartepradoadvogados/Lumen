import { NextRequest, NextResponse } from "next/server";
import { repassarLeadsSemResposta } from "@/lib/repassarLead";

export const maxDuration = 60;

// O relógio de quinze minutos dos leads transferidos (ver lib/repassarLead.ts). Roda a cada CINCO
// minutos, e não a cada quinze como os demais crons deste projeto: um cron de quinze sobre um
// prazo de quinze faria o repasse acontecer entre quinze e trinta minutos depois — o dobro do
// prazo, sem ninguém ter decidido isso. Cinco minutos deixa o atraso em no máximo um terço.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await repassarLeadsSemResposta();
  return NextResponse.json(result, { status: 200 });
}
