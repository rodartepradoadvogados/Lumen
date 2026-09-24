import { NextRequest, NextResponse } from "next/server";
import { preencherFollowUpsEmAberto } from "@/lib/followUpAutomatico";

export const maxDuration = 60;

// A REDE DE SEGURANÇA DO FOLLOW-UP AUTOMÁTICO (F5.5) — ver o cabeçalho de
// lib/followUpAutomatico.ts para o porquê deste cron existir por cima do preenchimento que já
// acontece no nascimento de cada atendimento. Uma vez por dia é suficiente: o vazio que esta rota
// cobre é sempre HISTÓRICO (atendimento de antes desta entrega, ou de um caminho que escapou), não
// algo que precise de resposta em minutos — diferente do cron de 5 em 5 de leads-sem-resposta, que
// vigia um prazo que também é de minutos.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultado = await preencherFollowUpsEmAberto();
  return NextResponse.json(resultado, { status: 200 });
}
