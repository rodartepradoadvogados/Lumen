import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await prisma.blogPost.findUnique({ where: { slug: params.slug } });
  if (!post || post.status !== "PUBLICADO") return { title: "Matéria não encontrada | Rodarte Prado Advogados" };
  return {
    title: `${post.title} | Blog Jurídico Rodarte Prado Advogados`,
    description: post.summary,
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await prisma.blogPost.findUnique({ where: { slug: params.slug } });

  if (!post || post.status !== "PUBLICADO") {
    notFound();
  }

  const sourceLinks = (post.sources || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen">
      <header className="bg-navy-900 px-6 py-8 text-center">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-500 hover:text-gold-400">
          <ArrowLeft size={14} /> Voltar ao blog
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <article className="bg-white rounded-xl border border-navy-800/8 shadow-card overflow-hidden">
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imageUrl} alt="" className="w-full max-h-80 object-cover" />
          )}
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge color="navy">{post.area}</Badge>
              <Badge color="gold">{TYPE_LABELS[post.type] ?? post.type}</Badge>
            </div>
            <h1 className="font-serif font-bold text-navy-900 text-2xl sm:text-3xl leading-tight">{post.title}</h1>
            {post.publishedAt && (
              <p className="text-xs text-navy-800/45">
                Publicado em{" "}
                {post.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            )}
            <p className="text-base text-navy-800/70 italic border-l-2 border-gold-500/50 pl-3">{post.summary}</p>

            <div className="prose-like text-navy-900 text-[15px] leading-relaxed space-y-4">
              {post.content
                .split(/\n+/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>

            {sourceLinks.length > 0 && (
              <div className="pt-4 border-t border-navy-800/8">
                <p className="text-xs font-semibold text-navy-800/55 uppercase mb-2">Fontes</p>
                <ul className="space-y-1">
                  {sourceLinks.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-gold-700 hover:underline break-all">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>

        <p className="text-center text-[11px] text-navy-800/40 mt-8">
          Rodarte Prado Advogados — conteúdo informativo, não substitui consulta jurídica.
        </p>
      </main>
    </div>
  );
}
