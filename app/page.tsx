import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { calcularPrecoDoPlano, MODULOS } from "@/lib/officePricing";
import { formatCurrency } from "@/components/ui";
import LumenMark from "@/components/LumenMark";
import CookieConsent from "@/components/site/CookieConsent";

// Homepage PÚBLICA do produto de software "Lúmen" (documento 09 do redesenho: "o site passa a
// vender o Lúmen como SaaS de gestão jurídica para outros escritórios, não é mais a homepage do
// escritório Rodarte Prado"). Estrutura de 8 seções do documento, nesta ordem: barra, hero
// regrado, linha de números, 5 linhas de recurso, fotografia, preço, fecho em pôster, rodapé —
// sem carrossel (HomepageHeroCarousel saiu), sem card de login embutido (login virou uma
// página de verdade, ver app/login/page.tsx), sem gradiente/textura/canto arredondado.
//
// Cor: modelo B (Modernist puro, vermelho #ec3013) — o modelo A (ouro) do texto original do
// documento 09 foi superado pela decisão registrada em design_handoff_lumen_redesign/
// 01-tokens-e-tema.md (19/08/2026) e pelos tokens de fato aplicados em app/globals.css e
// tailwind.config.ts. O "fecho em pôster" (única seção onde a cor corre como campo) usa
// --marca/vermelho, exatamente como o próprio documento 09 antecipa ("no Modernist puro esse
// campo seria vermelho"). A marca (LumenMark) mantém sua paleta própria e fixa (ouro+grafite,
// manual da marca v2) — não segue o modelo A/B da UI.
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
export const dynamic = "force-dynamic";

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
  },
  {
    kicker: "Painel",
    title: "O dia na frente",
    p1: "Um painel mostra o que vence hoje, o que já passou do prazo e a agenda da semana — com o calendário de feriados de cada tribunal já embutido no cálculo do prazo fatal.",
    p2: "Cada advogado vê a própria fila; quem administra o escritório vê o todo, sem precisar abrir uma planilha à parte.",
    figure: "Painel: cartões “Hoje”, “Atrasados”, agenda da semana, prazo de segurança marcado em cor distinta",
    diagram: "painel" as const,
  },
  {
    kicker: "Peticionamento",
    title: "Peticionamento com o timbrado do escritório",
    p1: "Modelos de peça já saem formatados com o timbrado, os dados do processo e da parte preenchidos automaticamente — o texto jurídico continua sendo escrito pelo advogado.",
    p2: "O histórico de peças de cada processo fica junto com ele, pesquisável, sem depender de pasta de rede.",
    figure: "Editor de petição com timbrado do escritório, campos de processo/parte preenchidos, botão “Baixar .docx”",
    diagram: "peticionamento" as const,
  },
  {
    kicker: "Financeiro",
    title: "Financeiro que fecha",
    p1: "DRE, livro caixa e conciliação bancária num só módulo — honorários contratuais, de êxito e de sucumbência entram separados, com baixa parcial de verdade.",
    p2: "Contas a pagar e a receber conversam com a agenda: vencimento vira lembrete, não vira surpresa no fim do mês.",
    figure: "DRE por categoria, gráfico de fluxo de caixa, tabela de Contas a Receber com status Pendente/Parcial/Pago",
    diagram: "financeiro" as const,
  },
  {
    kicker: "Sigilo",
    title: "Sigilo auditável",
    p1: "Documento e telefone de cliente aparecem mascarados por padrão; revelar exige motivo registrado, com validade de 15 minutos — e fica na trilha de auditoria do escritório.",
    p2: "Suporte técnico só entra na conta de um escritório com sessão de tempo limitado e visível para o administrador — nunca em silêncio.",
    figure: "Campo de CPF mascarado com botão “Revelar” e caixa de motivo, trilha de auditoria listando revelações",
    diagram: "sigilo" as const,
  },
];

