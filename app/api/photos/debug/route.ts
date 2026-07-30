import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rota de diagnóstico temporária (admin-only) pra descobrir por que get() do @vercel/blob
// devolve 403 mesmo com o BLOB_READ_WRITE_TOKEN certo — hipótese: as fotos migradas do
// rp-financeiro apontam pro Blob Store do projeto ANTIGO, e o token atual só autoriza o Store
// novo do projeto Lúmen. Remover depois de confirmar.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  const tokenStoreId = token.split("_")[3] || null;

  const photos = await prisma.photo.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, url: true, createdAt: true },
  });
  const oldest = await prisma.photo.findMany({
    orderBy: { createdAt: "asc" },
    take: 3,
    select: { id: true, url: true, createdAt: true },
  });

  const describe = (p: { id: string; url: string; createdAt: Date }) => {
    let host = null;
    try {
      host = new URL(p.url).hostname;
    } catch {}
    return { id: p.id, host, createdAt: p.createdAt };
  };

  return NextResponse.json({
    tokenStoreId,
    hasVercelOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN),
    blobStoreIdEnv: process.env.BLOB_STORE_ID || null,
    newest: photos.map(describe),
    oldest: oldest.map(describe),
  });
}
