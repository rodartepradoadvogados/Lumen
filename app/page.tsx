import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { calcularPrecoDoPlano, MODULOS } from "@/lib/officePricing";
import { formatCurrency } from "@/components/ui";
import LumenMark from "@/components/LumenMark";
import CookieConsent from "@/components/site/CookieConsent";
import MobileNav from "@/components/site/MobileNav";
import GrainOverlay from "@/components/GrainOverlay";

// Homepage PÚBLICA do produto de software "Lúmen" (documento 09 do redesenho: "o site passa a
// vender o Lúmen como SaaS de gestão jurídica para outros escritórios, não é mais a homepage do
// escritório Rodarte Prado"). Estrutura de 8 seções do documento, nesta ordem: barra, hero
// regrado, linha de números, 5 linhas de recurso, fotografia, preço, fecho em pôster, rodapé —
// sem carrossel (HomepageHeroCarousel saiu), sem card de login embutido (login virou uma
// página de verdade, ver app/login/page.tsx), sem gradiente/textura/canto arredondado.
//
// Cor: modelo B (Modernist puro) — o modelo A (ouro) do texto original do documento 09 foi
// superado pela decisão registrada em design_handoff_lumen_redesign/01-tokens-e-tema.md
// (19/08/2026) e pelos tokens de fato aplicados em app/globals.css e tailwind.config.ts: bordô
// (--marca, #8a2f42), não o vermelho-alaranjado (#ec3013) do rascunho original do documento 09 —
// ajuste feito na mesma decisão de 19/08, por render de contraste melhor sobre branco (~8:1
// contra o vermelho antigo, ver comentário de --marca em app/globals.css). O "fecho em pôster"
// (única seção onde a cor corre como campo) usa --marca. A marca (LumenMark) mantém sua paleta
// própria e fixa (ouro+grafite, manual da marca v2) — não segue o modelo A/B da UI.
//
// Campos em aberto (dados reais a preencher depois, não inventados aqui — documento 09: "só
// números que o escritório possa comprovar" / revisão OAB do preço): 3 dos 4 números da seção
// de estatísticas (só "93 tribunais integrados" é real hoje, os outros ficam em branco).
// Fotografia do escritório, CNPJ e DPO não têm dado real disponível e por isso saíram do texto
// público em vez de aparecer como mockup: seção 5 virou uma faixa gráfica com o número real de
// tribunais, o rodapé usa o e-mail de contato já existente como DPO e não exibe CNPJ algum —
// ajustar quando os dados corretos existirem.
//
// Seção 6 (Preço) não tem mais array hardcoded: lê o catálogo de planos e o preço por módulo
// direto do banco (Plan/ModulePrice, Painel Mestre → Preços) — "automatize isso" (pedido do
// dono). Plano cujo módulo incluso ainda não tem preço configurado mostra a mesma moldura
// tracejada "Substituir" de antes; vira número real sozinho assim que o operador preencher o
// preço do módulo, sem precisar mexer neste arquivo.
//
// P2-5 do roteiro de adequação (.impeccable/plano-adequacao/roteiro-de-adequacao.md): força
// dynamic-render (getCurrentUser() já obriga isso sozinho, por causa do cookies() que ela chama
// por baixo — todo visitante, logado ou não, precisa dessa checagem ao vivo pra decidir se vê a
// home ou é redirecionado pro painel). O "$impeccable audit" apontava certo o sintoma (ida ao
// banco ao vivo pra buscar plano/preço, conteúdo que muda no máximo algumas vezes por dia) mas
// as duas correções sugeridas na ficha não servem NESTE stack: não há Partial Prerendering
// estável no Next 14.2 pra separar a parte estática da dinâmica numa mesma rota, e mover a
// checagem de sessão pro middleware.ts exigiria rodar Prisma ali — o middleware roda em Edge
// Runtime (Next 14 não tem Node.js middleware) e @prisma/client sem driver adapter não funciona
// em Edge. Fix aplicado: a leitura de Plan/ModulePrice (a parte "conteúdo" do problema) foi pra
// dentro de um unstable_cache (getHomepagePricingData, abaixo) — tira o round-trip ao banco em
// toda visita, sem tocar a checagem de sessão (que continua 100% dinâmica, por request). Não
// resolve o "cache de borda" da resposta HTTP inteira citado na ficha (impossível sem PPR/
// middleware neste stack), só a causa concreta de custo (ida ao banco). updateModulePrice/
// updatePlan/setRecommendedPlan (lib/actions/painelMestre.ts) já chamavam revalidatePath("/")
// — antes um no-op nesta rota sempre dinâmica, agora invalida de fato o unstable_cache abaixo.
//
// P3-2 do roteiro de adequação: escala tipográfica PRÓPRIA do site público (marketing + blog),
// exceção DELIBERADA à escala do DESIGN.md (24/16/14/12px — pensada pra tela de trabalho do
// produto), documentada aqui em vez de corrigida — mesmo espírito da exceção de fonte do blog
// (app/blog/layout.tsx: Lora só ali, resto do produto segue Archivo). Landing e blog são
// vitrine/leitura, não tela de trabalho, e já tiveram sua hierarquia validada visualmente nas
// rodadas anteriores deste mesmo roteiro (P0-1, P0-2, P1-1, P2-1, P0-5 etc.) — os valores
// próprios (9.5/11/13/15/26/30px, mais o hero em clamp()) não são resquício a convergir num
// sweep futuro para 24/16/14/12, são a hierarquia de página de marketing que já está no ar.
// Mesma exceção vale para app/blog/page.tsx e app/blog/[slug]/page.tsx.
export const dynamic = "force-dynamic";

