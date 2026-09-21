import { NextRequest, NextResponse } from "next/server";
import { executarReguaDeCarenciaCampanhas } from "@/lib/actions/campanhasCobranca";

export const maxDuration = 60;

// A régua diária de carência do módulo pago de campanhas (§7 da especificação de campanhas —
// Frente B). Roda uma vez por dia (ver vercel.json); "um aviso por dia, não um por execução" é
// garantido dentro de lib/actions/campanhasCobranca.ts (o dia de calendário do último aviso é
// gravado ANTES do envio, com o `where` repetindo o valor lido), então mesmo que este cron seja
// disparado mais de uma vez no mesmo dia (reexecução manual, retry da Vercel), o escritório não
// recebe o aviso em dobro.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  // Fail-closed — mesmo padrão dos demais crons (app/api/cron/*/route.ts): sem CRON_SECRET
  // configurada, recusa sempre. Nunca "sem segredo configurado = aceita".
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultado = await executarReguaDeCarenciaCampanhas();
  return NextResponse.json(resultado, { status: 200 });
}
