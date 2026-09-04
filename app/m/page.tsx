import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getOfficeModules, hasBlogAccess } from "@/lib/officeModules";
import { getAlerts, type AlertItem } from "@/lib/alerts";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { countUnreadPublicationGroups } from "@/lib/publicationGrouping";
import { naturezaWhere } from "@/lib/caseNatureza";
import { Card, formatCurrency, type CardAccent } from "@/components/ui";
import { valorLiquido } from "@/lib/financeCalc";
import MobileGlobalSearch from "@/components/mobile/MobileGlobalSearch";
import GrainOverlay from "@/components/GrainOverlay";
import AlertRow from "@/components/AlertRow";
import {
  CalendarPlus,
  ListTodo,
  CalendarClock,
  Gavel,
  Stethoscope,
  Phone,
  Briefcase,
  Bell,
  Newspaper,
  DollarSign,
  Wallet,
  FileBarChart,
  LineChart,
  BookOpen,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Building2,
  type LucideIcon,
} from "lucide-react";

// Ordem de urgência pra escolher os alertas da prévia da Início — mesma leitura de severidade
// da Central de Alertas (DESIGN-SYSTEM.md §8), só usada aqui pra ordenar, não pra pintar nada
// de novo (a cor já vem de severityStripe abaixo).
const SEVERITY_RANK: Record<AlertItem["severity"], number> = { alta: 0, media: 1, baixa: 2 };
function maisUrgentesPrimeiro(a: AlertItem, b: AlertItem): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.date.getTime() - a.date.getTime();
}

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Saldo do mês corrente (por vencimento, excluindo cancelados e A_APURAR), somando o valor
// LÍQUIDO (amount - discount + surcharge) — mesma metodologia da página de Fluxo de Caixa (ver
// app/m/financeiro/fluxo-de-caixa/page.tsx), só que restrita ao mês atual: alimenta o número do
// atalho "Financeiro" na Início, pra ele responder antes do toque igual aos outros atalhos
// (contagem de processos, alertas, publicações). `_sum` do Prisma não expressa
// amount-discount+surcharge, então soma-se em código com valorLiquido — antes este número era o
// valor BRUTO (amount puro), divergindo do Fluxo de Caixa sempre que houvesse desconto/acréscimo
// (achado A58 da revisão gauntlet).
async function getMonthlyNetFlow(officeId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const where = { officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, dueDate: { gte: monthStart, lte: monthEnd } };
  const [receitas, despesas] = await Promise.all([
    prisma.receivable.findMany({ where, select: { amount: true, discount: true, surcharge: true } }),
    prisma.payable.findMany({ where, select: { amount: true, discount: true, surcharge: true } }),
  ]);
  const soma = (rows: { amount: number; discount: number; surcharge: number }[]) =>
    rows.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  return soma(receitas) - soma(despesas);
}

