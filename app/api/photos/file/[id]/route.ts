import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rota pública (sem checagem de autenticação/admin) que redireciona para os bytes de uma foto
// da biblioteca. O Blob Store do projeto (lumen-attachments) está provisionado como PÚBLICO —
// photo.url já é uma URL pública de verdade, então só redireciona pra ela em vez de buscar e
// re-servir o conteúdo. Usada tanto pelo blog público (/blog, /blog/[slug]) quanto pelo fundo
// decorativo do site (SiteBackgroundLayer) e pelos gerenciadores internos — mantém o caminho
// estável /api/photos/file/{id} nas outras telas mesmo assim.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) {
    return new Response("Foto não encontrada", { status: 404 });
  }
  return NextResponse.redirect(photo.url, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
