import { NextRequest, NextResponse } from "next/server";
import { verificarMemoriaDoHermesEAlertar } from "@/lib/actions/alertaMemoriaHermes";

export const maxDuration = 30;

// O alerta de memória da VPS do Hermes (§4 da especificação de campanhas — Frente C). Roda a
// cada 15 minutos (ver vercel.json, mesmo intervalo de app/api/cron/expirar-acessos); "um alerta
// por dia, não um por execução" é garantido dentro de lib/actions/alertaMemoriaHermes.ts, então
// rodar a cada 15 minutos não vira 96 e-mails por dia — só um, no primeiro instante em que a
// memória livre cruzar o limiar (quando o limiar estiver configurado).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  // Fail-closed — mesmo padrão dos demais crons: sem CRON_SECRET configurada, recusa sempre.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultado = await verificarMemoriaDoHermesEAlertar();
  return NextResponse.json(resultado, { status: 200 });
}