export default async function MobileHome() {
  const user = await getCurrentUser();
  const [unreadPublicationsRaw, alerts, assessoriaCount, activeCasesCount, activeJudicialCount, activeAdministrativoCount, blockedSet] = await Promise.all([
    user
      ? prisma.publication.findMany({ where: { officeId: user.officeId, reads: { none: { userId: user.id } } }, select: { id: true, processNumberRaw: true, publishedAt: true } })
      : Promise.resolve([]),
    // Lista completa (não só a contagem) — alimenta tanto o número do atalho quanto a prévia
    // dos alertas mais urgentes logo abaixo, sem precisar de uma segunda consulta.
    user ? getAlerts(user.officeId, Boolean(user.isAdmin || user.financeAccess), user.id, user.isAdmin) : Promise.resolve([]),
    user ? prisma.assessoria.count({ where: { status: "ATIVA", officeId: user.officeId } }) : Promise.resolve(0),
    user ? prisma.case.count({ where: { officeId: user.officeId, status: "ATIVO" } }) : Promise.resolve(0),
    // Divisão judicial/administrativo do atalho "Processos" abaixo — duas contagens leves a mais
    // dentro do mesmo Promise.all já existente (naturezaWhere vem de lib/caseNatureza.ts, nunca
    // comparar Case.type na mão).
    user ? prisma.case.count({ where: { officeId: user.officeId, status: "ATIVO", ...naturezaWhere("JUDICIAL") } }) : Promise.resolve(0),
    user ? prisma.case.count({ where: { officeId: user.officeId, status: "ATIVO", ...naturezaWhere("ADMINISTRATIVO") } }) : Promise.resolve(0),
    user ? getBlockedProcessNumberSet(user.id) : Promise.resolve(new Set<string>()),
  ]);
  // Bloqueio de processo é por usuário — não conta pro badge de quem bloqueou. Contagem por
  // GRUPO (mesmo processo), não por linha — ver lib/publicationGrouping.ts.
  const unreadCount = countUnreadPublicationGroups(unreadPublicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet)));
  const totalAlerts = alerts.length;
  // Os 3 mais urgentes primeiro — é o que transforma o cartão de "link repetido pro sino e pra
  // barra de baixo" em informação nova de verdade: decide se vale abrir sem precisar entrar.
  const alertsPreview = [...alerts].sort(maisUrgentesPrimeiro).slice(0, 3);

  const firstName = user?.name.split(" ")[0] ?? "";
  const modules = user ? await getOfficeModules(user.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(user?.isAdmin || user?.financeAccess);
  const saldoMes = showFinance && user ? await getMonthlyNetFlow(user.officeId) : null;
  // Blog Jurídico não é um módulo contratável — é recurso da própria plataforma, hoje só do
  // escritório dono (ver lib/officeModules.ts:hasBlogAccess). Esse atalho vai direto pro blog
  // público (/blog), pra QUALQUER usuário do escritório — revisar/editar/publicar continua só
  // em Configurações, restrito a admin (Jairo e Rodrigo).
  const blogAccess = user ? await hasBlogAccess(user.officeId) : false;

  return (
    <div className="relative">
      <GrainOverlay />
      <div className="relative z-10 p-4 space-y-4 animate-fade-in">
      {/* Halo sutil do bordô atrás da saudação — gradiente de fundo, não sombra (regra do
          produto: sombra só em coisa que flutua de verdade, DESIGN-SYSTEM.md §13). */}
      <div className="relative">
        <div
          className="absolute -top-6 -left-6 h-36 w-56 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, var(--halo-marca), transparent 70%)" }}
        />
        <div className="relative">
          <h1 className="text-xl font-bold text-tx">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-tx-2">O que você quer resolver agora?</p>
        </div>
      </div>

      <MobileGlobalSearch />

      <div className="space-y-3">
        {/* Criar (bordô) fica separado de acompanhar (grade abaixo): os dois únicos atalhos que
            lançam algo novo em vez de abrir uma lista que já existe — ver proposta Nível 3 da
            remodelação: bordô é a cor de AÇÃO em toda a Início, dourado sai dos cartões (só o
            item ativo da barra inferior continua dourado, por decisão à parte, ver
            components/mobile/MobileBottomNav.tsx). */}
        <div className={modules.atendimento ? "grid grid-cols-2 gap-3" : ""}>
          <HubCard
            title="Novo Compromisso"
            subtitle="Tarefa, prazo, audiência ou perícia"
            icon={CalendarPlus}
            tone="bordo"
            chips={[
              { href: "/m/agenda?novo=1&tipo=TAREFA", label: "Tarefa", icon: ListTodo },
              { href: "/m/agenda?novo=1&tipo=PRAZO", label: "Prazo", icon: CalendarClock },
              { href: "/m/agenda?novo=1&tipo=AUDIENCIA", label: "Audiência", icon: Gavel },
              { href: "/m/agenda?novo=1&tipo=PERICIA", label: "Perícia", icon: Stethoscope },
            ]}
          />
          {modules.atendimento && (
            <Link href="/m/atendimento/novo" className="block h-full">
              <Card className="p-4 h-full">
                <TileBadge icon={Phone} tone="bordo" />
                <p className="text-sm font-bold text-tx mt-2.5">Novo Atendimento</p>
                <p className="text-[11px] text-tx-2 mt-0.5">Abrir caso ou contato</p>
              </Card>
            </Link>
          )}
        </div>

        {/* Prévia real dos alertas mais urgentes — não é mais um link repetindo o mesmo número
            do sino e da aba de baixo: mostra o que de fato está pendente, pra decidir se vale
            abrir sem precisar entrar. Card largo (não tile) de propósito: uma lista de verdade
            não cabe direito no formato compacto dos atalhos de "Acompanhar" abaixo. */}
        <Link href="/m/alertas" className="flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-tx-2">
            <Bell size={12} strokeWidth={1.5} /> Central de Alertas
          </span>
          {totalAlerts > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-urgente">
              {totalAlerts} pendente{totalAlerts > 1 ? "s" : ""} <ChevronRight size={13} strokeWidth={1.5} />
            </span>
          )}
        </Link>
        {totalAlerts === 0 ? (
          <Link href="/m/alertas" className="block">
            <Card className="px-4 py-3.5">
              <p className="text-sm text-tx-2">Tudo em dia — nenhum alerta pendente.</p>
            </Card>
          </Link>
        ) : (
          <Card className="divide-y divide-regua overflow-hidden">
            {alertsPreview.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                className={`flex items-start justify-between gap-3 px-4 py-3 w-full text-left border-l-[3px] ${
                  a.severity === "alta" ? "border-urgente" : a.severity === "media" ? "border-marca" : "border-tx-3"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-tx truncate">{a.title}</span>
                  {a.subtitle && <span className="block text-xs text-tx-2 mt-0.5 truncate">{a.subtitle}</span>}
                </span>
                <span className="text-[11px] text-tx-3 shrink-0 whitespace-nowrap">{a.date.toLocaleDateString("pt-BR")}</span>
              </AlertRow>
            ))}
            {totalAlerts > alertsPreview.length && (
              <Link href="/m/alertas" className="block px-4 py-2.5 text-xs font-semibold text-acao hover:underline">
                Ver todos os {totalAlerts} alertas →
              </Link>
            )}
          </Card>
        )}

        {/* Acompanhar: cada atalho já mostra a contagem — decide se vale abrir sem precisar
            entrar. Publicações usa o mesmo ícone da barra de baixo de propósito. */}
        <div className="grid grid-cols-2 gap-3">
          <TileLink
            href="/m/processos"
            icon={Briefcase}
            tone="navy"
            accent="azul"
            title="Processos"
            count={activeCasesCount}
            countLabel="ativo(s)"
            // Só mostra a divisão jud./adm. quando já existe algo administrativo cadastrado —
            // enquanto o escritório não usa o recurso, o atalho fica exatamente como sempre foi
            // (sem poluir com "0 adm." pra ninguém).
            subCaption={activeAdministrativoCount > 0 ? `${activeJudicialCount} jud. · ${activeAdministrativoCount} adm.` : undefined}
          />
          <TileLink href="/m/publicacoes" icon={Newspaper} tone="navy" accent="aviso" title="Publicações" count={unreadCount} countLabel="não lida(s)" />
          <TileLink
            href="/m/relatorios"
            icon={FileBarChart}
            tone="navy"
            accent="verde"
            title="Relatórios"
            subtitle="Produtividade, processos, funil, publicações e personalizado"
          />
          {modules.assessoria && (
            <TileLink href="/m/assessoria" icon={Building2} tone="navy" accent="ouro" title="Assessoria Jurídica" count={assessoriaCount} countLabel="ativa(s)" />
          )}
          {/* Vai direto pro blog público — sem fila de revisão, sem tela de administração.
              Revisar/editar/publicar continua só em Configurações (ver Group "Blog Jurídico"). */}
          {blogAccess && (
            <TileLink href="/blog" icon={BookMarked} tone="navy" accent="verde" title="Blog Jurídico" subtitle="Conteúdo publicado no site" />
          )}
        </div>

        {showFinance && (
          <HubCard
            wide
            title="Financeiro"
            subtitle={saldoMes !== null ? `Fluxo do mês: ${formatCurrency(saldoMes)}` : undefined}
            icon={DollarSign}
            tone="navy"
            chips={[
              { href: "/m/financeiro/despesas", label: "Despesas", icon: Wallet },
              { href: "/m/financeiro/receitas", label: "Receitas", icon: Wallet },
              { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", icon: FileBarChart },
              { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: LineChart },
              { href: "/m/financeiro/dre", label: "DRE", icon: FileBarChart },
              { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", icon: BookOpen },
            ]}
          />
        )}
      </div>
      </div>
    </div>
  );
}

// Nível 3 da remodelação: bordô é a única cor de AÇÃO da Início (os 2 cartões que criam algo
// novo), navy é o neutro de "acompanhar" (todo o resto — antes eram 4 tons categorizando área,
// agora um só, a diferença fica no ícone/rótulo de cada atalho). Dourado saiu daqui de
// propósito (fica só como acento pontual, ex.: o número de Central de Alertas, ver TileLink).
type Tone = "bordo" | "navy";

const BADGE_TONE: Record<Tone, string> = {
  // bg-acao é o bordô da marca (mesmo tom de ButtonPrimary) — bg-atencao aqui era bug: aquele
  // token é o vermelho-alaranjado de perigo/ação destrutiva (--vinho), não a cor de ação normal,
  // e fazia os dois selos de "criar" (Novo Compromisso/Novo Atendimento) renderizarem vermelhos.
  // Degradê nos dois tons de bordô (--acao/--acao-hover, nenhuma cor nova) no tom de AÇÃO — é o
  // selo do que "cria algo novo"; navy (acompanhar) fica chapado de propósito, sem o mesmo realce.
  bordo: "bg-gradient-to-br from-acao to-acao-hover",
  navy: "bg-grafite-800",
};

// Selo do ícone em "squircle" (quadrado bem arredondado, raio 14px sobre 44px — não é a escala
// padrão de rounded-lg/md, é um tratamento próprio do selo de ícone, ver DESIGN-SYSTEM.md,
// sétima rodada) — mesma cor em todo tema (Manhã/Noite), só o cartão ao redor muda.
function TileBadge({ icon: Icon, tone, size = 18 }: { icon: LucideIcon; tone: Tone; size?: number }) {
  return (
    <span className={`h-11 w-11 rounded-[14px] flex items-center justify-center text-white shrink-0 ${BADGE_TONE[tone]}`}>
      <Icon size={size} strokeWidth={1.5} />
    </span>
  );
}

// Atalho de "acompanhar": ícone + título + contagem ao vivo (não é só ícone — é resposta
// antes do toque, pra decidir se vale abrir sem precisar entrar).
function TileLink({
  href,
  icon,
  tone,
  accent,
  title,
  count,
  countLabel,
  subCaption,
  countTone,
  subtitle,
}: {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  // Faixa colorida no topo do cartão (proposta C aprovada em artefato de design, setembro/2026)
  // — sem isso, cai no neutro de sempre (ver Card em components/ui.tsx).
  accent?: CardAccent;
  title: string;
  // Sem contagem ao vivo (ex.: Relatórios, que cobre várias seções sem um número único que as
  // resuma), usa `subtitle` no lugar — texto fixo em vez de dado; nunca os dois juntos.
  count?: number;
  countLabel?: string;
  // Legenda pequena opcional abaixo da contagem (ex.: "96 jud. · 27 adm.") — hoje só o atalho
  // Processos usa isso, pra abrir a divisão por natureza sem precisar entrar na lista.
  subCaption?: string;
  // Realce pontual só no NÚMERO (não no cartão inteiro) — hoje só Central de Alertas usa,
  // pra manter uma pista visual de urgência mesmo com o selo do ícone virando navy neutro
  // (ver proposta Nível 3: "navy + número em bordô").
  countTone?: "bordo";
  subtitle?: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="p-3.5 h-full" accent={accent}>
        <TileBadge icon={icon} tone={tone} size={17} />
        <p className="text-[13px] font-bold text-tx mt-2.5 leading-tight">{title}</p>
        {count !== undefined ? (
          <p className="text-xs mt-0.5">
            <span className={`font-extrabold tabular-nums ${countTone === "bordo" ? "text-urgente" : "text-tx"}`}>
              {count}
            </span>{" "}
            <span className="text-tx-2">{countLabel}</span>
          </p>
        ) : (
          subtitle && <p className="text-[11px] text-tx-2 mt-0.5 leading-snug">{subtitle}</p>
        )}
        {subCaption && <p className="text-[10px] text-tx-2 mt-0.5 tabular-nums">{subCaption}</p>}
      </Card>
    </Link>
  );
}

type Chip = { href: string; label: string; icon: LucideIcon };

// Hub suspenso (<details>/<summary>): expande mostrando chips de atalho, com uma sombra
// discreta de flutuação quando aberto (open:shadow-pop). Dois formatos: hero (vertical,
// pro atalho "Novo Compromisso", lado a lado com Novo Atendimento) e wide (horizontal,
// ocupa a linha inteira, pro atalho "Financeiro" no fim da grade).
function HubCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  chips,
  wide,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  tone: Tone;
  chips: Chip[];
  wide?: boolean;
}) {
  return (
    <details className="group border border-regua bg-sf shadow-card open:shadow-pop transition-shadow">
      {wide ? (
        <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <TileBadge icon={Icon} tone={tone} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-tx">{title}</p>
            {subtitle && <p className="text-xs text-tx-2 truncate">{subtitle}</p>}
          </div>
          <ChevronDown size={16} strokeWidth={1.5} className="text-tx-3 transition-transform group-open:rotate-180 shrink-0" />
        </summary>
      ) : (
        <summary className="flex flex-col p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between">
            <TileBadge icon={Icon} tone={tone} />
            <ChevronDown size={15} strokeWidth={1.5} className="text-tx-3 transition-transform group-open:rotate-180 mt-1.5" />
          </div>
          <p className="text-sm font-bold text-tx mt-2.5">{title}</p>
          {subtitle && <p className="text-[11px] text-tx-2 mt-0.5">{subtitle}</p>}
        </summary>
      )}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        {chips.map((chip) => (
          <HubChip key={chip.href} {...chip} />
        ))}
      </div>
    </details>
  );
}

// Contorno neutro único — a cor do cartão-pai (bordô em Novo Compromisso, navy em Financeiro)
// já basta pra dar contexto; os chips não precisam da própria cor (ver proposta Nível 3).
function HubChip({ href, label, icon: Icon }: Chip) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 border border-regua text-tx-2 px-3 py-2.5 text-xs font-semibold hover:bg-sf-apoio transition-colors"
    >
      <Icon size={15} strokeWidth={1.5} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
