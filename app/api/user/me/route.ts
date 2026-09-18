import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const office = await prisma.office.findUnique({
    where: { id: user.officeId },
    select: { id: true, slug: true, name: true }
  });

  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    officeId: office.id,
    officeSlug: office.slug,
    officeName: office.name,
    isAdmin: user.isAdmin,
    isPlatformOwner: user.isPlatformOwner,
  });
}

export const dynamic = "force-dynamic";