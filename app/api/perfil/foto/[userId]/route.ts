import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Serve os bytes da foto de perfil (Blob privado — ver app/api/perfil/foto/upload/route.ts).
// Rota pública (só precisa saber o userId, que já é público em vários lugares do app, ex.:
// nomes/iniciais na Equipe) — mesmo padrão de app/api/photos/file/[id] para as fotos do blog.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { photoUrl: true } });
  if (!user?.photoUrl) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  let result;
  try {
    result = await get(user.photoUrl, { access: "private" });
  } catch (err) {
    console.error("Erro ao buscar foto de perfil no Vercel Blob:", err);
    return new Response("Erro ao buscar foto", { status: 502 });
  }

  if (!result || result.statusCode !== 200) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      // O nome do blob muda a cada novo upload (Date.now()), então o conteúdo desta URL
      // específica nunca muda — mas o navegador precisa buscar de novo quando a pessoa troca
      // de foto, e como a URL é sempre a mesma (/api/perfil/foto/{userId}), usamos um cache
      // curto em vez de "immutable" (diferente das fotos do blog, que nunca trocam de dono).
      "Cache-Control": "private, max-age=60",
    },
  });
}
