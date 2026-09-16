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
import SiteHeader from "@/components/site/SiteHeader";
import FeatureFigure from "@/components/site/FeatureFigure";
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
    // Deixou de ser pilar em 2026-09-16: captura de publicação é commodity no mercado
    // brasileiro, e o peso editorial passou para o diferencial de verdade (Assessoria, abaixo).
    // A copy continua intacta — ela é o ativo mais valioso da página.
    pilar: false,
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
    // A frase aqui era "...sem depender de pasta de rede", que sugeria o OPOSTO do
    // posicionamento: dava a entender que o Lúmen guarda os autos, quando o argumento do produto
    // é que o ESCRITÓRIO guarda. Achado P2 do `audit` de 2026-09-16.
    p2: "O histórico de peças de cada processo fica junto com ele, pesquisável — e o arquivo em si fica no Drive do escritório, na pasta daquele processo.",
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
    kicker: "Assessoria",
    title: "Assessoria empresarial não é processo disfarçado",
    p1: "Contrato, licitação, parecer e demanda recorrente têm modelo, pasta e ciclo próprios — não são um processo adaptado com gambiarra. Honorário mensal, documentos da empresa e histórico de demandas ficam no mesmo lugar.",
    p2: "A pasta da empresa no Drive segue a mesma regra dos processos: Contratos, Pareceres, Licitações e Regimentos Internos, cada um no seu lugar, com o nome já padronizado.",
    figure: "Assessoria: abas Documentos, Licitações, Demandas e Honorários; pasta da empresa com as quatro subpastas",
    diagram: "peticionamento" as const,
    // ÚNICO pilar da lista. O diagnóstico mediu que o peso "pilar" estava em Publicações
    // (commodity no mercado brasileiro) e Sigilo, e que NENHUMA das cinco linhas era sobre
    // contrato, licitação ou parecer — de modo que um sócio de escritório empresarial concluía,
    // corretamente, que o Lúmen era software de contencioso. O outro diferencial do PRODUCT.md,
    // a custódia no Drive do cliente, ocupa o primeiro viewport; este ocupa o pilar aqui.
    // Um só, de propósito: se tudo é pilar, nada é.
    pilar: true,
  },
  {
    kicker: "Sigilo",
    title: "Sigilo auditável",
    p1: "Documento e telefone de cliente aparecem mascarados por padrão; revelar exige motivo registrado, com validade de 15 minutos — e fica na trilha de auditoria do escritório.",
    p2: "Suporte técnico só entra na conta de um escritório com sessão de tempo limitado e visível para o administrador — nunca em silêncio.",
    figure: "Campo de CPF mascarado com botão “Revelar” e caixa de motivo, trilha de auditoria listando revelações",
    diagram: "sigilo" as const,
    // Idem: continua sendo um mecanismo forte, mas não é o que diferencia o produto de um
    // concorrente. Um pilar só na lista, ou nenhum é pilar.
    pilar: false,
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
          ].map((r, i) => (
            // Movimento 10 · a publicação CAI na fila, sozinha, uma após a outra — que é
            // literalmente o que esta linha de recurso afirma que acontece.
            <g key={r.y} className="chega" style={{ animationDelay: `${i * 200}ms` }}>
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
          {/* Movimento 10 · cada compromisso POUSA na coluna do seu dia. As colunas e a moldura
              da semana já estão lá: a grade existe primeiro, os compromissos caem nela. */}
          <rect x="18" y="48" width="10" height="6" className="fill-marca-tx pousa" fillOpacity="0.7" style={{ animationDelay: "120ms" }} />
          <rect x="46" y="54" width="10" height="6" className="fill-aviso pousa" fillOpacity="0.55" style={{ animationDelay: "260ms" }} />
          <rect x="74" y="44" width="10" height="6" className="fill-concluido pousa" fillOpacity="0.55" style={{ animationDelay: "400ms" }} />
        </>
      );
    case "peticionamento":
      return (
        <>
          <rect x="18" y="2" width="64" height="66" className="fill-sf stroke-regua-forte" strokeWidth="1.5" />
          {/* Movimento 10 · anima SÓ o que o produto preenche sozinho: o timbrado do escritório e
              os campos do processo e da parte. As linhas do corpo, logo abaixo, ficam paradas de
              propósito — a copy desta linha diz que "o texto jurídico continua sendo escrito pelo
              advogado", e um corpo se escrevendo sozinho ilustraria o contrário do que a página
              afirma. */}
          <rect x="24" y="7" width="10" height="10" className="fill-marca-tx preenche" />
          <rect x="37" y="9" width="30" height="2.4" className="fill-tx preenche" style={{ animationDelay: "140ms" }} />
          <rect x="37" y="14" width="20" height="2" className="fill-tx-3 preenche" style={{ animationDelay: "240ms" }} />
          <line x1="24" y1="23" x2="76" y2="23" className="stroke-regua" strokeWidth="1" />
          <rect x="24" y="28" width="52" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="34" width="52" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="40" width="34" height="2.2" className="fill-regua-forte" />
          <rect x="24" y="46" width="40" height="2.2" className="fill-regua" />
          <rect x="24" y="51" width="52" height="2.2" className="fill-regua" />
          <rect x="24" y="56" width="26" height="2.2" className="fill-regua" />
          <g className="preenche" style={{ animationDelay: "420ms" }}>
            <rect x="52" y="60" width="24" height="6" className="fill-marca-tx" />
            <text x="55" y="64.3" fontFamily="sans-serif" fontSize="4" className="fill-acao-tx">.docx</text>
          </g>
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
          {/* Movimento 10 · a curva do caixa se TRAÇA da esquerda para a direita (o tempo passando,
              que é o que um fluxo de caixa é), a área sobe atrás dela e o ponto final pousa no fim.
              Os eixos não animam: a régua existe antes do número. */}
          <polygon className="area" points="4,50 20,42 36,46 52,30 68,34 84,18 96,22 96,42 4,42" fill="url(#feature-financeiro-fill)" />
          <polyline className="traca stroke-concluido" points="4,50 20,42 36,46 52,30 68,34 84,18 96,22" strokeWidth="2" fill="none" />
          <circle cx="96" cy="22" r="2.2" className="fill-concluido pousa" style={{ animationDelay: "820ms" }} />
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
          {/* Movimento 10 · o campo continua mascarado (é o estado padrão do produto, e mexer nisso
              seria contar outra história). O que se move é a consequência: o botão "Revelar" acende
              uma vez, e a trilha de auditoria se ESCREVE da esquerda para a direita — que é o que a
              copy promete, revelar exige motivo e fica registrado. */}
          <g className="acende">
            <rect x="70" y="8" width="20" height="10" className="fill-marca-tx" />
            <text x="73" y="15" fontFamily="sans-serif" fontSize="5.5" className="fill-acao-tx">Revelar</text>
          </g>
          <text x="4" y="32" fontFamily="sans-serif" fontSize="4.2" letterSpacing="0.4" className="fill-tx-3">TRILHA DE AUDITORIA</text>
          {[
            { y: 40, fillCls: "fill-concluido", w: 48 },
            { y: 48, fillCls: "fill-aviso", w: 40 },
            { y: 56, fillCls: "fill-tx-2", w: 52 },
          ].map((r, i) => (
            <g key={r.y} className="preenche" style={{ animationDelay: `${260 + i * 180}ms` }}>
              <circle cx="6" cy={r.y} r="1.3" className={r.fillCls} />
              <rect x="10" y={r.y - 1.2} width={r.w} height="2.2" className="fill-tx" />
              <rect x="78" y={r.y - 1.2} width="14" height="2.2" className="fill-regua-forte" />
            </g>
          ))}
        </>
      );
  }
}

