import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformOffice } from "@/lib/officeModules";
import { minutosDeLeitura } from "@/lib/markdownSimples";
import CabecalhoBlog from "@/components/blog/CabecalhoBlog";
import FichaMateria from "@/components/blog/FichaMateria";

// P2-5 do roteiro de adequação: force-dynamic era redundante e removido — a paginação por
// searchParams (P2-3, ?page=N) já obriga o Next a renderizar esta rota dinamicamente por
// request (searchParams só é conhecido em tempo de requisição), então não há cache de borda a
// ganhar aqui de qualquer forma. Ver app/blog/[slug]/page.tsx (ISR de verdade) e app/page.tsx
// (cache da consulta ao banco) para os outros dois pontos do mesmo achado do $impeccable audit.

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

const PAGE_SIZE = 20;

export default async function BlogPage({ searchParams }: { searchParams: { page?: string } }) {
  // Escritório dono da plataforma (Rodarte Prado) — ver getPlatformOffice em
  // lib/officeModules.ts. Antes resolvia pelo Office mais antigo, divergindo do critério
  // (isInternal) que app/api/blog/draft/route.ts já usava para gravar as matérias do robô — se
  // os dois Office não coincidissem, tudo publicado ficava invisível aqui (achado A34 da revisão
  // gauntlet).
  const office = await getPlatformOffice();
  const page = Math.max(1, Number(searchParams.page) || 1);
  // Busca uma a mais que o tamanho da página só para saber se existe próxima página, sem
  // precisar de um count() à parte (achado P2-3 do plano de adequação: antes buscava tudo).
  const rows = office
    ? await prisma.blogPost.findMany({
        where: { officeId: office.id, status: "PUBLICADO" },
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
      })
    : [];
  const hasNext = rows.length > PAGE_SIZE;
  const posts = rows.slice(0, PAGE_SIZE);

  return (
    <div className="min-h-screen bg-sf-fundo">
      <CabecalhoBlog nomeDaSecao={false} />

      <main className="faixa-site py-10">
        {/* A identidade editorial desceu do cromo para o papel. Antes ela vivia dentro do masthead
            grafite, centralizada, com a marca repetida em tipo grande — quase uma tela de cromo
            antes da primeira matéria. Aqui ela é conteúdo, que é o que ela sempre foi. */}
        <div className="max-w-[46ch] mb-10">
          <h1 className="text-autuacao font-bold text-tx [font-family:var(--font-blog-serif)]">
            Blog Jurídico
          </h1>
          <p className="text-corpo text-tx-2 mt-3">
            Jurisprudência, legislação e doutrina em atualização — civil, consumerista, empresarial,
            tributário, trabalhista, previdenciário e mais. Toda matéria traz as fontes que a
            sustentam.
          </p>
        </div>

        {posts.length === 0 ? (
          // Vazio que diz o que está acontecendo e o que fazer, em vez de só constatar a ausência.
          <div className="border-2 border-regua-forte bg-sf rounded-[2px] p-8 max-w-[46ch]">
            <p className="text-destaque font-bold text-tx">Ainda não há matéria publicada.</p>
            <p className="text-corpo text-tx-2 mt-2">
              As matérias são conferidas contra pelo menos duas fontes independentes antes de entrar
              no ar — as primeiras aparecem aqui assim que passarem por essa conferência.
            </p>
            <Link
              href="/"
              className="inline-block mt-5 text-corpo font-semibold text-marca-tx underline underline-offset-4"
            >
              Conhecer o Lúmen enquanto isso →
            </Link>
          </div>
        ) : (
          // MANCHETE E COLUNAS — forma escolhida pelo dono em 17/09/2026, entre três propostas,
          // depois do apontamento "precisa de um jeito mais criativo de mostrar as matérias; não
          // precisa ser tudo do mesmo tamanho, quadrático".
          //
          // Eram duas colunas de fichas idênticas: a matéria de hoje e a de três semanas atrás
          // ocupavam exatamente o mesmo espaço, então a página não dizia por onde começar. A
          // manchete devolve essa hierarquia, e ela é de TEMPO — o que é mais novo é maior —, que
          // é a ordem que a lista já seguia (orderBy publishedAt desc) sem nunca mostrar.
          //
          // `[&>*:first-child]:sm:col-span-full`: a primeira ficha atravessa a grade inteira em
          // qualquer contagem de colunas. Escrito como seletor, e não como `posts.map` com if,
          // para a manchete não exigir um ramo de renderização próprio — é a mesma peça.
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 [&>*:first-child]:sm:col-span-full">
            {posts.map((post, i) => (
              <FichaMateria
                key={post.id}
                slug={post.slug}
                titulo={post.title}
                resumo={post.summary}
                area={post.area}
                formato={TYPE_LABELS[post.type] ?? post.type}
                minutos={minutosDeLeitura(post.content)}
                publicadoEm={post.publishedAt}
                imagem={post.imageUrl}
                // Só na PRIMEIRA PÁGINA: na página 3 a "manchete" seria a 25ª matéria mais
                // recente, e destacá-la mentiria sobre o que ela é.
                manchete={i === 0 && page === 1}
              />
            ))}
          </div>
        )}

        {(page > 1 || hasNext) && (
          <nav className="flex justify-between gap-3 pt-10" aria-label="Paginação">
            {page > 1 ? (
              <Link
                href={`/blog?page=${page - 1}`}
                className="text-corpo font-semibold text-marca-tx underline underline-offset-4 transition-colors duration-100 ease-out hover:text-tx"
              >
                ← Página anterior
              </Link>
            ) : (
              <span />
            )}
            {hasNext && (
              <Link
                href={`/blog?page=${page + 1}`}
                className="text-corpo font-semibold text-marca-tx underline underline-offset-4 transition-colors duration-100 ease-out hover:text-tx"
              >
                Próxima página →
              </Link>
            )}
          </nav>
        )}
      </main>

      <footer className="border-t-2 border-regua-forte mt-10">
        <p className="faixa-site py-8 text-etiqueta text-tx-3">
          Lúmen — conteúdo informativo, não substitui consulta jurídica.
        </p>
      </footer>
    </div>
  );
}