const getHomepagePricingData = unstable_cache(
  async () => {
    const [plansRaw, modulePrices] = await Promise.all([
      prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.modulePrice.findMany(),
    ]);
    return { plansRaw, modulePrices };
  },
  ["homepage-pricing"],
  { revalidate: 300 },
);

export const metadata = {
  title: "Lúmen — Software de gestão para escritórios de advocacia",
  description:
    "Publicações triadas, o dia na frente, peticionamento com o timbrado do escritório e financeiro que fecha — tudo em um só sistema de gestão para escritórios de advocacia.",
};

// Cada `figure` também é a legenda acessível (aria-label) do diagrama de marca ao lado —
// ver FeatureDiagram. Diagrama provisório (réguas + bordô), não uma fotografia real do produto
// (P0-2 do roteiro de adequação, .impeccable/plano-adequacao/roteiro-de-adequacao.md).
const FEATURES = [
  {
    kicker: "Publicações",
    title: "Publicações que chegam triadas",
    p1: "DJEN e DATAJUD entram direto na fila do escritório, já separadas por processo e por fonte — sem copiar e colar de e-mail nem abrir site de tribunal um por um.",
    p2: "Cada publicação vem com um toque para gerar prazo, marcar audiência ou delegar — o texto de origem fica sempre acessível, sem sair da tela.",
    figure: "Lista de Publicações: card com filete por fonte (DJEN/DATAJUD/PJe), badge “Não lida”, ações “Gerar Prazo” e “Delegar”",
    diagram: "publicacoes" as const,
    // "Pilar" (junto com Sigilo abaixo) — os dois mecanismos que PRODUCT.md → Positioning cita
    // como diferencial real (captura de publicação por fonte oficial, privacidade auditável),
    // não só mais um item da lista. Tratamento maior, fundo com filete bordô — retomado da
    // proposta "pulso" (.impeccable/plano-site-publico/andamento-site-publico.md).
    pilar: true,
  },
  {
    kicker: "Painel",
    title: "O dia na frente",
    p1: "Um painel mostra o que vence hoje, o que já passou do prazo e a agenda da semana — com o calendário de feriados de cada tribunal já embutido no cálculo do prazo fatal.",
    p2: "Cada advogado vê a própria fila; quem administra o escritório vê o todo, sem precisar abrir uma planilha à parte.",
    figure: "Painel: cartões “Hoje”, “Atrasados”, agenda da semana, prazo de segurança marcado em cor distinta",
    diagram: "painel" as const,
    pilar: false,
  },
  {
    kicker: "Peticionamento",
    title: "Peticionamento com o timbrado do escritório",
    p1: "Modelos de peça já saem formatados com o timbrado, os dados do processo e da parte preenchidos automaticamente — o texto jurídico continua sendo escrito pelo advogado.",
    p2: "O histórico de peças de cada processo fica junto com ele, pesquisável, sem depender de pasta de rede.",
    figure: "Editor de petição com timbrado do escritório, campos de processo/parte preenchidos, botão “Baixar .docx”",
    diagram: "peticionamento" as const,
    pilar: false,
  },
  {
    kicker: "Financeiro",
    title: "Financeiro que fecha",
    p1: "DRE, livro caixa e conciliação bancária num só módulo — honorários contratuais, de êxito e de sucumbência entram separados, com baixa parcial de verdade.",
    p2: "Contas a pagar e a receber conversam com a agenda: vencimento vira lembrete, não vira surpresa no fim do mês.",
    figure: "DRE por categoria, gráfico de fluxo de caixa, tabela de Contas a Receber com status Pendente/Parcial/Pago",
    diagram: "financeiro" as const,
    pilar: false,
  },
  {
    kicker: "Sigilo",
    title: "Sigilo auditável",
    p1: "Documento e telefone de cliente aparecem mascarados por padrão; revelar exige motivo registrado, com validade de 15 minutos — e fica na trilha de auditoria do escritório.",
    p2: "Suporte técnico só entra na conta de um escritório com sessão de tempo limitado e visível para o administrador — nunca em silêncio.",
    figure: "Campo de CPF mascarado com botão “Revelar” e caixa de motivo, trilha de auditoria listando revelações",
    diagram: "sigilo" as const,
    pilar: true,
  },
];