// Diagrama de marca por feature (réguas + bordô), substituindo a legenda "Captura de tela — …"
// até haver fotografia real do produto (P0-2). Um `<g>` fixo por chave de FEATURES.diagram —
// não um ícone genérico repetido, cada um lê como a própria tela que descreve.
function FeatureDiagram({ kind }: { kind: (typeof FEATURES)[number]["diagram"] }) {
  const row = (y: number, accent: string) => (
    <g key={y}>
      <rect x="8" y={y} width="84" height="20" rx="3" className="fill-sf stroke-regua-forte" strokeWidth="2" />
      <rect x="8" y={y} width="4" height="20" className={accent} />
    </g>
  );
  switch (kind) {
    case "publicacoes":
      return (
        <>
          {row(14, "fill-marca-tx")}
          {row(40, "fill-fonte-pje")}
          {row(66, "fill-aviso")}
          <circle cx="86" cy="20" r="3" className="fill-marca-tx" />
        </>
      );
    case "painel":
      return (
        <>
          <rect x="8" y="14" width="38" height="34" rx="3" className="fill-sf stroke-regua-forte" strokeWidth="2" />
          <rect x="8" y="14" width="38" height="8" className="fill-marca-bg" />
          <rect x="54" y="14" width="38" height="34" rx="3" className="fill-sf stroke-urgente" strokeWidth="2" />
          <rect x="54" y="14" width="38" height="8" className="fill-urgente" fillOpacity="0.25" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={8 + i * 12.3} y="60" width="9" height="26" rx="2" className={i === 3 ? "fill-marca-tx" : "fill-regua"} />
          ))}
        </>
      );
    case "peticionamento":
      return (
        <>
          <rect x="20" y="8" width="60" height="78" rx="2" className="fill-sf stroke-regua-forte" strokeWidth="2" />
          <rect x="20" y="8" width="60" height="10" className="fill-marca-tx" fillOpacity="0.35" />
          <rect x="28" y="30" width="44" height="4" className="fill-regua-forte" />
          <rect x="28" y="40" width="44" height="4" className="fill-regua-forte" />
          <rect x="28" y="50" width="30" height="4" className="fill-regua-forte" />
          <rect x="46" y="70" width="26" height="10" rx="2" className="fill-marca-tx" />
        </>
      );
    case "financeiro":
      return (
        <>
          {[20, 36, 52, 68].map((h, i) => (
            <rect key={h} x={8 + i * 22} y={88 - h} width="14" height={h} rx="2" className="fill-marca-tx" fillOpacity={i === 3 ? 1 : 0.4} />
          ))}
          <polyline points="8,68 30,52 52,58 74,20" className="stroke-tx-2" strokeWidth="2" fill="none" />
        </>
      );
    case "sigilo":
      return (
        <>
          <rect x="8" y="14" width="84" height="20" rx="3" className="fill-sf stroke-regua-forte" strokeWidth="2" />
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} cx={20 + i * 8} cy="24" r="2.5" className="fill-tx-3" />
          ))}
          <rect x="72" y="18" width="14" height="12" rx="2" className="fill-marca-tx" />
          <rect x="8" y="46" width="60" height="4" className="fill-regua" />
          <rect x="8" y="56" width="44" height="4" className="fill-regua" />
          <rect x="8" y="66" width="52" height="4" className="fill-regua" />
        </>
      );
  }
}

// "93 tribunais integrados" é dado real (contagem de lib/tribunaisCatalog.ts); os outros 3 ficam
// em branco de propósito — sem número que o escritório não possa comprovar (documento 09) — até
// alguém preencher com o valor certo. Sem moldura de aviso: a fase de mockup acabou, agora é
// conteúdo publicável faltando só o dado, não uma tela de desenvolvimento.
const STATS = [
  { value: null, label: "processos monitorados" },
  { value: "93", label: "tribunais integrados" },
  { value: null, label: "publicações triadas por dia" },
  { value: null, label: "tempo médio de triagem" },
];

const navLink = "text-sm font-semibold text-tx hover:underline underline-offset-4";
const btnPrimary = "inline-flex items-center justify-start h-10 px-5 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm";
const btnSecondary = "inline-flex items-center justify-start h-10 px-5 border-2 border-regua-forte text-tx font-extrabold text-sm hover:bg-acao-bg";

