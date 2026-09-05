import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { photoFileUrl } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Rota pública (sem checagem de autenticação/admin) que serve os bytes de uma foto da
// biblioteca. Antes disso era um redirect direto pra photo.url, que devolvia 403: toda foto
// migrada do rp-financeiro aponta pro Blob Store do projeto ANTIGO (store 39sRLCaiYtu0AC9a),
// diferente do Store que o BLOB_READ_WRITE_TOKEN atual do Lúmen autoriza — confirmado comparando
// o storeId do token com o host de photo.url em produção. Por isso tenta o token padrão primeiro
// (cobre fotos novas, já no Store do Lúmen) e cai pro LEGACY_BLOB_READ_WRITE_TOKEN (token do Store
// antigo, copiado do projeto rp-financeiro) se o primeiro vier vazio ou 403.
const TOKENS = [undefined, process.env.LEGACY_BLOB_READ_WRITE_TOKEN].filter(
  (t, i) => i === 0 || Boolean(t)
);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  // SEGURANÇA (achado V13, auditoria de 05/09/2026): antes, esta rota servia QUALQUER foto da
  // biblioteca sem checar nada — nem sessão, nem escritório (a foto de outro escritório podia ser
  // baixada só sabendo o id, sequencial/enumerável, do Photo). A biblioteca (PhotoLibraryManager)
  // é ferramenta interna — a ÚNICA razão legítima pra servir uma foto sem sessão nenhuma é ela já
  // estar embutida como imagem de capa de um post do Blog já PUBLICADO (a página pública do blog,
  // app/blog/[slug]/page.tsx, precisa carregar essa imagem pra um visitante anônimo). Fora esse
  // caso, exige sessão com o MESMO officeId da foto — mesmo padrão de toda outra rota que serve
  // arquivo por id (ex.: app/api/assessoria/documentos/[id]/route.ts).
  const linkedToPublicPost = await prisma.blogPost.findFirst({
    where: { imageUrl: photoFileUrl(photo.id), status: "PUBLICADO" },
    select: { id: true },
  });
  if (!linkedToPublicPost) {
    const user = await getCurrentUser();
    if (!user || user.officeId !== photo.officeId) {
      return new Response("Não autorizado", { status: 401 });
    }
  }

  let lastError: unknown = null;
  for (const token of TOKENS) {
    try {
      // get() lança (não retorna null) pra qualquer status que não seja 200/304/404 — por isso o
      // try/catch: sem ele, uma falha de auth vira 500 genérico e a causa real some dos logs.
      const result = await get(photo.url, token ? { access: "public", token } : { access: "public" });
      if (result && result.statusCode === 200 && result.stream) {
        return new Response(result.stream as unknown as ReadableStream, {
          headers: {
            "Content-Type": result.blob.contentType || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    } catch (err) {
      lastError = err;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[photos/file] falha ao buscar blob "${photo.url}": ${detail}`);
  return new Response(`Não foi possível carregar a foto: ${detail}`, { status: 502 });
}
