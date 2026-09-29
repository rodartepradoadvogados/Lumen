import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 401 sem sessão, 403 sem acesso ao Atendimento, 404 para lead de outro dono/escritório —
  // o mesmo recorte da Central e do site (lib/acessoAtendimento.ts).
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { attendance } = r;

  const { stage } = await req.json();
  const validStages = ["NOVO", "QUALIFICACAO", "PROPOSTA", "AGUARDANDO_RESPOSTA", "FECHADO", "PERDIDO"];
  if (!validStages.includes(stage)) {
    return NextResponse.json({ error: "Estágio inválido" }, { status: 400 });
  }

  const updated = await prisma.attendance.update({
    where: { id: attendance.id },
    data: { stage, stageChangedAt: new Date() },
  });

  return NextResponse.json({ success: true, stage: updated.stage });
}
