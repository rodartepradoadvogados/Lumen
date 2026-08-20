import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
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
// de estatísticas (só "93 tribunais integrados" é real hoje, os outros ficam em branco) e os 3
// preços de plano — únicos ainda marcados com moldura tracejada (--vinho/--atencao) e
// "Substituir". Fotografia do escritório, CNPJ e DPO não têm dado real disponível e por isso
// saíram do texto público em vez de aparecer como mockup: seção 5 virou uma faixa gráfica com o
// número real de tribunais, o rodapé usa o e-mail de contato já existente como DPO e não exibe
// CNPJ algum — ajustar quando os dados corretos existirem.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lúmen — Software de gestão para escritórios de advocacia",
  description:
    "Publicações triadas, o dia na frente, peticionamento com o timbrado do escritório e financeiro que fecha — tudo em um só sistema de gestão para escritórios de advocacia.",
};

const FEATURES = [
  {
    kicker: "Publicações",
    title: "Publicações que chegam triadas",
    p1: "DJEN e DATAJUD entram direto na fila do escritório, já separadas por processo e por fonte — sem copiar e colar de e-mail nem abrir site de tribunal um por um.",
    p2: "Cada publicação vem com um toque para gerar prazo, marcar audiência ou delegar — o texto de origem fica sempre acessível, sem sair da tela.",
    figure: "Lista de Publicações: card com filete por fonte (DJEN/DATAJUD/PJe), badge “Não lida”, ações “Gerar Prazo” e “Delegar”",
  },
  {
    kicker: "Painel",
    title: "O dia na frente",
    p1: "Um painel mostra o que vence hoje, o que já passou do prazo e a agenda da semana — com o calendário de feriados de cada tribunal já embutido no cálculo do prazo fatal.",
    p2: "Cada advogado vê a própria fila; quem administra o escritório vê o todo, sem precisar abrir uma planilha à parte.",
    figure: "Painel: cartões “Hoje”, “Atrasados”, agenda da semana, prazo de segurança marcado em cor distinta",
  },
  {
    kicker: "Peticionamento",
    title: "Peticionamento com o timbrado do escritório",
    p1: "Modelos de peça já saem formatados com o timbrado, os dados do processo e da parte preenchidos automaticamente — o texto jurídico continua sendo escrito pelo advogado.",
    p2: "O histórico de peças de cada processo fica junto com ele, pesquisável, sem depender de pasta de rede.",
    figure: "Editor de petição com timbrado do escritório, campos de processo/parte preenchidos, botão “Baixar .docx”",
  },
  {
    kicker: "Financeiro",
    title: "Financeiro que fecha",
    p1: "DRE, livro caixa e conciliação bancária num só módulo — honorários contratuais, de êxito e de sucumbência entram separados, com baixa parcial de verdade.",
    p2: "Contas a pagar e a receber conversam com a agenda: vencimento vira lembrete, não vira surpresa no fim do mês.",
    figure: "DRE por categoria, gráfico de fluxo de caixa, tabela de Contas a Receber com status Pendente/Parcial/Pago",
  },
  {
    kicker: "Sigilo",
    title: "Sigilo auditável",
    p1: "Documento e telefone de cliente aparecem mascarados por padrão; revelar exige motivo registrado, com validade de 15 minutos — e fica na trilha de auditoria do escritório.",
    p2: "Suporte técnico só entra na conta de um escritório com sessão de tempo limitado e visível para o administrador — nunca em silêncio.",
    figure: "Campo de CPF mascarado com botão “Revelar” e caixa de motivo, trilha de auditoria listando revelações",
  },
];

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

const PLANS = [
  { name: "Individual", detail: "Até 1 advogado", items: ["Publicações DJEN + DATAJUD", "Painel, agenda e peticionamento", "Financeiro básico"] },
  { name: "Escritório", detail: "Até 10 usuários", items: ["Tudo do plano Individual", "Financeiro completo (DRE, conciliação)", "Trilha de auditoria e máscara"] },
  { name: "Corporativo", detail: "Usuários ilimitados", items: ["Tudo do plano Escritório", "Onboarding assistido", "Suporte prioritário"] },
];

const navLink = "text-sm font-semibold text-tx hover:underline underline-offset-4";
const btnPrimary = "inline-flex items-center justify-start h-10 px-5 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm";
const btnSecondary = "inline-flex items-center justify-start h-10 px-5 border-2 border-regua-forte text-tx font-extrabold text-sm hover:bg-acao-bg";
const placeholderBox = "border-2 border-dashed border-atencao bg-sf";
const placeholderTag = "inline-block text-[10px] font-extrabold uppercase tracking-[.1em] text-atencao border border-atencao bg-sf px-1.5 py-0.5";

export default async function HomePage() {
  // Usuário com sessão válida nunca vê a homepage de marketing — vai direto pro Painel.
  const user = await getCurrentUser();
  if (user) redirect("/painel");

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
            <Link className={navLink} href="/login">Entrar</Link>
          </nav>
          <Link href="/cadastro" className={btnPrimary}>Começar</Link>
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
                <div className={`aspect-[4/3] border-2 border-regua-forte bg-sf flex items-center p-6 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                  <p className="text-xs font-semibold text-tx-3">Captura de tela — {f.figure}</p>
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

        {/* 6. Preço */}
        <section id="preco" className="border-t-2 border-regua-forte py-20">
          <div className="max-w-[1120px] mx-auto px-6">
            <h2 className="text-[30px] font-extrabold tracking-[-.015em] mb-11">Um plano para cada tamanho de escritório</h2>
            <div className="grid md:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.name} className={`p-6 ${placeholderBox}`}>
                  <span className={placeholderTag}>Substituir</span>
                  <div className="text-[13px] font-extrabold uppercase tracking-[.08em] text-tx-2 mt-3">{plan.name}</div>
                  <div className="text-[13px] text-tx-3 mt-1">{plan.detail}</div>
                  <div className="text-4xl font-extrabold mt-3">R$ —<span className="text-sm font-semibold text-tx-2">/mês</span></div>
                  <ul className="mt-5 space-y-2.5">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-tx-2">
                        <span className="w-2 h-2 bg-marca mt-1.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href="/cadastro" className={`${btnSecondary} w-full justify-center mt-6 mb-1`}>Começar</Link>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-tx-3 mt-6">Preços de exemplo — preencher com a tabela real (revisada por advogado, regras da OAB) antes do deploy.</p>
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