// Os quatro estilos de interação do site. Antes do `animate` de 2026-09-16 nenhum deles tinha
// uma única transição: o hover trocava de cor num salto e o clique não deixava recibo.
// `navLink` não muda de cor no hover — muda de sublinhado; então o que transiciona aqui é a
// COR DO SUBLINHADO (transparente → atual), que faz o traço crescer em vez de piscar, sem
// mexer no layout (o `underline` já está sempre ligado). Os dois botões ganham, além da cor,
// o recibo do toque: 1px para baixo enquanto o dedo está em cima — o mesmo eixo vertical da
// guia do produto, que é a assinatura de movimento da casa.
const navLink = "inline-block py-2 text-sm font-semibold text-tx underline decoration-transparent hover:decoration-current focus-visible:decoration-current underline-offset-4 transition-[text-decoration-color] duration-100 ease-out";
const btnPrimary = "inline-flex items-center justify-start h-10 px-5 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm rounded-[2px] transition-[background-color,transform] duration-100 ease-out active:translate-y-px";
const btnSecondary = "inline-flex items-center justify-start h-10 px-5 border-2 border-regua-forte text-tx font-extrabold text-sm hover:bg-acao-bg rounded-[2px] transition-[background-color,transform] duration-100 ease-out active:translate-y-px";
const footerLink = "inline-block py-2 text-tx-2 hover:text-tx hover:underline underline-offset-2 transition-colors duration-100 ease-out";

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
    <div className="site-publico bg-sf-fundo text-tx">
      {/* 1. Barra — componente cliente desde 2026-09-16 (itens D2 e D8 do roteiro de dinamismo,
          aprovados pelo dono): o item de seção acende quando a seção está na tela, e a régua de
          baixo troca de cinza para bordô depois dos primeiros 40px de rolagem. Os dois usam o
          mesmo ouvinte, por isso são um componente só. Ver components/site/SiteHeader.tsx. */}
      <SiteHeader navLink={navLink} btnPrimary={btnPrimary} />

      <main>
        {/* 2. Hero assimétrico — retomado da proposta "pulso" (.impeccable/plano-site-publico/
            andamento-site-publico.md), descartada por timing durante o grilling do portal, não
            por direção errada. Halo bordô + grão (GrainOverlay, mesma peça já usada no Painel do
            produto) preenchem o campo vazio à esquerda — feedback direto do dono do projeto no
            protótipo ("muito geométrico... precisam ser preenchidas"), sem depender de
            fotografia real (ainda não disponível, PRODUCT.md). */}
        <section className="relative overflow-hidden">
          {/* O halo ficou para trás: `--halo-marca` virou transparente em F3 (elevação Ikeda do
              contrato de direção — "se um elemento não carrega dado ou estado, ele não existe"),
              então a div renderizava nada. */}
          <GrainOverlay />
          <div className="relative max-w-[1120px] mx-auto px-6 pt-24 pb-20 grid md:grid-cols-[1fr_0.92fr] gap-12 items-center">
            <div>
              <p className="text-etiqueta font-extrabold uppercase tracking-[.14em] text-marca-tx mb-4">
                Software de gestão para escritórios de advocacia
              </p>
              {/* O diagnóstico de 2026-09-16 mediu o problema desta manchete: ela era a frase de
                  CATEGORIA — "o escritório inteiro, num só lugar, sem perder um prazo" — que AdvBox,
                  Astrea e Projuris também usam. O que diferencia o produto estava no subtítulo, a
                  18px: a hierarquia premiava o genérico com 60px e o específico com 18. Aqui o
                  primeiro diferencial do PRODUCT.md ocupa a manchete, e a frase de categoria vira
                  a linha de apoio, que é o lugar dela. */}
              <h1 className="font-extrabold text-[clamp(36px,5.5vw,60px)] leading-[1.05] tracking-[-.02em] max-w-[16ch]">
                Os documentos do seu escritório ficam no <span className="text-marca-tx">seu</span> Drive.
              </h1>
              <p className="mt-5 text-lg text-tx-2 max-w-[44ch]">
                Cada processo vira uma pasta no Google Drive do próprio escritório, dividida por tipo
                de documento. Se você cancelar amanhã, o acervo continua lá — organizado, nomeado e
                seu.
              </p>
              <p className="mt-3 text-corpo text-tx-2 max-w-[44ch]">
                E o resto do escritório vem junto: publicações triadas, prazo fatal com o calendário
                de feriados do tribunal, e financeiro que fecha.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/cadastro" className={btnPrimary}>Começar agora</Link>
                <a href="#recursos" className={btnSecondary}>Ver como funciona</a>
              </div>
            </div>

            {/* A DEMONSTRAÇÃO do diferencial, não uma descrição dele — e não uma imagem decorativa.
                Antes este painel rotulava "Fila de publicações — ao vivo" com ponto verde pulsante
                sobre três objetos cravados no código, que nunca mudavam: era uma afirmação de
                vivacidade que o componente não cumpria. O diagnóstico registrou isso.

                Esta é a estrutura de pastas que o produto CRIA de fato — pasta por processo, com
                subpasta por tipo de documento (lib/googleDrive.ts, getOrCreateCategoryFolder) — e o
                rótulo diz onde ela está, que é a única coisa que precisa ser dita aqui. */}
            <div className="border-2 border-regua-forte bg-sf rounded-[2px]">
              <div className="px-4 py-3 border-b border-regua flex items-center gap-2 flex-wrap">
                <span className="text-etiqueta font-extrabold uppercase tracking-[.08em] text-tx-2">
                  Google Drive do escritório
                </span>
                <span className="text-etiqueta text-tx-3 ml-auto">conta do cliente, não a nossa</span>
              </div>
              {/* O ÚNICO momento autoral de movimento da página (Movimento 7 · arquivar, em
                  globals.css). Cada linha é revelada da esquerda para a direita a partir da régua
                  vertical de que ela pende, deslizando 6px para dentro — a folha entrando na
                  gaveta. As réguas (`border-l`) NÃO animam de propósito: o trilho já está lá
                  quando a primeira folha chega.
                  Os atrasos são explícitos, não calculados por índice, porque a ordem aqui é a
                  ordem da hierarquia (raiz → processo → suas quatro subpastas → os dois processos
                  seguintes), e não a ordem de um laço. Último atraso: 385ms; sequência inteira em
                  765ms. CSS puro, uma vez por carregamento, acima da dobra: sem observador de
                  rolagem, sem JS, e nada fica escondido se o script falhar. */}
              <div className="px-4 py-4 font-mono text-corpo">
                <p className="arquiva-linha font-semibold text-tx">Lúmen — Processos</p>
                <div className="mt-2 pl-3 border-l border-regua space-y-2">
                  <p className="arquiva-linha font-semibold text-tx" style={{ animationDelay: "55ms" }}>Arantes, Wagner Barros — 0812445-19.2025</p>
                  <div className="pl-3 border-l border-regua space-y-1.5 text-tx-2">
                    <p className="arquiva-linha flex gap-3" style={{ animationDelay: "110ms" }}><span className="flex-1">Petições</span><span className="text-tx-3">4</span></p>
                    <p className="arquiva-linha flex gap-3" style={{ animationDelay: "165ms" }}><span className="flex-1">Contratos</span><span className="text-tx-3">2</span></p>
                    <p className="arquiva-linha flex gap-3" style={{ animationDelay: "220ms" }}><span className="flex-1">Documentos do cliente</span><span className="text-tx-3">7</span></p>
                    <p className="arquiva-linha flex gap-3" style={{ animationDelay: "275ms" }}><span className="flex-1">Procuração</span><span className="text-tx-3">1</span></p>
                  </div>
                  <p className="arquiva-linha font-semibold text-tx pt-1" style={{ animationDelay: "330ms" }}>Meireles &amp; Cia — 0755102-44.2025</p>
                  <p className="arquiva-linha font-semibold text-tx" style={{ animationDelay: "385ms" }}>Alves Transportes — 0660154-06.2026</p>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-regua">
                <p className="text-etiqueta text-tx-2 leading-relaxed">
                  O Lúmen nomeia, move e reconcilia — inclusive quando você troca um arquivo direto no
                  Drive, pelo celular, sem abrir o sistema.
                </p>
              </div>
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
                <FeatureFigure figure={f.figure} ordem={i}>
                  <FeatureDiagram kind={f.diagram} />
                </FeatureFigure>
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
            {/* Auditoria de 2026-09-16: a grade não tinha `gap`, então cartões `border-2` adjacentes
                encostavam e produziam filete duplo de 4px — e o cartão recomendado, de borda em cor
                diferente, colava a dele na do vizinho. Com 5 planos mais "sob medida", o sexto
                órfãva numa segunda linha. `auto-fit` com piso resolve o reflow sozinho, em vez de
                depender de contar planos num breakpoint. */}
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
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
                  <div
                    key={plan.id}
                    // D5 do roteiro de dinamismo, aprovado pelo dono em 2026-09-16 — na forma da
                    // RÉGUA, não na do cartão que levanta com sombra. Duas razões, e nenhuma é de
                    // gosto: o produto inteiro recusou sombra (usa filete de 2px no lugar, e não há
                    // um `box-shadow` sequer nas telas), e "cartão que levanta no hover" é um dos
                    // tiques mais reconhecíveis de interface gerada por máquina. O cartão
                    // recomendado já nasce com a régua em `--acao`, então ele responde pelo fundo.
                    className={`relative p-6 border-2 bg-sf rounded-[2px] transition-[border-color,background-color] duration-100 ease-out ${plan.recommended ? "border-marca-tx hover:bg-acao-bg" : "border-regua-forte hover:border-marca-tx hover:bg-acao-bg"}`}
                  >
                    {/* FORA DO FLUXO. Antes o selo era renderizado dentro dele e empurrava ~24px de
                        conteúdo para baixo, de modo que preço, módulos e botão deixavam de alinhar
                        com os vizinhos justamente no cartão que se quer destacar. */}
                    {plan.recommended && (
                      <span className="absolute -top-3 left-6 inline-block text-etiqueta font-extrabold uppercase tracking-[.08em] text-acao-tx bg-acao px-2 py-0.5 rounded-sm">
                        Recomendado
                      </span>
                    )}
                    <div className="text-corpo font-extrabold uppercase tracking-[.08em] text-tx-2">{plan.name}</div>
                    {/* Os limites definem QUAL plano o visitante compra — tinta secundária. */}
                    <div className="text-corpo text-tx-2 mt-1">
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
                <div className="p-6 border-2 border-regua-forte bg-sf rounded-[2px] transition-[border-color,background-color] duration-100 ease-out hover:border-marca-tx hover:bg-acao-bg">
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
            {/* P0-5 do roteiro de adequação: text-marca-tx (vermelho) sobre bg-grafite-800 media
                2,15:1 ao vivo, reprova WCAG AA (1.4.3, precisa 4,5:1). text-acao-tx (creme,
                --acao-tx nos globals.css) é o mesmo tom do botão primário do hero (btnPrimary)
                e — igual a --marca/--acao — não retematiza entre Manhã e Noite. */}
            {/* D6, aprovado pelo dono em 2026-09-16: a seta anda 5px quando o ponteiro chega. A
                seta é `aria-hidden` — ela repete em desenho o que o texto do botão já diz, e
                anunciá-la de novo para leitor de tela seria ruído. */}
            <Link
              href="/cadastro"
              className="group inline-flex items-center justify-start gap-2.5 h-11 px-6 bg-grafite-800 hover:bg-grafite-900 text-acao-tx font-extrabold text-sm rounded-[2px] mt-8 transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
            >
              Começar agora
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-hover:translate-x-[5px]"
              >
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
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
