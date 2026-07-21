import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Newsreader, Public_Sans } from "next/font/google";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import GJMark from "@/components/GJMark";
import HomepageReveal from "@/components/HomepageReveal";
import styles from "./homepage.module.css";

// Homepage PÚBLICA (antes do login) do produto de software "Gestão Jurídica" — não é uma
// página do escritório Rodarte Prado. Vive em "/" e substitui o Painel interno, que se
// mudou para "/painel" (ver app/(app)/painel/page.tsx, components/Sidebar.tsx,
// lib/actions/auth.ts e middleware.ts). Busca matérias reais do blog jurídico a cada
// request, no mesmo padrão de app/blog/page.tsx.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gestão Jurídica — Software de gestão para escritórios de advocacia",
  description:
    "Processos, prazos, financeiro, atendimento e um blog jurídico atualizado todos os dias — tudo em um só sistema de gestão para escritórios de advocacia.",
};

// Fontes exclusivas desta página — deliberadamente diferentes de Playfair Display/Inter
// (usadas pelo sistema interno em app/layout.tsx). Aplicadas só na <div> que envolve o
// conteúdo desta rota via `.variable`, nunca no <body> global.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-gj-serif",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-gj-sans",
});

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia", ANALISE: "Análise" };

const FEATURES = [
  "Processos e prazos",
  "Financeiro completo",
  "Atendimento (e-mail e WhatsApp)",
  "CRM e funil comercial",
  "Produtividade e tarefas",
  "Blog jurídico automatizado",
  "Relatórios e indicadores",
  "Aplicativo mobile",
];

// O campo `sources` (prisma/schema.prisma) é texto livre com uma URL por linha. Extrai até
// 2 fontes, usando o hostname (sem "www.") como rótulo visível e a URL real como link.
function parseSources(sources: string | null | undefined): { label: string; href: string }[] {
  if (!sources) return [];
  return sources
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((url) => {
      let label = url;
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // URL malformada — usa o texto bruto como rótulo mesmo assim, em vez de quebrar a página.
      }
      return { label, href: url };
    });
}

type BlogPostLite = {
  slug: string;
  title: string;
  summary: string;
  area: string;
  type: string;
  sources: string | null;
};

function SourcesLine({ sources }: { sources: { label: string; href: string }[] }) {
  if (sources.length === 0) return null;
  return (
    <p className={styles.sourcesLine}>
      <b>Fontes:</b>{" "}
      {sources.map((s, i) => (
        <span key={s.href}>
          {i > 0 && " · "}
          <a className={styles.src} href={s.href} target="_blank" rel="noopener noreferrer">
            {s.label}
          </a>
        </span>
      ))}
    </p>
  );
}

function ArticleRow({ post }: { post: BlogPostLite }) {
  const sources = parseSources(post.sources);
  return (
    <Link href={`/blog/${post.slug}`} className={styles.articleRow}>
      <div className={styles.tagRow}>
        <span className={styles.tag}>{post.area}</span>
        <span className={`${styles.tag} ${styles.tagType}`}>{TYPE_LABELS[post.type] ?? post.type}</span>
      </div>
      <h3>{post.title}</h3>
      <p className={styles.dek}>{post.summary}</p>
      <SourcesLine sources={sources} />
    </Link>
  );
}