// Diagrama de marca por feature (réguas + bordô), substituindo a legenda "Captura de tela — …"
// até haver fotografia real do produto (P0-2). Um `<g>` fixo por chave de FEATURES.diagram —
// não um ícone genérico repetido, cada um lê como a própria tela que descreve.
// Rodada de reforma visual (retomada da proposta "pulso" descartada durante o grilling do
// portal, ver .impeccable/plano-site-publico/andamento-site-publico.md): diagramas ganharam
// densidade de verdade (preenchimento, selos, texto simulado) em vez de contorno fino vazio —
// feedback direto do dono do projeto ao validar o protótipo ("muito geométrico... precisam ser
// preenchidas"). Cores continuam 100% token (fill-marca-tx/fill-aviso/etc.), nenhum hex cravado.
function FeatureDiagram({ kind }: { kind: (typeof FEATURES)[number]["diagram"] }) {
  switch (kind) {
    case "publicacoes":
      return (
        <>
          {[
            { y: 4, fillCls: "fill-marca-tx", bgCls: "fill-marca-bg", strokeCls: "stroke-marca-tx", w: 34 },
            { y: 26, fillCls: "fill-aviso", bgCls: "fill-aviso-bg", strokeCls: "stroke-aviso", w: 40 },
            { y: 48, fillCls: "fill-fonte-pje", bgCls: "fill-sf-apoio", strokeCls: "stroke-fonte-pje", w: 38 },
          ].map((r) => (
            <g key={r.y}>
              <rect x="2" y={r.y} width="96" height="18" className={`${r.bgCls} ${r.strokeCls}`} strokeWidth="1.5" />
              <rect x="2" y={r.y} width="3" height="18" className={r.fillCls} />
              <circle cx="10" cy={r.y + 5} r="1.8" className={r.fillCls} />
              <rect x="14" y={r.y + 3.5} width={r.w} height="3" className="fill-tx" />
              <rect x="14" y={r.y + 9} width="46" height="2" className="fill-tx-3" />
              <rect x="76" y={r.y + 4.5} width="18" height="7" className={r.fillCls} />
            </g>
          ))}
        </>
      );
    case "painel":
      return (
        <>
          {[
            { x: 2, n: "4", label: "ATRASADOS", fillCls: "fill-urgente", bgCls: "fill-urgente-bg", strokeCls: "stroke-urgente" },
            { x: 35, n: "9", label: "HOJE", fillCls: "fill-aviso", bgCls: "fill-aviso-bg", strokeCls: "stroke-aviso" },
            { x: 68, n: "21", label: "SEMANA", fillCls: "fill-tx-2", bgCls: "fill-sf-apoio", strokeCls: "stroke-tx-2" },
          ].map((c) => (
            <g key={c.x}>
              <rect x={c.x} y="4" width="30" height="30" className={`${c.bgCls} ${c.strokeCls}`} strokeWidth="1.5" />
              <text x={c.x + 5} y="18" fontFamily="sans-serif" fontWeight="700" fontSize="11" className={c.fillCls}>{c.n}</text>
              <rect x={c.x + 5} y="24" width="20" height="2" className={c.fillCls} fillOpacity="0.6" />
              <text x={c.x + 5} y="10" fontFamily="sans-serif" fontSize="3.6" letterSpacing="0.2" className="fill-tx-3">{c.label}</text>
            </g>
          ))}
          <rect x="2" y="38" width="96" height="28" className="fill-sf stroke-regua-forte" strokeWidth="1.5" />
          {[16, 30, 44, 58, 72, 86].map((x) => (
            <line key={x} x1={x} y1="38" x2={x} y2="66" className="stroke-regua" strokeWidth="1" />
          ))}
          <rect x="18" y="48" width="10" height="6" className="fill-marca-tx" fillOpacity="0.7" />
          <rect x="46" y="54" width="10" height="6" className="fill-aviso" fillOpacity="0.55" />
          <rect x="74" y="44" width="10" height="6" className="fill-concluido" fillOpacity="0.55" />
        </>
      );
    case "peticionamento":
      return (
        <>
          <rect x="18" y="2" width="64" height="66" className="fill-sf stroke-regua-forte" strokeWidth="1.5" />
          <rect x="24" y="7" width="10" height="10" className="fill-marca-tx" />
          <rect x="37" y="9" width="30" height="2.4" className="fill-tx" />
          <rect x="37" y="14" width="20" height="2" className="fill-tx-3" />
          <line x1="24" y1="23" x2="76" y2="23" className="stroke-regua" strokeWidth="1" />
          <rect x="24" y="28" width="52" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="34" width="52" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="40" width="34" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="46" width="40" height="2.2" className="fill-regua" />
          <rect x="24" y="51" width="52" height="2.2" className="fill-regua" />
          <rect x="24" y="56" width="26" height="2.2" className="fill-regua" />
          <rect x="52" y="60" width="24" height="6" className="fill-marca-tx" />
          <text x="55" y="64.3" fontFamily="sans-serif" fontSize="4" className="fill-acao-tx">.docx</text>
        </>
      );
    case "financeiro":
      return (
        <>
          <defs>
            <linearGradient id="feature-financeiro-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--concluido)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--concluido)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="4" y1="10" x2="4" y2="42" className="stroke-regua" strokeWidth="1" />
          <line x1="4" y1="42" x2="96" y2="42" className="stroke-regua" strokeWidth="1" />
          <polygon points="4,50 20,42 36,46 52,30 68,34 84,18 96,22 96,42 4,42" fill="url(#feature-financeiro-fill)" />
          <polyline points="4,50 20,42 36,46 52,30 68,34 84,18 96,22" className="stroke-concluido" strokeWidth="2" fill="none" />
          <circle cx="96" cy="22" r="2.2" className="fill-concluido" />
          {[
            { y: 50, fillCls: "fill-concluido", bgCls: "fill-concluido-bg", w: 40 },
            { y: 60, fillCls: "fill-aviso", bgCls: "fill-aviso-bg", w: 34 },
          ].map((r) => (
            <g key={r.y}>
              <rect x="4" y={r.y} width="92" height="7" className="fill-sf-apoio stroke-regua" strokeWidth="0.7" />
              <circle cx="8" cy={r.y + 3.5} r="1.6" className={r.fillCls} />
              <rect x="12" y={r.y + 2.3} width={r.w} height="2.2" className="fill-tx" />
              <rect x="80" y={r.y + 2} width="12" height="3" className={r.bgCls} />
            </g>
          ))}
        </>
      );
    case "sigilo":
      return (
        <>
          <rect x="4" y="4" width="92" height="20" className="fill-sf stroke-regua-forte" strokeWidth="1.5" />
          <rect x="10" y="9" width="6" height="6" className="fill-none stroke-tx-2" strokeWidth="1.2" />
          <text x="20" y="17" fontFamily="monospace" fontSize="8" className="fill-tx-2">•••.•••.•••-••</text>
          <rect x="70" y="8" width="20" height="10" className="fill-marca-tx" />
          <text x="73" y="15" fontFamily="sans-serif" fontSize="5.5" className="fill-acao-tx">Revelar</text>
          <text x="4" y="32" fontFamily="sans-serif" fontSize="4.2" letterSpacing="0.4" className="fill-tx-3">TRILHA DE AUDITORIA</text>
          {[
            { y: 40, fillCls: "fill-concluido", w: 48 },
            { y: 48, fillCls: "fill-aviso", w: 40 },
            { y: 56, fillCls: "fill-tx-2", w: 52 },
          ].map((r) => (
            <g key={r.y}>
              <circle cx="6" cy={r.y} r="1.3" className={r.fillCls} />
              <rect x="10" y={r.y - 1.2} width={r.w} height="2.2" className="fill-tx" />
              <rect x="78" y={r.y - 1.2} width="14" height="2.2" className="fill-regua-forte" />
            </g>
          ))}
        </>
      );
  }
}

