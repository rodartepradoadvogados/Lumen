import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// O Blob Store do projeto é público (ver app/api/perfil/foto/upload/route.ts), então
// user.photoUrl já é uma URL pública de verdade — só redireciona pra ela. Mantém o caminho
// estável /api/perfil/foto/{userId} nas outras telas mesmo assim, pra não precisar mudar nada
// se um dia o Blob Store voltar a ser privado.
//
// Exige sessão válida (achado F1 da auditoria de segurança, docs/security-audit/): antes esta
// rota não checava autenticação nenhuma — qualquer requisição, mesmo sem login, para um userId
// de qualquer escritório da plataforma, recebia o redirect. Não precisa checar officeId (não
// faz sentido restringir a foto de colega de outro escritório especificamente), só sessão
// válida — sem isso, o ID de um usuário de outro escritório era confirmável/consultável por
// qualquer um na internet.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });
  if (!user?.photoUrl) {
    return new Response("Foto não encontrada", { status: 404 });
  }
  return NextResponse.redirect(user.photoUrl);
}
