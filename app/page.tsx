import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArrowRight, Check, Minus } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { calcularPrecoDoPlano, MODULOS } from "@/lib/officePricing";
import LumenMark from "@/components/LumenMark";
import CookieConsent from "@/components/site/CookieConsent";
import PreferenciasCookies from "@/components/site/PreferenciasCookies";
import SiteHeader from "@/components/site/SiteHeader";
import SigiloDemo from "@/components/site/SigiloDemo";
import Faq, { type Pergunta } from "@/components/site/Faq";
import { comManifestoDoSite } from "@/lib/pwaManifestoDoSite";

// Capa (homepage PÚBLICA "/") do Lúmen — redesenho de 29/09/2026 (plano e mockup do gauntlet de
// design; aprovado pelo dono). Cada frase desta página tem respaldo em código: a tabela de
// promessas está no PR e no plano (seção 4). O que NÃO tem respaldo não entra: sem "conciliação
// bancária", sem "prazo fatal", sem "93 tribunais", sem teste grátis, sem CNPJ, sem selo de
// conformidade (LGPD/OAB). Ao mexer em qualquer texto, confira a frase contra o código antes.
//
// Estrutura: cabeçalho · herói (uma ação principal, WhatsApp como secundária humana) · três
// provas · produto (captura REAL da fila de Publicações) · como funciona · assessoria e
// financeiro · segurança e sigilo (demonstração operável) · planos (lidos do Painel Mestre) ·
// perguntas · fecho · rodapé.
//
// Sistema: escala tipográfica de 8 tamanhos e 3 pesos (400/600/700) — tokens `capa-*` em
// tailwind.config.ts; cor só por tokens (bordô só em: botão principal, o "seu" do H1, filete do
// cabeçalho rolado, borda do plano recomendado, numerais dos passos); filete de 2px no lugar de
// sombra; raio de 2px. O único movimento autoral é "arquivar" (a árvore do Drive no herói);
// o resto é feedback. Nada de GrainOverlay, halo, diagramas em SVG ou fotografia de banco de
// imagens.
//
// Preços: NUNCA no JSX. Vêm de Plan/ModulePrice (Painel Mestre → Preços) via unstable_cache; plano
// com módulo sem preço mostra "Sob consulta" e leva ao WhatsApp. `force-dynamic` continua porque
// getCurrentUser() precisa checar a sessão a cada visita (quem está logado nunca vê a Capa).
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

export function generateMetadata() {
  return {
    title: "Lúmen — Software de gestão para escritórios de advocacia",
    description:
      "Os documentos do escritório ficam no Drive do próprio escritório. Publicações do DJEN e do Datajud, agenda de prazos, financeiro e sigilo auditável em um só sistema.",
    ...comManifestoDoSite(),
  };
}

const WHATSAPP_URL = "https://wa.me/5562981283481";

// Botões: UMA ação principal por dobra (bordô); a segunda é um link de texto ou um contorno.
const btnBase =
  "inline-flex items-center justify-center gap-2.5 min-h-[48px] px-[22px] py-2.5 border-2 border-transparent rounded-[2px] text-capa-corpo leading-tight font-bold text-center max-w-full transition-[background-color,border-color,transform] duration-100 ease-out active:translate-y-px motion-reduce:active:translate-y-0";
const btnPrimario = `${btnBase} bg-acao hover:bg-acao-hover text-acao-tx`;
const btnGrande = "!min-h-[54px] !px-7";
const btnContorno = `${btnBase} border-regua-forte text-tx hover:bg-acao-bg hover:border-marca-tx`;
const linkTexto =
  "inline-flex items-center min-h-[44px] font-semibold underline underline-offset-4 decoration-regua-forte hover:decoration-current transition-[text-decoration-color] duration-100 ease-out";
const linkRodape =
  "inline-flex items-center min-h-[44px] text-capa-mini text-tx-2 hover:text-tx hover:underline underline-offset-2 transition-colors duration-100 ease-out";

