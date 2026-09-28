import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { anaResponde } = await req.json();

  const attendance = await prisma.attendance.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
  });
  if (!attendance) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const metadata = (attendance.metadata as Record<string, unknown>) || {};
  await prisma.attendance.update({
    where: { id: params.id },
    data: { metadata: { ...metadata, anaResponde } },
  });

  return NextResponse.json({ success: true, anaResponde });
}