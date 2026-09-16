import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformOffice } from "@/lib/officeModules";
import { renderizarMarkdownSimples, minutosDeLeitura } from "@/lib/markdownSimples";
import CabecalhoBlog from "@/components/blog/CabecalhoBlog";
import FichaMateria from "@/components/blog/FichaMateria";

// P2-5 do roteiro de adequação: sem sessão/cookie nenhum nesta página (ao contrário de
// app/page.tsx) — matéria de blog muda no máximo algumas vezes por dia, então ISR simples
// resolve de verdade o "cache de borda" que a ficha pede, sem nenhum dos entraves de
// app/page.tsx. revalidatePath/revalidateTag não é necessário aqui: o robô de conteúdo jurídico
// só publica matéria nova (slug novo, cache-miss natural); edição de matéria já publicada não
// existe hoje neste fluxo.
export const revalidate = 300;

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

// Mostra o domínio no lugar da URL crua. A lista de fontes é o mecanismo de honestidade do blog —
// é ela que sustenta a afirmação de que a matéria foi conferida — e estava impressa como uma
// parede de caracteres com `break-all`, que ninguém lê e que não diz de QUEM é a fonte. O domínio
// diz (stj.jus.br, planalto.gov.br, in.gov.br); a URL inteira continua no href e no title.
function dominioDe(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || url;
  } catch {
    return url;
  }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Ver nota acima em generateMetadata sobre o filtro por officeId.
  const office = await getPlatformOffice();
  const post = office ? await prisma.blogPost.findFirst({ where: { slug: params.slug, officeId: office.id } }) : null;

  if (!post || post.status !== "PUBLICADO") {
    notFound();
  }

  // Continuação de leitura. Sem isto, o fim da matéria era um beco: o leitor orgânico terminava de
  // ler e a única saída visível era a barra do topo, que ele já tinha rolado para longe. Preferência
  // pela mesma área do direito — quem leu sobre tributário costuma querer tributário.
  // Duas consultas estreitas em vez de uma larga: pedir as 20 mais recentes e filtrar por área em
  // JS não garante NENHUMA da mesma área, e ordenar por área no banco destruiria a ordem por data.
  // A primeira busca a mesma área; a segunda completa com as mais recentes de qualquer área,
  // excluindo o que a primeira já trouxe.
  const camposDaFicha = {
    id: true, slug: true, title: true, summary: true, area: true,
    type: true, content: true, publishedAt: true,
  } as const;
  const mesmaArea = office
    ? await prisma.blogPost.findMany({
        where: { officeId: office.id, status: "PUBLICADO", area: post.area, slug: { not: post.slug } },
        orderBy: { publishedAt: "desc" },
        take: 2,
        select: camposDaFicha,
      })
    : [];
  const recentes =
    office && mesmaArea.length < 2
      ? await prisma.blogPost.findMany({
          where: {
            officeId: office.id,
            status: "PUBLICADO",
            slug: { notIn: [post.slug, ...mesmaArea.map((p) => p.slug)] },
          },
          orderBy: { publishedAt: "desc" },
          take: 2 - mesmaArea.length,
          select: camposDaFicha,
        })
      : [];
  const proximas = [...mesmaArea, ...recentes];

  const fontes = (post.sources || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const minutos = minutosDeLeitura(post.content);

  return (
    <div className="min-h-screen bg-sf-fundo">
      <CabecalhoBlog voltarParaOBlog />

      {/* `max-w-2xl` e não `3xl`: a medida do corpo é governada por `.artigo` (68ch ≈ 578px), e
          num cartão de 696px úteis o texto terminava 118px antes da régua direita — margem
          esquerda de 36px contra ~144px à direita, com a manchete ocupando a largura toda e o
          corpo parecendo recuado em relação a ela. A 2xl a área útil fica em ~600px e as duas
          medidas se alinham. Visto na renderização; não dá para enxergar isso lendo classe. */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <article className="bg-sf border-2 border-regua-forte rounded-[2px] overflow-hidden">
          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imageUrl} alt="" loading="lazy" decoding="async" className="w-full max-h-80 object-cover" />
          )}
          <div className="p-6 sm:p-9">
            {/* A ÁREA do direito passa a aparecer. Está em toda matéria (BlogPost.area), tem índice
                próprio no banco e é prometida na descrição do blog — e a tela mostrava só o formato
                ("Notícia curta"/"Análise aprofundada"). Para quem lê blog jurídico, a área é o
                primeiro dado; o formato e o tempo de leitura vêm depois. */}
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-etiqueta font-extrabold uppercase tracking-[.12em] text-marca-tx">{post.area}</span>
              <span className="text-etiqueta text-tx-3">
                {TYPE_LABELS[post.type] ?? post.type} · {minutos} min de leitura
              </span>
            </div>

            {/* `sm:leading-` e não só `leading-`: a parada `tarja` da rampa carrega
                `line-height: 1` no próprio utilitário de tamanho, e um `sm:text-*` sai num bloco
                @media POSTERIOR ao `leading-*` sem prefixo — vence por ordem, não por
                especificidade. Sem o prefixo aqui, a manchete de duas linhas saía com entrelinha
                1,0 em 40px e as linhas quase se tocavam. Medido na renderização, não deduzido. */}
            <h1 className="font-bold text-tx text-autuacao sm:text-tarja leading-[1.12] sm:leading-[1.12] tracking-[-.015em] mt-3 [font-family:var(--font-blog-serif)]">
              {post.title}
            </h1>

            {post.publishedAt && (
              <time dateTime={post.publishedAt.toISOString()} className="block text-etiqueta text-tx-3 mt-3">
                Publicado em{" "}
                {post.publishedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </time>
            )}

            {/* O resumo NÃO leva filete nem itálico. Levava, e ficava idêntico a uma citação do
                corpo (`.artigo blockquote` é serifa itálica com filete bordô à esquerda) — duas
                vozes diferentes com a mesma roupa: o resumo é do editor, a citação é da fonte. A
                distinção agora é de tamanho e peso, que é como jornal distingue linha-fina de
                citação há um século. De quebra some o literal `vinho-500/60`, que não retematiza e
                a 60% de opacidade quase sumia sobre a ficha escura. */}
            <p className="text-guia text-tx-2 leading-[1.45] mt-6 [font-family:var(--font-blog-serif)]">
              {post.summary}
            </p>

            {/* O corpo passa pelo renderizador de markdown simples (lib/markdownSimples.tsx). Antes
                era `content.split(/\n+/).map(p => <p>{p}</p>)`: todo `## Título`, `- item` e
                `**negrito**` chegava à tela com os sinais crus, e as regras de `.artigo h2`,
                `.artigo ul`, `.artigo blockquote` e `.artigo strong` em globals.css eram letra
                morta — não havia como acioná-las. Texto corrido puro continua saindo igual. */}
            <div className="artigo mt-7 [font-family:var(--font-blog-serif)]">
              {renderizarMarkdownSimples(post.content)}
            </div>

            {fontes.length > 0 && (
              <div className="mt-9 pt-6 border-t border-regua">
                <p className="text-etiqueta font-extrabold uppercase tracking-[.12em] text-tx-3 mb-3">
                  Fontes conferidas
                </p>
                <ul className="space-y-1.5">
                  {fontes.map((url, i) => (
                    <li key={i}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={url}
                        className="text-corpo text-marca-tx underline underline-offset-4 transition-colors duration-100 ease-out hover:text-tx"
                      >
                        {dominioDe(url)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </article>

        {proximas.length > 0 && (
          <section className="mt-10" aria-labelledby="continuar">
            <h2 id="continuar" className="text-etiqueta font-extrabold uppercase tracking-[.12em] text-tx-3 mb-4">
              Continuar lendo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {proximas.map((p) => (
                <FichaMateria
                  key={p.id}
                  slug={p.slug}
                  titulo={p.title}
                  resumo={p.summary}
                  area={p.area}
                  formato={TYPE_LABELS[p.type] ?? p.type}
                  minutos={minutosDeLeitura(p.content)}
                  publicadoEm={p.publishedAt}
                />
              ))}
            </div>
          </section>
        )}

        <p className="text-etiqueta text-tx-3 mt-10 pt-6 border-t-2 border-regua-forte">
          Lúmen — conteúdo informativo, não substitui consulta jurídica.
        </p>
      </main>
    </div>
  );
}
