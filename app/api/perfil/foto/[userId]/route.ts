import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// O Blob Store do projeto é público (ver app/api/perfil/foto/upload/route.ts), então
// user.photoUrl já é uma URL pública de verdade — só redireciona pra ela. Mantém o caminho
// estável /api/perfil/foto/{userId} nas outras telas mesmo assim, pra não precisar mudar nada
// se um dia o Blob Store voltar a ser privado.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });
  if (!user?.photoUrl) {
    return new Response("Foto não encontrada", { status: 404 });
  }
  return NextResponse.redirect(user.photoUrl);
}