const navLink = "inline-block py-2 text-sm font-semibold text-tx hover:underline underline-offset-4";
const btnPrimary = "inline-flex items-center justify-start h-10 px-5 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm rounded-[2px]";
const btnSecondary = "inline-flex items-center justify-start h-10 px-5 border-2 border-regua-forte text-tx font-extrabold text-sm hover:bg-acao-bg rounded-[2px]";
const footerLink = "inline-block py-2 text-tx-2 hover:text-tx hover:underline underline-offset-2";

export default async function HomePage() {
  // Usuário com sessão válida nunca vê a homepage de marketing — vai direto pro Painel (ou pro
  // escolhedor /painel×/painel-mestre, se tiver acesso de plataforma — ver lib/actions/auth.ts).
  const user = await getCurrentUser();
  if (user) {
    const hasPlatformAccess = user.isPlatformOwner || Boolean(await getPlatformMember());
    redirect(hasPlatformAccess ? "/escolher" : "/painel");
  }

  const { plansRaw, modulePrices } = await getHomepagePricingData();
  const plans = plansRaw.filter((p) => !p.isCustom);
  const sobMedida = plansRaw.find((p) => p.isCustom);

  return (
    <div className="bg-sf-fundo text-tx">
      {/* 1. Barra */}
      <header className="sticky top-0 z-30 bg-sf border-b-2 border-regua-forte">
        <div className="max-w-[1120px] mx-auto px-6 h-[76px] flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold text-lg tracking-[.16em] shrink-0">
            <LumenMark size={26} /> LÚMEN
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a className={navLink} href="#recursos">Produto</a>
            <a className={navLink} href="#preco">Preço</a>
            <Link className={navLink} href="/blog">Blog</Link>
          </nav>
          {/* "Entrar" fica FORA do <nav> escondido em telas estreitas de propósito — o app
              mobile (PWA) só enxerga esta homepage depois de um logout, e nela era o único
              jeito de alcançar /login. Com "Entrar" preso em "hidden md:flex", a barra em
              largura de celular mostrava só "Começar" (→/cadastro): quem saía do sistema e
              tentava entrar de novo caía sempre no cadastro, sem forma visível de logar sem
              rolar até o rodapé. */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link className={navLink} href="/login">Entrar</Link>
            <Link href="/cadastro" className={btnPrimary}>Começar</Link>
            <MobileNav />
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero assimétrico — retomado da proposta "pulso" (.impeccable/plano-site-publico/
            andamento-site-publico.md), descartada por timing durante o grilling do portal, não
            por direção errada. Halo bordô + grão (GrainOverlay, mesma peça já usada no Painel do
            produto) preenchem o campo vazio à esquerda — feedback direto do dono do projeto no
            protótipo ("muito geométrico... precisam ser preenchidas"), sem depender de
            fotografia real (ainda não disponível, PRODUCT.md). */}
        <section className="relative overflow-hidden">
          <div
            className="absolute -top-16 -left-24 h-[360px] w-[520px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at top left, var(--halo-marca), transparent 70%)" }}
          />
          <GrainOverlay />
          <div className="relative max-w-[1120px] mx-auto px-6 pt-24 pb-20 grid md:grid-cols-[1fr_0.86fr] gap-12 items-center">
            <div>
              <p className="text-etiqueta font-extrabold uppercase tracking-[.14em] text-marca-tx mb-4">
                Software de gestão para escritórios de advocacia
              </p>
              <h1 className="font-extrabold text-[clamp(36px,5.5vw,60px)] leading-[1.05] tracking-[-.02em] max-w-[15ch]">
                O escritório inteiro, num só lugar — sem perder um prazo.
              </h1>
              <p className="mt-5 text-lg text-tx-2 max-w-[40ch]">
                Publicações triadas, agenda com prazo fatal e financeiro que fecha sozinho.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/cadastro" className={btnPrimary}>Começar agora</Link>
                <a href="#recursos" className={btnSecondary}>Ver como funciona</a>
              </div>
            </div>

            {/* "Ledger vivo" — demonstração do próprio mecanismo citado em PRODUCT.md →
                Positioning (captura por fonte oficial), não uma imagem estática de tela. Rótulos
                e ações idênticos aos reais (PublicationsTriage.tsx: "Gerar Prazo"/"Delegar"). */}
            <div className="border-2 border-regua-forte bg-sf rounded-[2px]">
              <div className="px-4 py-3 border-b border-regua flex items-center justify-between">
                <span className="text-etiqueta font-extrabold uppercase tracking-[.08em] text-tx-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-concluido mr-1.5 animate-pulse motion-reduce:animate-none" />
                  Fila de publicações — ao vivo
                </span>
              </div>
              {[
                { src: "DJEN", accent: "marca-tx", tt: "Intimação — 0012340-55.2025.8.09.0051", ss: "Contestação, prazo de 15 dias", action: "Gerar Prazo" },
                { src: "DATAJUD", accent: "aviso", tt: "Andamento — 0089213-11.2024.8.09.0006", ss: "Audiência de instrução designada", action: "Marcar Audiência" },
                { src: "DJEN", accent: "marca-tx", tt: "Publicação — 0045678-22.2025.8.09.0132", ss: "Sentença de parcial procedência", action: "Delegar" },
              ].map((row, i) => (
                <div key={i} className={`flex gap-3 px-4 py-3 border-l-[3px] ${row.accent === "aviso" ? "border-aviso" : "border-marca-tx"} ${i > 0 ? "border-t border-regua" : ""}`}>
                  <span className={`text-etiqueta font-extrabold tracking-[.04em] w-14 shrink-0 ${row.accent === "aviso" ? "text-aviso" : "text-marca-tx"}`}>{row.src}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-corpo font-semibold text-tx">{row.tt}</p>
                    <p className="text-etiqueta text-tx-3 mt-0.5">{row.ss}</p>
                  </div>
                  <span className="text-etiqueta font-bold text-marca-tx shrink-0 self-center whitespace-nowrap">{row.action} →</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Painel de número — consolida o antigo grid de 4 estatísticas (3 em branco, sem
            número que o escritório não possa comprovar) e a faixa separada abaixo num único
            painel, mesma correção proposta em "pulso": duas seções fracas virando uma de verdade.
            "93" é o único dado real hoje (contagem de lib/tribunaisCatalog.ts). */}
        <section className="relative border-t-2 border-regua-forte bg-grafite-800 overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none opacity-50"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.4px)",
              backgroundSize: "18px 18px",
              maskImage: "linear-gradient(to right, transparent, black 35%, black 70%, transparent)",
            }}
          />
          <GrainOverlay />
          <div className="relative max-w-[1120px] mx-auto px-6 py-16 flex flex-col md:flex-row items-baseline gap-4 md:gap-10">
            <div className="text-[clamp(56px,9vw,108px)] font-extrabold leading-none tracking-[-.02em] text-white tabular-nums">
              93
            </div>
            <p className="text-lg text-neutro-300 max-w-[36ch]">
              tribunais integrados — publicações de todo o país entrando direto na fila do escritório, sem abrir site um por um.
            </p>
          </div>
        </section>

        {/* 4. Linhas de recurso */}
        <section id="recursos" className="border-t-2 border-regua-forte">
          <div className="max-w-[1120px] mx-auto px-6">
            <h2 className="sr-only">Recursos</h2>
            {/* Peso desigual (retomado de "pulso"): Publicações e Sigilo — os 2 mecanismos que
                PRODUCT.md → Positioning cita como diferencial real — ganham tratamento "pilar"
                (padding maior, título maior, fundo com filete bordô); os outros 3 ficam no
                padrão. Não é decoração: é hierarquia real refletindo o que já é dito no produto. */}
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`grid md:grid-cols-2 gap-10 items-center ${f.pilar ? "py-20 -mx-6 px-6 bg-acao-bg" : "py-16"} ${i > 0 ? "border-t border-regua" : ""}`}
              >
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <p className="text-etiqueta font-extrabold uppercase tracking-[.12em] text-marca-tx mb-3">{f.kicker}</p>
                  <h3 className={`font-extrabold tracking-[-.01em] mb-4 ${f.pilar ? "text-autuacao" : "text-autuacao"}`}>{f.title}</h3>
                  <p className="text-corpo text-tx-2 max-w-[46ch]">{f.p1}</p>
                  <p className="text-corpo text-tx-2 max-w-[46ch] mt-3">{f.p2}</p>
                </div>
                <div className={`aspect-[4/3] border-2 border-regua-forte bg-sf rounded-[2px] flex items-center p-10 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                  <svg viewBox="0 0 100 70" role="img" aria-label={f.figure} className="w-full h-full">
                    <FeatureDiagram kind={f.diagram} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Preço — lido ao vivo do catálogo (Plan/ModulePrice, Painel Mestre → Preços), sem
            array hardcoded. Plano com módulo incluso ainda sem preço configurado mostra "Sob
            consulta" (mesma copy do plano sob medida abaixo) em vez de expor a etiqueta interna
            "Substituir"; vira preço real sozinho assim que o operador preencher o preço do
            módulo. */}
        <section id="preco" className="border-t-2 border-regua-forte py-20">
          <div className="max-w-[1120px] mx-auto px-6">
            <h2 className="text-autuacao font-extrabold tracking-[-.015em] mb-11">Um plano para cada tamanho de escritório</h2>
            <div className="grid md:grid-cols-3 lg:grid-cols-5">
              {plans.map((plan) => {
                const calc = calcularPrecoDoPlano(plan, modulePrices);
                const semPreco = calc.modulosSemPreco.length > 0;
                const modulosInclusos = MODULOS.filter((m) => {
                  if (m.key === "FINANCEIRO") return plan.moduloFinanceiro;
                  if (m.key === "ASSESSORIA") return plan.moduloAssessoria;
                  if (m.key === "WHATSAPP") return plan.moduloWhatsapp;
                  return plan.moduloAtendimento;
                });
                return (
                  <div key={plan.id} className={`p-6 border-2 bg-sf rounded-[2px] ${plan.recommended ? "border-acao-light" : "border-regua-forte"}`}>
                    {plan.recommended && (
                      <span className="inline-block text-etiqueta font-extrabold uppercase tracking-[.08em] text-acao-tx bg-acao-light px-2 py-0.5">
                        Recomendado
                      </span>
                    )}
                    <div className="text-corpo font-extrabold uppercase tracking-[.08em] text-tx-2 mt-3">{plan.name}</div>
                    <div className="text-corpo text-tx-3 mt-1">
                      {plan.maxOabs != null && `Até ${plan.maxOabs} OAB${plan.maxOabs > 1 ? "s" : ""}`}
                      {plan.maxOabs != null && plan.maxProcessos != null && " · "}
                      {plan.maxProcessos != null && `até ${plan.maxProcessos} processos`}
                    </div>
                    <div className="text-4xl font-extrabold mt-3">
                      {semPreco ? (
                        "Sob consulta"
                      ) : (
                        <>
                          {formatCurrency(calc.total)}
                          <span className="text-sm font-semibold text-tx-2">/mês</span>
                        </>
                      )}
                    </div>
                    <ul className="mt-5 space-y-2.5">
                      {modulosInclusos.map((m) => (
                        <li key={m.key} className="flex items-start gap-2.5 text-sm text-tx-2">
                          <span className="w-2 h-2 bg-marca mt-1.5 shrink-0" />
                          {m.label}
                        </li>
                      ))}
                    </ul>
                    <Link href="/cadastro" className={`${btnSecondary} w-full justify-center mt-6 mb-1`}>
                      {semPreco ? "Falar com a gente" : "Começar"}
                    </Link>
                  </div>
                );
              })}
              {sobMedida && (
                <div className="p-6 border-2 border-regua-forte bg-sf rounded-[2px]">
                  <div className="text-corpo font-extrabold uppercase tracking-[.08em] text-tx-2 mt-3">{sobMedida.name}</div>
                  <div className="text-corpo text-tx-3 mt-1">Módulos, processos e OABs sob medida</div>
                  <div className="text-2xl font-extrabold mt-3">Sob consulta</div>
                  <p className="text-sm text-tx-2 mt-5">Escolha os módulos e o volume certo para o seu escritório — a gente monta o plano com você.</p>
                  <Link href="/cadastro" className={`${btnSecondary} w-full justify-center mt-6 mb-1`}>Falar com a gente</Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 6. Fecho em pôster */}
        <section className="relative bg-marca text-acao-tx py-24 overflow-hidden">
          <div
            className="absolute -bottom-16 -right-24 h-[300px] w-[420px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.12), transparent 70%)" }}
          />
          <GrainOverlay />
          <div className="relative max-w-[1120px] mx-auto px-6">
            <h2 className="font-extrabold text-[clamp(32px,5vw,52px)] tracking-[-.02em] max-w-[18ch]">
              Leve a triagem, a agenda e o financeiro do escritório para um só lugar.
            </h2>
            {/* P0-5 do roteiro de adequação: text-marca (vermelho) sobre bg-grafite-800 media
                2,15:1 ao vivo, reprova WCAG AA (1.4.3, precisa 4,5:1). text-acao-tx (creme,
                --acao-tx nos globals.css) é o mesmo tom do botão primário do hero (btnPrimary)
                e — igual a --marca/--acao — não retematiza entre Manhã e Noite. */}
            <Link href="/cadastro" className="inline-flex items-center justify-start h-11 px-6 bg-grafite-800 hover:bg-grafite-900 text-acao-tx font-extrabold text-sm rounded-[2px] mt-8">
              Começar agora
            </Link>
          </div>
        </section>
      </main>

      {/* 7. Rodapé */}
      <footer className="border-t-2 border-regua-forte py-14">
        <div className="max-w-[1120px] mx-auto px-6">
          <div className="grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8">
            <div>
              <div className="flex items-center gap-2 font-extrabold text-base tracking-[.16em] mb-3">
                <LumenMark size={24} /> LÚMEN
              </div>
              <p className="text-corpo text-tx-2 max-w-[32ch]">Software de gestão jurídica para escritórios de advocacia.</p>
            </div>
            <div>
              <h3 className="text-etiqueta font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Produto</h3>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#recursos" className={footerLink}>Recursos</a></li>
                <li><a href="#preco" className={footerLink}>Preço</a></li>
                <li><Link href="/blog" className={footerLink}>Blog</Link></li>
                <li><Link href="/login" className={footerLink}>Entrar</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-etiqueta font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Contato</h3>
              <ul className="space-y-2.5 text-sm">
                <li className="text-tx-2">Goiânia — GO</li>
                <li><a href="https://wa.me/5562981283481" target="_blank" rel="noopener noreferrer" className={footerLink}>(62) 98128-3481</a></li>
                <li><a href="mailto:contato@rodarteprado.com.br" className={footerLink}>contato@rodarteprado.com.br</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-etiqueta font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Legal</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="/privacidade" className={footerLink}>Política de privacidade</Link></li>
                {/* DPO reaproveita o contato real já existente no rodapé em vez de um dado fictício —
                    sem CNPJ aqui pela mesma razão: melhor omitir do que publicar um valor inventado. */}
                <li><a href="mailto:contato@rodarteprado.com.br" className={footerLink}>Encarregado de dados (DPO)</a></li>
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-end mt-11 pt-5 border-t border-regua text-xs text-tx-3">
            <span>© 2026 Lúmen. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>

      <CookieConsent />
    </div>
  );
}
