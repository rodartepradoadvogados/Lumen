import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformOffice } from "@/lib/officeModules";
import { Badge } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

// NOTA (multi-tenant): esta é uma página PÚBLICA (sem usuário logado). O Blog Jurídico é
// recurso exclusivo do escritório dono da plataforma (getPlatformOffice, lib/officeModules.ts) —
// filtrar por esse officeId fecha a colisão de slug entre escritórios diferentes (@@unique(
// [officeId, slug]), não globalmente único) que ficava aberta antes só porque blogAccess está
// desligado em todo escritório novo (lib/actions/signup.ts) e nenhum outro Office publica hoje.
// Revisitar se blogAccess for concedido a mais de um Office (achado A34 da revisão gauntlet).
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const office = await getPlatformOffice();
  const post = office ? await prisma.blogPost.findFirst({ where: { slug: params.slug, officeId: office.id } }) : null;
  if (!post || post.status !== "PUBLICADO") return { title: "Matéria não encontrada | Lúmen" };
  const title = `${post.title} | Blog Jurídico Lúmen`;
  return {
    title,
    description: post.summary,
    openGraph: {
      title,
      description: post.summary,
      type: "article",
      locale: "pt_BR",
      publishedTime: post.publishedAt?.toISOString(),
      images: post.imageUrl ? [{ url: post.imageUrl }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Ver nota acima em generateMetadata sobre o filtro por officeId.
  const office = await getPlatformOffice();
  const post = office ? await prisma.blogPost.findFirst({ where: { slug: params.slug, officeId: office.id } }) : null;

  if (!post || post.status !== "PUBLICADO") {
    notFound();
  }

  const sourceLinks = (post.sources || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-sf-fundo">
      {/* Masthead grafite-800 fixo — chrome do site público, mesmo raciocínio de app/blog/page.tsx.
          "Voltar ao blog" fica branco, não --acao: --acao no Manhã é azul escuro e sumiria
          contra este fundo que não troca de tema. */}
      <header className="bg-grafite-800 px-6 py-8 text-center">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-white/80">
          <ArrowLeft size={14} /> Voltar ao blog
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-sf border-t-2 border-regua-forte overflow-hidden">
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imageUrl} alt="" className="w-full max-h-80 object-cover" />
          )}
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge color="slate">{TYPE_LABELS[post.type] ?? post.type}</Badge>
            </div>
            <h1 className="font-bold text-tx text-2xl sm:text-3xl leading-tight [font-family:var(--font-blog-serif)]">
              {post.title}
            </h1>
            {post.publishedAt && (
              <p className="text-xs text-tx-2">
                Publicado em{" "}
                {post.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            )}
            <p className="text-base text-tx italic border-l-2 border-vinho-500/60 pl-3 text-justify hyphens-auto [font-family:var(--font-blog-serif)]">
              {post.summary}
            </p>

            <div className="prose-like text-tx text-[15px] leading-relaxed space-y-4 text-justify hyphens-auto [font-family:var(--font-blog-serif)]">
              {post.content
                .split(/\n+/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>

            {sourceLinks.length > 0 && (
              <div className="pt-4 border-t border-regua">
                <p className="text-xs font-semibold text-tx-2 uppercase mb-2">Fontes</p>
                <ul className="space-y-1">
                  {sourceLinks.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-acao hover:underline break-all">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>

        <p className="text-center text-[11px] text-tx-3 mt-8">
          Lúmen — conteúdo informativo, não substitui consulta jurídica.
        </p>
      </main>
    </div>
  );
}
