import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog Jurídico | Rodarte Prado Advogados",
  description: "Atualidades de jurisprudência, legislação e doutrina do escritório Rodarte Prado Advogados.",
};

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

export default async function BlogPage({ searchParams }: { searchParams: { area?: string } }) {
  const areaFilter = searchParams.area?.trim() || "";

  const [posts, allPublished] = await Promise.all([
    prisma.blogPost.findMany({
      where: { status: "PUBLICADO", ...(areaFilter ? { area: areaFilter } : {}) },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.blogPost.findMany({ where: { status: "PUBLICADO" }, select: { area: true } }),
  ]);

  const areas = Array.from(new Set(allPublished.map((p) => p.area))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <div className="min-h-screen">
      <header className="bg-navy-900 px-6 py-10 text-center">
        <div className="flex items-center gap-1.5 mb-1.5 justify-center">
          <span className="h-px w-10 bg-gold-500/60" />
          <span className="h-1 w-1 rounded-full bg-gold-500" />
          <span className="h-px w-10 bg-gold-500/60" />
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide text-cream-50">RODARTE PRADO ADVOGADOS</h1>
        <p className="text-[11px] tracking-[0.3em] text-gold-500 font-medium mt-1">BLOG JURÍDICO</p>
        <p className="text-sm text-cream-50/70 mt-3 max-w-xl mx-auto">
          Jurisprudência, legislação e doutrina em atualização — civil, consumerista, empresarial, tributário, trabalhista, previdenciário e mais.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {areas.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            <Link
              href="/blog"
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                !areaFilter ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
              }`}
            >
              Todas as áreas
            </Link>
            {areas.map((area) => (
              <Link
                key={area}
                href={`/blog?area=${encodeURIComponent(area)}`}
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                  areaFilter === area ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
                }`}
              >
                {area}
              </Link>
            ))}
          </div>
        )}

        {posts.length === 0 ? (
          <div className="text-center py-20 text-navy-800/40">
            <p className="font-medium">
              {areaFilter ? `Nenhuma matéria publicada em "${areaFilter}" ainda.` : "Nenhuma matéria publicada ainda."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="bg-white rounded-xl border border-navy-800/8 shadow-card overflow-hidden hover:shadow-pop transition-shadow flex flex-col"
              >
                {post.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.imageUrl} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="p-5 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge color="navy">{post.area}</Badge>
                    <Badge color="gold">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                  </div>
                  <h2 className="font-serif font-bold text-navy-900 text-lg leading-snug">{post.title}</h2>
                  <p className="text-sm text-navy-800/60 flex-1">{post.summary}</p>
                  {post.publishedAt && (
                    <p className="text-[11px] text-navy-800/40 mt-1">
                      {post.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-navy-800/40 py-8">
        Rodarte Prado Advogados — conteúdo informativo, não substitui consulta jurídica.
      </footer>
    </div>
  );
}
