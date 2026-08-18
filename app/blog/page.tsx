import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformOffice } from "@/lib/officeModules";
import { Badge } from "@/components/ui";
import LumenMark from "@/components/LumenMark";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog Jurídico | Lúmen",
  description: "Atualidades de jurisprudência, legislação e doutrina, publicadas pelo Lúmen.",
  openGraph: {
    title: "Blog Jurídico | Lúmen",
    description: "Atualidades de jurisprudência, legislação e doutrina, publicadas pelo Lúmen.",
    type: "website",
    locale: "pt_BR",
  },
};

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

export default async function BlogPage() {
  // Escritório dono da plataforma (Rodarte Prado) — ver getPlatformOffice em
  // lib/officeModules.ts. Antes resolvia pelo Office mais antigo, divergindo do critério
  // (isInternal) que app/api/blog/draft/route.ts já usava para gravar as matérias do robô — se
  // os dois Office não coincidissem, tudo publicado ficava invisível aqui (achado A34 da revisão
  // gauntlet).
  const office = await getPlatformOffice();
  const posts = office
    ? await prisma.blogPost.findMany({
        where: { officeId: office.id, status: "PUBLICADO" },
        orderBy: { publishedAt: "desc" },
      })
    : [];

  return (
    <div className="min-h-screen bg-sf-fundo">
      {/* Masthead grafite-800 fixo, nos dois temas — é chrome/marca do site público, não
          conteúdo, mesmo raciocínio do rail e da barra de menus (DESIGN-SYSTEM.md §3). Por
          isso o texto aqui é branco/ouro fixos: --acao/--tx trocam de tema e, no Manhã,
          ficariam ilegíveis contra um fundo que não troca. */}
      <header className="bg-grafite-800 px-6 py-10 text-center">
        <div className="flex justify-center mb-2">
          <LumenMark size={40} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wide text-white [font-family:var(--font-blog-serif)]">
          LÚMEN
        </h1>
        <p className="text-[11px] tracking-[0.3em] text-marca font-medium mt-1">BLOG JURÍDICO</p>
        <p className="text-sm text-white/70 mt-3 max-w-xl mx-auto">
          Jurisprudência, legislação e doutrina em atualização — civil, consumerista, empresarial, tributário, trabalhista, previdenciário e mais.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-tx-3">
            <p className="font-medium">Nenhuma matéria publicada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="bg-sf rounded-xl border border-regua overflow-hidden hover:border-regua-forte transition-colors flex flex-col"
              >
                {post.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.imageUrl} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="p-5 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge color="slate">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                  </div>
                  <h2 className="font-bold text-tx text-lg leading-snug [font-family:var(--font-blog-serif)]">
                    {post.title}
                  </h2>
                  <p className="text-sm text-tx-2 flex-1 text-justify hyphens-auto">{post.summary}</p>
                  {post.publishedAt && (
                    <p className="text-[11px] text-tx-2 mt-1">
                      {post.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  )}
                  <span className="text-xs font-semibold text-acao inline-flex items-center gap-1 mt-1">Ler matéria completa →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-tx-3 py-8">
        Lúmen — conteúdo informativo, não substitui consulta jurídica.
      </footer>
    </div>
  );
}