export default async function HomePage() {
  // Usuário com sessão válida nunca vê a homepage de marketing — vai direto pro Painel (ou pro
  // escolhedor /painel×/painel-mestre, se tiver acesso de plataforma — ver lib/actions/auth.ts).
  const user = await getCurrentUser();
  if (user) {
    const hasPlatformAccess = user.isPlatformOwner || Boolean(await getPlatformMember());
    redirect(hasPlatformAccess ? "/escolher" : "/painel");
  }

  const [plansRaw, modulePrices] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.modulePrice.findMany(),
  ]);
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
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero regrado */}
        <section className="max-w-[1120px] mx-auto px-6 pt-24 pb-20">
          <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-marca-tx mb-4">
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
        </section>

        {/* 3. Linha de números */}
        <section className="border-t-2 border-regua-forte">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-6">
              {STATS.map(({ value, label }) => (
                <div key={label} className="py-6 px-5">
                  <div className="text-4xl font-extrabold tabular-nums mt-2">{value ?? "—"}</div>
                  <div className="mt-1.5 text-[13px] font-semibold text-tx-2">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Linhas de recurso */}
        <section id="recursos" className="border-t-2 border-regua-forte">
          <div className="max-w-[1120px] mx-auto px-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`grid md:grid-cols-2 gap-10 items-center py-16 ${i > 0 ? "border-t border-regua" : ""}`}>
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-marca-tx mb-3">{f.kicker}</p>
                  <h3 className="text-[26px] font-extrabold tracking-[-.01em] mb-4">{f.title}</h3>
                  <p className="text-[15px] text-tx-2 max-w-[46ch]">{f.p1}</p>
                  <p className="text-[15px] text-tx-2 max-w-[46ch] mt-3">{f.p2}</p>
                </div>
                <div className={`aspect-[4/3] border-2 border-regua-forte bg-sf flex items-center p-10 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                  <svg viewBox="0 0 100 100" role="img" aria-label={f.figure} className="w-full h-full">
                    <FeatureDiagram kind={f.diagram} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Faixa de alcance — documento 09 previa uma fotografia do escritório aqui; sem uma
            foto real disponível, a faixa usa o único número já publicável (93 tribunais, mesmo
            dado da seção 3) como elemento gráfico em vez de deixar um retângulo vazio. Quando
            houver fotografia, esta seção volta a ser a imagem prevista no documento. */}
        <section className="border-t-2 border-regua-forte bg-grafite-900">
          <div className="max-w-[1120px] mx-auto px-6 py-16 flex flex-col md:flex-row items-baseline gap-4 md:gap-10">
            <div className="text-[clamp(56px,9vw,108px)] font-extrabold leading-none tracking-[-.02em] text-white tabular-nums">
              93
            </div>
            <p className="text-lg text-neutro-300 max-w-[36ch]">
              tribunais integrados — publicações de todo o país entrando direto na fila do escritório, sem abrir site um por um.
            </p>
          </div>
        </section>

        {/* 6. Preço — lido ao vivo do catálogo (Plan/ModulePrice, Painel Mestre → Preços), sem
            array hardcoded. Plano com módulo incluso ainda sem preço configurado mostra "Sob
            consulta" (mesma copy do plano sob medida abaixo) em vez de expor a etiqueta interna
            "Substituir"; vira preço real sozinho assim que o operador preencher o preço do
            módulo. */}
        <section id="preco" className="border-t-2 border-regua-forte py-20">
          <div className="max-w-[1120px] mx-auto px-6">
            <h2 className="text-[30px] font-extrabold tracking-[-.015em] mb-11">Um plano para cada tamanho de escritório</h2>
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
                  <div key={plan.id} className="p-6 border-2 border-regua-forte bg-sf">
                    <div className="text-[13px] font-extrabold uppercase tracking-[.08em] text-tx-2 mt-3">{plan.name}</div>
                    <div className="text-[13px] text-tx-3 mt-1">
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
                <div className="p-6 border-2 border-regua-forte bg-sf">
                  <div className="text-[13px] font-extrabold uppercase tracking-[.08em] text-tx-2 mt-3">{sobMedida.name}</div>
                  <div className="text-[13px] text-tx-3 mt-1">Módulos, processos e OABs sob medida</div>
                  <div className="text-2xl font-extrabold mt-3">Sob consulta</div>
                  <p className="text-sm text-tx-2 mt-5">Escolha os módulos e o volume certo para o seu escritório — a gente monta o plano com você.</p>
                  <Link href="/cadastro" className={`${btnSecondary} w-full justify-center mt-6 mb-1`}>Falar com a gente</Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 7. Fecho em pôster */}
        <section className="bg-marca text-acao-tx py-24">
          <div className="max-w-[1120px] mx-auto px-6">
            <h2 className="font-extrabold text-[clamp(32px,5vw,52px)] tracking-[-.02em] max-w-[18ch]">
              Leve a triagem, a agenda e o financeiro do escritório para um só lugar.
            </h2>
            <Link href="/cadastro" className="inline-flex items-center justify-start h-11 px-6 bg-grafite-800 hover:bg-black text-marca font-extrabold text-sm mt-8">
              Começar agora
            </Link>
          </div>
        </section>
      </main>

      {/* 8. Rodapé */}
      <footer className="border-t-2 border-regua-forte py-14">
        <div className="max-w-[1120px] mx-auto px-6">
          <div className="grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8">
            <div>
              <div className="flex items-center gap-2 font-extrabold text-base tracking-[.16em] mb-3">
                <LumenMark size={24} /> LÚMEN
              </div>
              <p className="text-[13px] text-tx-2 max-w-[32ch]">Software de gestão jurídica para escritórios de advocacia.</p>
            </div>
            <div>
              <h4 className="text-[11px] font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Produto</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#recursos" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">Recursos</a></li>
                <li><a href="#preco" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">Preço</a></li>
                <li><Link href="/login" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">Entrar</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Contato</h4>
              <ul className="space-y-2.5 text-sm">
                <li className="text-tx-2">Goiânia — GO</li>
                <li><a href="https://wa.me/5562981283481" target="_blank" rel="noopener noreferrer" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">(62) 98128-3481</a></li>
                <li><a href="mailto:contato@rodarteprado.com.br" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">contato@rodarteprado.com.br</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] font-extrabold uppercase tracking-[.08em] text-tx-3 mb-3.5">Legal</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="/privacidade" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">Política de privacidade</Link></li>
                {/* DPO reaproveita o contato real já existente no rodapé em vez de um dado fictício —
                    sem CNPJ aqui pela mesma razão: melhor omitir do que publicar um valor inventado. */}
                <li><a href="mailto:contato@rodarteprado.com.br" className="text-tx-2 hover:text-tx hover:underline underline-offset-2">Encarregado de dados (DPO)</a></li>
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
