import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { stage } = await req.json();
  const validStages = ["NOVO", "QUALIFICACAO", "PROPOSTA", "AGUARDANDO_RESPOSTA", "FECHADO", "PERDIDO"];
  if (!validStages.includes(stage)) {
    return NextResponse.json({ error: "Estágio inválido" }, { status: 400 });
  }

  const attendance = await prisma.attendance.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
  });
  if (!attendance) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const updated = await prisma.attendance.update({
    where: { id: params.id },
    data: { stage, stageChangedAt: new Date() },
  });

  return NextResponse.json({ success: true, stage: updated.stage });
}