// Árvore de pastas (mono): a demonstração do diferencial, não uma descrição dele.
const linhaArvore = "flex gap-3 py-[3px]";
const nivel = "ml-1.5 pl-3 border-l border-regua";

function Seta() {
  return <ArrowRight size={20} strokeWidth={2.5} aria-hidden="true" className="shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none" />;
}

// Ordem dos módulos na lista do plano: a mesma que o visitante espera (o que mais pesa primeiro).
const ORDEM_MODULOS = ["FINANCEIRO", "ATENDIMENTO", "WHATSAPP", "ASSESSORIA"] as const;

function precoCurto(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}

const PERGUNTAS: Pergunta[] = [
  {
    id: "onde",
    pergunta: "Onde ficam os documentos do meu escritório?",
    resposta: (
      <p>
        No Google Drive do próprio escritório, em uma pasta por processo, separada por tipo de documento. Se você
        cancelar o Lúmen, os arquivos continuam lá.
      </p>
    ),
  },
  {
    id: "prazo",
    pergunta: "O prazo que o Lúmen mostra é o prazo fatal?",
    resposta: (
      <p>
        É uma sugestão. O Lúmen considera fins de semana, feriados nacionais, o recesso forense e os feriados locais
        cadastrados pelo escritório, mas a conferência e a confirmação do prazo são do advogado.
      </p>
    ),
  },
  {
    id: "protocolo",
    pergunta: "O Lúmen protocola petições?",
    resposta: (
      <p>
        Não. O Peticionamento gera uma minuta em rascunho, com o timbrado do escritório e os dados do processo,
        redigida com inteligência artificial. Ela nunca é protocolada pelo Lúmen: o advogado revisa, baixa e protocola.
      </p>
    ),
  },
  {
    id: "equipe",
    pergunta: "Quem da equipe do Lúmen enxerga os dados do meu escritório?",
    resposta: (
      <p>
        O suporte só entra em uma conta com motivo registrado, em sessão de 30 minutos, e o administrador do
        escritório vê um aviso enquanto ela durar.
      </p>
    ),
  },
  {
    id: "depois",
    pergunta: "O que acontece depois que eu criar a conta?",
    resposta: (
      <p>
        A conta do escritório é criada na hora, com você como administrador. Em seguida você liga o Google Drive em
        Conexões e cadastra a OAB de cada advogado na Equipe. Para conversar sobre plano e condições, fale conosco pelo{" "}
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
          WhatsApp<span className="sr-only"> (abre em nova aba)</span>
        </a>
        .
      </p>
    ),
  },
  {
    id: "senha",
    pergunta: "Esqueci minha senha. E agora?",
    resposta: (
      <p>
        Na tela de entrada, use{" "}
        <Link href="/recuperar-senha" className="font-semibold underline underline-offset-4">
          Esqueci minha senha
        </Link>
        . Enviamos um link por e-mail, e ele vale por 1 hora.
      </p>
    ),
  },
];