export default async function HomePage() {
  // Usuário com sessão válida nunca vê a homepage de marketing — vai direto pro Painel.
  const user = await getCurrentUser();
  if (user) {
    redirect("/painel");
  }

  const posts = await prisma.blogPost.findMany({
    where: { status: "PUBLICADO" },
    orderBy: { publishedAt: "desc" },
    take: 3,
  });

  const [featured, ...restPosts] = posts;
  const sideArticles = restPosts.slice(0, 2);
  const featuredSources = featured ? parseSources(featured.sources) : [];

  return (
    <div className={`${styles.page} ${newsreader.variable} ${publicSans.variable}`}>
      <nav className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <div className={styles.brandMark}>
            <GJMark />
            <span className={styles.wordmark}>Gestão&nbsp;Jurídica</span>
          </div>
          <div className={styles.navLinks}>
            <a className={styles.navLinkPlain} href="#leitura">
              Blog
            </a>
            <a className={styles.navLinkPlain} href="#funcionalidades">
              Funcionalidades
            </a>
            <Link className={styles.navLinkPlain} href="/login">
              Entrar
            </Link>
            <a className={styles.navCta} href="#leitura">
              Ler o blog
            </a>
          </div>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroImageWrap}>
          <Image
            src="/homepage/hero.webp"
            alt="Escritório de advocacia com vista da cidade ao entardecer"
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover" }}
          />
        </div>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>Software de gestão jurídica</span>
          <h1 className={styles.heroTitle}>
            Gestão de verdade não é planilha.
            <br />É saber o que <em>mudou hoje</em>.
          </h1>
          <p className={styles.heroSub}>
            Processos, prazos, financeiro e atendimento em um só lugar — com um blog jurídico atualizado todos os
            dias, sempre com as fontes originais linkadas para você conferir.
          </p>
          <div className={styles.heroCtas}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="#leitura">
              Ler o blog
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="#funcionalidades">
              Conhecer o Gestão Jurídica
            </a>
          </div>
        </div>
        <div className={styles.scrollCue}>
          <span>Role</span>
          <span className={styles.scrollCueLine} />
        </div>
      </header>

      <section id="leitura" className={styles.section}>
        <div className={styles.wrap}>
          <HomepageReveal as="div" className={`${styles.sectionHead} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
            <span className={styles.eyebrow}>Blog jurídico</span>
            <h2>O que mudou no direito esta semana</h2>
            <p>
              Decisões de tribunais superiores, mudanças de lei e teses vinculantes, em poucos parágrafos — com link
              direto para a fonte, sempre. Leia o resumo ou vá direto à decisão original.
            </p>
          </HomepageReveal>

          {!featured ? (
            <p className={styles.emptyReading}>Nenhuma matéria publicada ainda — em breve, novidades por aqui.</p>
          ) : (
            <HomepageReveal
              as="div"
              className={`${styles.readingGrid} ${sideArticles.length === 0 ? styles.readingGridSingle : ""} ${styles.reveal}`}
              visibleClassName={styles.revealVisible}
            >
              <Link href={`/blog/${featured.slug}`} className={styles.articleFeatured}>
                <div className={styles.articleFeaturedImageWrap}>
                  <Image
                    src="/homepage/blog-featured.webp"
                    alt="Lombadas de livros jurídicos em uma estante"
                    fill
                    sizes="(max-width: 860px) 100vw, 60vw"
                    style={{ objectFit: "cover" }}
                  />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>{featured.area}</span>
                    <span className={`${styles.tag} ${styles.tagType}`}>
                      {TYPE_LABELS[featured.type] ?? featured.type}
                    </span>
                  </div>
                  <h3 className={styles.articleFeaturedTitle}>{featured.title}</h3>
                  <p className={styles.dek}>{featured.summary}</p>
                  <SourcesLine sources={featuredSources} />
                </div>
              </Link>

              {sideArticles.length > 0 && (
                <div className={styles.sideCol}>
                  {sideArticles.map((post) => (
                    <ArticleRow key={post.slug} post={post} />
                  ))}
                  {sideArticles.length < 2 && (
                    <Link href="/blog" className={styles.articleRow} style={{ justifyContent: "space-between" }}>
                      <div>
                        <span className={styles.eyebrow} style={{ display: "block", marginBottom: "0.6rem" }}>
                          Todos os dias
                        </span>
                        <h3 style={{ fontSize: "1.02rem" }}>
                          Sem espera de boletim mensal — o blog acompanha o noticiário jurídico diariamente.
                        </h3>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </HomepageReveal>
          )}

          <HomepageReveal as="div" className={`${styles.ctaLine} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
            <Link className={styles.linkArrow} href="/blog">
              Ver todas as matérias do blog
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 8H14M14 8L9 3M14 8L9 13"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <p className={styles.validationNote}>
              Assinado por quem escreveu — nenhuma matéria vai ao ar sem a leitura de um advogado antes.
            </p>
          </HomepageReveal>
        </div>
      </section>

      <section id="funcionalidades" className={`${styles.section} ${styles.featuresSection}`}>
        <div className={styles.wrap}>
          <div className={styles.featuresGrid}>
            <HomepageReveal as="div" className={styles.reveal} visibleClassName={styles.revealVisible}>
              <span className={styles.eyebrow}>Funcionalidades</span>
              <h2 style={{ marginTop: "0.7rem", fontSize: "clamp(1.9rem, 3.6vw, 2.6rem)" }}>
                Um sistema, não uma pilha de planilhas
              </h2>
              <p style={{ marginTop: "1rem", color: "var(--mist)", maxWidth: "46ch" }}>
                Tudo que o dia a dia de um escritório precisa, em um só lugar — do prazo processual ao fechamento do
                mês.
              </p>
              <ul className={styles.featuresList}>
                {FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </HomepageReveal>
            <HomepageReveal
              as="figure"
              className={`${styles.featuresPhoto} ${styles.reveal}`}
              visibleClassName={styles.revealVisible}
            >
              <Image
                src="/homepage/funcionalidades.webp"
                alt="Sala de audiência de tribunal"
                fill
                sizes="(max-width: 860px) 100vw, 40vw"
                style={{ objectFit: "cover" }}
              />
              <figcaption className={styles.featuresPhotoCaption}>
                Audiências e prazos, sempre visíveis — nada se perde numa aba esquecida.
              </figcaption>
            </HomepageReveal>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <HomepageReveal as="div" className={`${styles.sectionHead} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
            <span className={styles.eyebrow}>Como escrevemos</span>
            <h2>Leitura rápida, fonte à vista</h2>
          </HomepageReveal>
          <HomepageReveal as="div" className={`${styles.wrapInner} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
            <figure className={styles.valuePhoto}>
              <Image
                src="/homepage/como-escrevemos.webp"
                alt="Biblioteca com mesa de leitura e luminária"
                fill
                sizes="(max-width: 860px) 100vw, 35vw"
                style={{ objectFit: "cover" }}
              />
            </figure>
            <div className={styles.valueGrid}>
              <div className={styles.valueCard}>
                <svg className={styles.glyph} viewBox="0 0 34 34" fill="none">
                  <path
                    d="M14 20L20 14M14.5 22.5L10 27C8 29 5 26 7 24L11.5 19.5M19.5 14.5L24 10C26 8 29 11 27 13L22.5 17.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <h3>Sempre linkado</h3>
                  <p>
                    Cada matéria vem com as fontes originais linkadas, lado a lado — a fonte jornalística e a decisão
                    oficial do tribunal. Você lê, e confere.
                  </p>
                </div>
              </div>
              <div className={styles.valueCard}>
                <svg className={styles.glyph} viewBox="0 0 34 34" fill="none">
                  <circle cx="17" cy="17" r="12.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M17 10V17L21.5 20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <h3>Todo dia, coisa nova</h3>
                  <p>
                    Sem esperar boletim mensal: o blog acompanha o noticiário jurídico diariamente, assim que uma
                    decisão relevante é confirmada.
                  </p>
                </div>
              </div>
              <div className={styles.valueCard}>
                <svg className={styles.glyph} viewBox="0 0 34 34" fill="none">
                  <path d="M8 26V11L17 5L26 11V26" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M13 26V18H21V26" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                <div>
                  <h3>Assinado por um advogado</h3>
                  <p>Nenhuma matéria vai ao ar sem passar pela leitura de um advogado antes da publicação.</p>
                </div>
              </div>
            </div>
          </HomepageReveal>
        </div>
      </section>

      <footer id="contato" className={styles.footer}>
        <div className={styles.footerBgPhoto}>
          <Image src="/homepage/rodape.webp" alt="" fill sizes="100vw" style={{ objectFit: "cover" }} />
        </div>
        <div className={`${styles.wrap} ${styles.footerWrap}`}>
          <div className={styles.footerTop}>
            <HomepageReveal as="div" className={`${styles.footerLede} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
              <div className={styles.footerBrand}>
                <GJMark size={32} />
                <span className={styles.wordmark}>Gestão Jurídica</span>
              </div>
              <h2>Gestão para escritórios que não têm tempo a perder.</h2>
              <p>Conte o essencial do seu escritório — a equipe responde diretamente, sem triagem automática.</p>
              <div className={styles.heroCtas} style={{ marginTop: "1.6rem" }}>
                <a className={`${styles.btn} ${styles.btnPrimary}`} href="#contato">
                  Agendar uma demonstração
                </a>
              </div>
            </HomepageReveal>
            <HomepageReveal as="div" className={`${styles.footerCols} ${styles.reveal}`} visibleClassName={styles.revealVisible}>
              <div className={styles.footerCol}>
                <span className={styles.eyebrow}>Contato</span>
                <ul>
                  <li>
                    <span>Goiânia — GO</span>
                  </li>
                  <li>
                    <span>Telefone — a definir</span>
                  </li>
                  <li>
                    <span>E-mail — a definir</span>
                  </li>
                </ul>
              </div>
              <div className={styles.footerCol}>
                <span className={styles.eyebrow}>Produto</span>
                <ul>
                  <li>
                    <a href="#leitura">Blog jurídico</a>
                  </li>
                  <li>
                    <a href="#funcionalidades">Funcionalidades</a>
                  </li>
                </ul>
              </div>
            </HomepageReveal>
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 — Gestão Jurídica · software de gestão para escritórios de advocacia</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
