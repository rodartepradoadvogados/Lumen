import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rota pública (sem checagem de autenticação/admin) que serve os bytes de uma foto da
// biblioteca. Antes disso era um redirect direto pra photo.url — parecia certo porque o upload
// (app/api/photos/upload/route.ts) pede access:"public" e não é rejeitado, mas na prática photo.url
// aponta pra um domínio *.private.blob.vercel-storage.com que devolve 403 pra qualquer requisição
// sem o token — daí as fotos nunca apareciam (nem na fila de revisão do blog, nem no blog público).
// A busca aqui, no servidor, usa o mesmo BLOB_READ_WRITE_TOKEN do upload, então funciona
// independente de o store estar (ou parecer estar) público ou privado — o navegador nunca fala
// direto com o Blob, só com esta rota.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const upstream = await fetch(photo.url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("Não foi possível carregar a foto.", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