export default async function HomePage() {
  // Usuário com sessão válida nunca vê a Capa — vai direto pro Painel (ou pro escolhedor, se tiver
  // acesso de plataforma — ver lib/actions/auth.ts).
  const user = await getCurrentUser();
  if (user) {
    const hasPlatformAccess = user.isPlatformOwner || Boolean(await getPlatformMember());
    redirect(hasPlatformAccess ? "/escolher" : "/painel");
  }

  const { plansRaw, modulePrices } = await getHomepagePricingData();
  const plans = plansRaw.filter((p) => !p.isCustom);
  const sobMedida = plansRaw.find((p) => p.isCustom);

  return (
    <div className="site-publico bg-sf-fundo text-tx text-capa-corpo">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-acao focus:text-acao-tx focus:px-4 focus:py-3 focus:font-bold"
      >
        Ir para o conteúdo
      </a>

      <SiteHeader />

      <main id="conteudo" tabIndex={-1} className="outline-none">
        {/* 1. HERÓI — o H1 é a frase verificável no código (custódia no Drive do escritório). */}
        <section aria-labelledby="h-heroi" className="py-[clamp(40px,7vw,96px)]">
          <div className="capa-faixa grid grid-cols-1 gap-11 items-center min-[1100px]:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] min-[1100px]:gap-16">
            <div className="min-w-0">
              <h1 id="h-heroi" className="text-capa-display font-bold max-w-[16ch] [text-wrap:balance]">
                Os documentos do seu escritório ficam no <span className="text-marca-tx">seu</span> Drive.
              </h1>
              <p className="mt-5 text-destaque text-tx-2 max-w-[46ch]">
                Cada processo vira uma pasta no Google Drive do próprio escritório, separada por tipo de documento.
                Se você cancelar amanhã, o acervo continua lá: organizado, nomeado e seu.
              </p>
              <p className="mt-3 text-capa-corpo text-tx-2 max-w-[46ch]">
                Junto vêm as publicações do DJEN e do Datajud, a agenda de prazos e o financeiro do escritório.
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3.5 mt-8">
                <Link href="/cadastro" className={`group ${btnPrimario} ${btnGrande}`}>
                  Criar a conta do escritório <Seta />
                </Link>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={linkTexto}>
                  Falar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                </a>
              </div>
              <p className="mt-3.5 text-capa-mini text-tx-3 max-w-[46ch]">
                Leva um minuto: nome do escritório, o seu nome, e-mail e senha. A conta é criada na hora.
              </p>
            </div>

            <div className="min-w-0 w-full max-w-[640px] min-[1100px]:max-w-none">
              <div className="capa-guia">
                <span>Google Drive do escritório</span>
                <span className="capa-guia-meta font-normal normal-case tracking-normal text-tx-3">conta do cliente, não a nossa</span>
              </div>
              <div className="bg-sf border-2 border-regua-forte rounded-[2px] rounded-tl-none">
                {/* O ÚNICO movimento autoral da página (Movimento 7 · arquivar, globals.css): cada
                    linha entra da esquerda a partir da régua de que pende, em 55ms de escalonamento.
                    Só opacity/transform/clip-path: CLS zero. As subpastas são tipos REAIS de
                    lib/documentTypes.ts (a pasta de cada tipo só nasce quando há arquivo). */}
                <div
                  role="img"
                  aria-label="Exemplo de estrutura no Drive: a pasta Lúmen — Processos contém uma pasta por processo, e cada processo tem subpastas por tipo de documento, como Petição, Contestação, Procuração e Sentença."
                  className="px-4 py-[18px] font-mono text-capa-mini leading-normal text-tx-2 [overflow-wrap:anywhere]"
                >
                  <div className={`${linhaArvore} arquiva-linha`}>
                    <span className="font-semibold text-tx min-w-0 flex-1">Lúmen — Processos</span>
                  </div>
                  <div className={nivel}>
                    <div className={`${linhaArvore} arquiva-linha`} style={{ animationDelay: "55ms" }}>
                      <span className="font-semibold text-tx min-w-0 flex-1">Arantes, Wagner Barros — 0812445-19.2025</span>
                    </div>
                    <div className={`${nivel} mt-0.5`}>
                      {[
                        ["Petição", "4", "110ms"],
                        ["Contestação", "2", "165ms"],
                        ["Procuração", "1", "220ms"],
                        ["Sentença", "1", "275ms"],
                      ].map(([nome, n, atraso]) => (
                        <div key={nome} className={`${linhaArvore} arquiva-linha`} style={{ animationDelay: atraso }}>
                          <span className="min-w-0 flex-1">{nome}</span>
                          <span className="text-tx-3 tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`${linhaArvore} arquiva-linha mt-1.5`} style={{ animationDelay: "330ms" }}>
                      <span className="font-semibold text-tx min-w-0 flex-1">Meireles &amp; Cia — 0755102-44.2025</span>
                    </div>
                    <div className={`${linhaArvore} arquiva-linha`} style={{ animationDelay: "385ms" }}>
                      <span className="font-semibold text-tx min-w-0 flex-1">Alves Transportes — 0660154-06.2026</span>
                    </div>
                  </div>
                </div>
                <p className="px-4 py-3 border-t border-regua text-capa-mini text-tx-2">
                  Uma vez por dia o Lúmen confere se o Drive continua como o sistema espera. O que sair do lugar
                  aparece como alerta.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. TRÊS PROVAS — lista com filetes, não cartões. */}
        <section aria-labelledby="h-provas" className="border-y-2 border-regua-forte">
          <h2 id="h-provas" className="sr-only">
            Em resumo
          </h2>
          <div className="capa-faixa">
            <ul className="grid min-[860px]:grid-cols-3">
              {[
                ["Seus arquivos, sua conta.", "Os documentos ficam no Google Drive do escritório. Cancelar o Lúmen não apaga nada."],
                ["Publicações com origem.", "DJEN, pela OAB de cada advogado, e Datajud entram na fila, separados por processo e por fonte."],
                ["Sigilo com registro.", "CPF e telefone aparecem mascarados. Revelar exige motivo, vale 15 minutos e fica na trilha."],
              ].map(([t, p], i) => (
                <li
                  key={t}
                  className={`py-6 min-[860px]:py-7 ${i > 0 ? "border-t border-regua min-[860px]:border-t-0 min-[860px]:border-l min-[860px]:pl-8" : ""} ${i < 2 ? "min-[860px]:pr-8" : ""}`}
                >
                  <h3 className="text-capa-h3 font-bold">{t}</h3>
                  <p className="mt-1.5 text-capa-corpo text-tx-2 max-w-[44ch]">{p}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. PRODUTO — captura REAL da fila de Publicações (instância de demonstração, dados
            fictícios). Refazer a captura se a tela mudar; nunca usar captura de produção. */}
        <section id="produto" aria-labelledby="h-prod" className="scroll-mt-[88px] py-[clamp(56px,8vw,104px)]">
          <div className="capa-faixa grid gap-10 items-start min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)] min-[960px]:gap-16">
            <div className="min-w-0">
              <h2 id="h-prod" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
                Cada publicação chega com o próximo passo.
              </h2>
              <p className="mt-5 text-destaque text-tx-2 max-w-[62ch]">
                As publicações entram na fila do escritório já separadas por processo e por fonte. Sem copiar e colar de
                e-mail, sem abrir site de tribunal um por um. Cada advogado vê a própria fila; quem administra vê o todo.
              </p>
              <ul className="mt-6 border-t border-regua">
                {[
                  ["Gerar prazo", "Cria o prazo na agenda, ligado ao processo."],
                  ["Marcar audiência", "Quando a publicação convoca, a data vai para a agenda."],
                  ["Delegar", "Passa a publicação a quem vai tratá-la. O texto de origem continua a um toque."],
                ].map(([t, p]) => (
                  <li key={t} className="grid grid-cols-1 min-[481px]:grid-cols-[150px_1fr] gap-0.5 min-[481px]:gap-3 py-3.5 border-b border-regua">
                    <b className="font-bold">{t}</b>
                    <span className="text-tx-2">{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 px-[18px] py-4 bg-sf border-2 border-regua rounded-[2px] text-capa-mini">
                <b className="font-bold">O prazo é sugerido; quem confirma é o advogado.</b>{" "}
                <span className="text-tx-2">
                  O Lúmen propõe a data considerando fins de semana, feriados nacionais, o recesso forense e os feriados
                  locais que o escritório cadastra.
                </span>
              </div>
            </div>
            <figure className="w-full max-w-[440px] justify-self-center m-0">
              <Image
                src="/homepage/capa-publicacoes.webp"
                width={420}
                height={675}
                sizes="(min-width: 960px) 440px, 92vw"
                alt="Tela real do Lúmen: fila de Publicações, com abas Não triadas, Minhas e Sem processo, busca e cartões de publicações de ESAJ, PROJUDI, e-mail e DJEN, cada um com o processo e as partes."
                className="capa-tela w-full h-auto border-2 border-regua-forte border-b-transparent rounded-[2px] bg-grafite-800"
              />
              <figcaption className="mt-3 text-capa-mini text-tx-3">Tela real da fila de Publicações, com dados fictícios.</figcaption>
            </figure>
          </div>
        </section>

        {/* 4. COMO FUNCIONA — a ordem informa, por isso os três numerais. */}
        <section id="como" aria-labelledby="h-como" className="scroll-mt-[88px] pb-[clamp(56px,8vw,104px)]">
          <div className="capa-faixa">
            <h2 id="h-como" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
              Do cadastro à primeira fila em três passos.
            </h2>
            <ol className="mt-10 grid min-[860px]:grid-cols-3 min-[860px]:gap-10">
              {[
                ["1", "Crie a conta e ligue o Drive.", "Um minuto de cadastro. Depois, autorize o Google Drive do escritório em Conexões."],
                ["2", "Cadastre a OAB de quem advoga.", "Com a OAB de cada advogado na Equipe, o Lúmen passa a buscar as publicações dele no DJEN."],
                ["3", "Trabalhe a fila do dia.", "A publicação vira prazo e agenda, o arquivo vai para a pasta do processo, e o painel mostra o que vence hoje."],
              ].map(([n, t, p]) => (
                <li key={n} className="pt-6 pb-7 border-t-2 border-regua-forte">
                  <p className="text-tarja font-bold tabular-nums text-marca-tx" aria-hidden="true">
                    {n}
                  </p>
                  <h3 className="mt-3.5 text-capa-h3 font-bold">
                    <span className="sr-only">Passo {n}: </span>
                    {t}
                  </h3>
                  <p className="mt-2 text-capa-corpo text-tx-2 max-w-[36ch]">{p}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5. ASSESSORIA E FINANCEIRO — pesos diferentes de propósito (7fr / 5fr). */}
        <section aria-labelledby="h-alem" className="pb-[clamp(56px,8vw,104px)]">
          <div className="capa-faixa">
            <h2 id="h-alem" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
              Assessoria e financeiro têm lugar próprio.
            </h2>
            <div className="mt-10 grid gap-14 min-[960px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] min-[960px]:gap-[72px]">
              <div className="min-w-0">
                <h3 className="text-capa-h3 font-bold">Assessoria empresarial não é processo disfarçado.</h3>
                <p className="mt-2.5 text-capa-corpo text-tx-2 max-w-[62ch]">
                  Contrato, licitação, parecer e demanda recorrente têm modelo, pasta e ciclo próprios. Honorário mensal,
                  documentos da empresa e histórico de demandas ficam no mesmo lugar.
                </p>
                <div className="mt-6">
                  <div className="capa-guia">
                    <span>Drive · Empresa cliente</span>
                  </div>
                  <div className="bg-sf border-2 border-regua-forte rounded-[2px] rounded-tl-none">
                    <div
                      role="img"
                      aria-label="Pastas da empresa no Drive: Contratos, Pareceres, Licitações e Regimentos Internos."
                      className="px-4 py-[18px] font-mono text-capa-mini leading-normal text-tx-2"
                    >
                      <div className={linhaArvore}>
                        <span className="font-semibold text-tx">Empresa cliente</span>
                      </div>
                      <div className={nivel}>
                        {["Contratos", "Pareceres", "Licitações", "Regimentos Internos"].map((n) => (
                          <div key={n} className={linhaArvore}>
                            <span>{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-capa-mini text-tx-3">Módulo Assessoria Jurídica, conforme o plano.</p>
              </div>
              <div className="min-w-0">
                <h3 className="text-capa-h3 font-bold">Financeiro do escritório.</h3>
                <ul className="mt-5 border-t border-regua">
                  {[
                    "DRE e livro caixa.",
                    "Contas a pagar e a receber, com o vencimento na agenda como lembrete.",
                    "Honorários contratuais, de êxito e de sucumbência, lançados separados, com baixa parcial.",
                  ].map((t) => (
                    <li key={t} className="flex gap-3 py-3.5 border-b border-regua">
                      <Check size={20} strokeWidth={2.5} aria-hidden="true" className="shrink-0 mt-[3px] text-concluido" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-capa-mini text-tx-3">Módulo Financeiro, conforme o plano.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. SEGURANÇA E SIGILO — a faixa escura é a mesma nos dois temas (grafite fixo). */}
        <section
          id="seguranca"
          aria-labelledby="h-seg"
          className="scroll-mt-[88px] py-[clamp(56px,8vw,104px)] bg-grafite-800 dark:bg-grafite-900 text-neutro-100 border-y-2 border-regua-forte"
        >
          <div className="capa-faixa">
            <h2 id="h-seg" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
              Sigilo que você confere na própria tela.
            </h2>
            <p className="mt-4 text-destaque text-neutro-300 max-w-[62ch]">
              Experimente abaixo o mascaramento que o Lúmen usa nas fichas de cliente. É uma demonstração com dados
              fictícios.
            </p>
            <div className="mt-10 grid gap-12 items-start min-[960px]:grid-cols-2 min-[960px]:gap-[72px]">
              <div className="min-w-0">
                <SigiloDemo />
              </div>
              <div className="min-w-0">
                <ul className="border-t border-grafite-500">
                  {[
                    ["Seus arquivos ficam no seu Drive.", "O Lúmen usa a autorização do Google do próprio escritório. Publicações, prazos e financeiro ficam no banco de dados do Lúmen."],
                    ["Revelar exige motivo e deixa rastro.", "Documento e telefone de cliente aparecem mascarados. O motivo tem no mínimo 20 caracteres, a revelação vale 15 minutos e entra na trilha de auditoria."],
                    ["O suporte não entra em silêncio.", "A equipe do Lúmen só acessa uma conta com motivo, em sessão de 30 minutos e com aviso visível ao administrador."],
                    ["A inteligência artificial é dita, não escondida.", "A minuta de peça e o assistente usam IA. A minuta é rascunho e nunca é protocolada pelo Lúmen. Segundo a política de privacidade, o conteúdo enviado ao provedor não é usado para treinar modelos."],
                  ].map(([t, p]) => (
                    <li key={t} className="py-5 border-b border-grafite-500">
                      <h3 className="text-capa-h3 font-bold">{t}</h3>
                      <p className="mt-1.5 text-capa-corpo text-neutro-300 max-w-[52ch]">{p}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
                  <Link href="/privacidade" className="inline-flex items-center min-h-[44px] font-semibold underline underline-offset-4 decoration-grafite-300 hover:decoration-current">
                    Ler a política de privacidade
                  </Link>
                  <a href="mailto:contato@rodarteprado.com.br" className="inline-flex items-center min-h-[44px] font-semibold underline underline-offset-4 decoration-grafite-300 hover:decoration-current">
                    Falar com o encarregado de dados (DPO)
                  </a>
                </div>
                <p className="mt-5 text-capa-mini text-neutro-300 max-w-[52ch]">
                  Descrevemos o que o sistema faz. Não usamos selo de conformidade.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. PLANOS — lidos do Painel Mestre. Só o recomendado é bordô; módulo ausente aparece
            esmaecido; o botão fica ancorado no rodapé do cartão. */}
        <section id="planos" aria-labelledby="h-planos" className="scroll-mt-[88px] py-[clamp(56px,8vw,104px)]">
          <div className="capa-faixa">
            <h2 id="h-planos" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
              Um plano para cada tamanho de escritório.
            </h2>
            <p className="mt-4 text-destaque text-tx-2 max-w-[62ch]">
              Você escolhe pelo número de advogados com OAB cadastrada e pelos módulos de que precisa.
            </p>
            <div className="mt-10 grid gap-4 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,232px),1fr))]">
              {plans.map((plan) => {
                const calc = calcularPrecoDoPlano(plan, modulePrices);
                const semPreco = calc.modulosSemPreco.length > 0;
                const incluso = (key: (typeof ORDEM_MODULOS)[number]) =>
                  key === "FINANCEIRO" ? plan.moduloFinanceiro : key === "ASSESSORIA" ? plan.moduloAssessoria : key === "WHATSAPP" ? plan.moduloWhatsapp : plan.moduloAtendimento;
                return (
                  <article
                    key={plan.id}
                    aria-labelledby={`plano-${plan.key}`}
                    className={`relative flex flex-col p-6 bg-sf border-2 rounded-[2px] ${plan.recommended ? "border-marca-tx" : "border-regua-forte"}`}
                  >
                    {plan.recommended && (
                      <span className="absolute -top-3.5 left-5 px-2.5 py-0.5 bg-acao text-acao-tx text-etiqueta font-bold uppercase tracking-[.06em] rounded-[2px]">
                        Recomendado
                      </span>
                    )}
                    <h3 id={`plano-${plan.key}`} className="text-capa-h3 font-bold">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-capa-mini text-tx-2">
                      {plan.maxOabs != null && `Até ${plan.maxOabs} advogado${plan.maxOabs > 1 ? "s" : ""}`}
                      {plan.maxOabs != null && plan.maxProcessos != null && " · "}
                      {plan.maxProcessos != null && `até ${new Intl.NumberFormat("pt-BR").format(plan.maxProcessos)} processos`}
                    </p>
                    <p className="mt-4 flex items-baseline gap-1.5">
                      {semPreco ? (
                        <span className="text-capa-h3 font-bold">Sob consulta</span>
                      ) : (
                        <>
                          <span className="text-tarja font-bold tabular-nums">{precoCurto(calc.total)}</span>
                          <small className="text-capa-mini font-semibold text-tx-2">/mês</small>
                        </>
                      )}
                    </p>
                    <ul className="mt-5 grid gap-2.5 flex-1 content-start">
                      {ORDEM_MODULOS.map((key) => {
                        const label = MODULOS.find((m) => m.key === key)!.label;
                        return incluso(key) ? (
                          <li key={key} className="flex gap-2.5 text-capa-mini leading-snug">
                            <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 mt-px text-concluido" />
                            {label}
                          </li>
                        ) : (
                          <li key={key} className="flex gap-2.5 text-capa-mini leading-snug text-tx-3">
                            <Minus size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 mt-px" />
                            Sem {label}
                          </li>
                        );
                      })}
                    </ul>
                    {semPreco ? (
                      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={`${btnContorno} w-full mt-6`}>
                        Falar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                      </a>
                    ) : (
                      <Link href={`/cadastro?plano=${plan.key}`} className={`${plan.recommended ? btnPrimario : btnContorno} w-full mt-6`}>
                        Criar conta no {plan.name}
                      </Link>
                    )}
                  </article>
                );
              })}
              {sobMedida && (
                <article aria-labelledby="plano-sob-medida" className="relative flex flex-col p-6 bg-sf border-2 border-regua-forte rounded-[2px]">
                  <h3 id="plano-sob-medida" className="text-capa-h3 font-bold">
                    {sobMedida.name}
                  </h3>
                  <p className="mt-1 text-capa-mini text-tx-2">Módulos, processos e advogados combinados com você</p>
                  <p className="mt-4">
                    <span className="text-capa-h3 font-bold">Sob consulta</span>
                  </p>
                  <ul className="mt-5 grid gap-2.5 flex-1 content-start">
                    <li className="flex gap-2.5 text-capa-mini leading-snug">
                      <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 mt-px text-concluido" />
                      Escolha os módulos e o volume do escritório
                    </li>
                  </ul>
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={`${btnContorno} w-full mt-6`}>
                    Falar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                  </a>
                </article>
              )}
            </div>
          </div>
        </section>

        {/* 8. PERGUNTAS */}
        <section id="perguntas" aria-labelledby="h-faq" className="scroll-mt-[88px] pb-[clamp(56px,8vw,104px)]">
          <div className="capa-faixa">
            <h2 id="h-faq" className="text-capa-h2 font-bold max-w-[24ch] [text-wrap:balance]">
              Perguntas de quem decide.
            </h2>
            <Faq itens={PERGUNTAS} />
          </div>
        </section>

        {/* 9. FECHO — ficha calma com aba, não mais parede bordô. */}
        <section id="contato" aria-labelledby="h-fecho" className="scroll-mt-[88px] pt-[clamp(48px,7vw,88px)] pb-[clamp(64px,8vw,112px)]">
          <div className="capa-faixa">
            <div className="capa-guia">
              <span>Comece pelo Drive</span>
            </div>
            <div className="bg-sf border-2 border-regua-forte rounded-[2px] rounded-tl-none p-[clamp(28px,5vw,56px)]">
              <h2 id="h-fecho" className="text-capa-h2 font-bold max-w-[20ch] [text-wrap:balance]">
                Abra a conta do escritório e ligue o Drive hoje.
              </h2>
              <p className="mt-3.5 text-destaque text-tx-2 max-w-[62ch]">
                Prefere conversar antes? Responda a uma dúvida de plano, de sigilo ou de migração direto pelo WhatsApp.
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3.5 mt-7">
                <Link href="/cadastro" className={`group ${btnPrimario} ${btnGrande}`}>
                  Criar a conta do escritório <Seta />
                </Link>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={linkTexto}>
                  Falar no WhatsApp<span className="sr-only"> (abre em nova aba)</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-regua-forte pt-12 pb-8">
        <div className="capa-faixa">
          <div className="grid gap-8 min-[720px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5 font-bold text-destaque tracking-[.16em] mb-2.5">
                <LumenMark size={26} /> LÚMEN
              </div>
              <p className="text-capa-mini text-tx-2 max-w-[32ch]">Software de gestão jurídica para escritórios de advocacia.</p>
            </div>
            <div>
              <h2 className="text-capa-mini font-bold mb-3">Produto</h2>
              <ul>
                <li><a href="#produto" className={linkRodape}>Produto</a></li>
                <li><a href="#seguranca" className={linkRodape}>Segurança e sigilo</a></li>
                <li><a href="#planos" className={linkRodape}>Planos</a></li>
                <li><a href="#perguntas" className={linkRodape}>Perguntas frequentes</a></li>
                <li><Link href="/blog" className={linkRodape}>Blog</Link></li>
                <li><Link href="/login" className={linkRodape}>Entrar</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="text-capa-mini font-bold mb-3">Contato</h2>
              <ul>
                <li><span className="inline-flex items-center min-h-[44px] text-capa-mini text-tx-2">Goiânia — GO</span></li>
                <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={linkRodape}>(62) 98128-3481</a></li>
                <li><a href="mailto:contato@rodarteprado.com.br" className={linkRodape}>contato@rodarteprado.com.br</a></li>
              </ul>
            </div>
            <div>
              <h2 className="text-capa-mini font-bold mb-3">Legal</h2>
              <ul>
                <li><Link href="/privacidade" className={linkRodape}>Política de privacidade</Link></li>
                {/* DPO reaproveita o contato real já existente: sem CNPJ nem razão social aqui —
                    melhor omitir do que publicar um valor inventado. */}
                <li><a href="mailto:contato@rodarteprado.com.br" className={linkRodape}>Encarregado de dados (DPO)</a></li>
                <li><PreferenciasCookies className={linkRodape} /></li>
              </ul>
            </div>
          </div>
          <div className="mt-7 pt-[18px] border-t border-regua text-capa-mini text-tx-3">
            <span>© 2026 Lúmen. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>

      <CookieConsent />
    </div>
  );
}
