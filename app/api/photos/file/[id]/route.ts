import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rota pública (sem checagem de autenticação/admin) que serve os bytes de uma foto da
// biblioteca. Antes disso era um redirect direto pra photo.url — parecia certo porque o upload
// (app/api/photos/upload/route.ts) pede access:"public" e não é rejeitado, mas na prática photo.url
// aponta pra um domínio *.private.blob.vercel-storage.com que devolve 403 pra qualquer requisição
// sem o token — daí as fotos nunca apareciam (nem na fila de revisão do blog, nem no blog público).
// Uma primeira tentativa de correção usou fetch(photo.url, { headers: { Authorization: ... } })
// manual, mas isso deu 502 em produção — o SDK @vercel/blob resolve internamente qual token/rota
// usar para ler um blob privado (get() é o jeito oficialmente documentado), então usamos ele em vez
// de montar a requisição HTTP na mão. O navegador nunca fala direto com o Blob, só com esta rota.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  try {
    // get() lança (não retorna null) pra qualquer status que não seja 200/304/404 — por isso o
    // try/catch: sem ele, uma falha de auth vira 500 genérico e a causa real some dos logs.
    const result = await get(photo.url, { access: "public" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new Response("Não foi possível carregar a foto.", { status: 502 });
    }

    return new Response(result.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[photos/file] falha ao buscar blob "${photo.url}": ${detail}`);
    return new Response(`Não foi possível carregar a foto: ${detail}`, { status: 502 });
  }
}
