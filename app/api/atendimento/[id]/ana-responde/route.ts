import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { atendimentoDaRota } from "@/lib/guardaDoAtendimento";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 401 sem sessão, 403 sem acesso ao Atendimento, 404 para lead de outro dono/escritório —
  // o mesmo recorte da Central e do site (lib/acessoAtendimento.ts).
  const r = await atendimentoDaRota(params.id);
  if (r.erro) return r.erro;
  const { attendance } = r;

  const { anaResponde } = await req.json();

  const metadata = (attendance.metadata as Record<string, unknown>) || {};
  await prisma.attendance.update({
    where: { id: attendance.id },
    data: { metadata: { ...metadata, anaResponde } },
  });

  return NextResponse.json({ success: true, anaResponde });
}
