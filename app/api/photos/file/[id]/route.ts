import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Rota pública (sem checagem de autenticação/admin) que serve os BYTES de uma
// foto da biblioteca. Necessária porque o Blob Store do Vercel é privado
// (veja app/api/photos/upload/route.ts) — o `photo.url` salvo no banco não é
// acessível diretamente pelo navegador, então buscamos o conteúdo aqui, do
// lado do servidor (com a credencial do projeto), e devolvemos como resposta
// normal de imagem. Usada tanto pelo blog público (/blog, /blog/[slug])
// quanto pelo fundo decorativo do site (SiteBackgroundLayer) e pelos
// gerenciadores internos — não expõe nenhum dado sensível, só a imagem.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const photo = await prisma.photo.findUnique({ where: { id: params.id } });
  if (!photo) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  let result;
  try {
    result = await get(photo.url, { access: "private" });
  } catch (err) {
    console.error("Erro ao buscar foto no Vercel Blob:", err);
    return new Response("Erro ao buscar foto", { status: 502 });
  }

  if (!result || result.statusCode !== 200) {
    return new Response("Foto não encontrada", { status: 404 });
  }

  // O `pathname` de cada blob já inclui um timestamp único (Date.now() no
  // momento do upload — veja app/api/photos/upload/route.ts), então o
  // conteúdo servido por esta URL nunca muda: cache longo e imutável é seguro.
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
