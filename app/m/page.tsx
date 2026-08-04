import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getOfficeModules } from "@/lib/officeModules";
import { getAlertsCount } from "@/lib/alerts";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { countUnreadPublicationGroups } from "@/lib/publicationGrouping";
import { naturezaWhere } from "@/lib/caseNatureza";
import { Card, formatCurrency } from "@/components/ui";
import MobileGlobalSearch from "@/components/mobile/MobileGlobalSearch";
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
  ChevronDown,
  Building2,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Saldo do mês corrente (por vencimento, excluindo cancelados) — mesma metodologia da
// página de Fluxo de Caixa (ver app/m/financeiro/fluxo-de-caixa/page.tsx), só que restrita
// ao mês atual: alimenta o número do atalho "Financeiro" na Início, pra ele responder antes
// do toque igual aos outros atalhos (contagem de processos, alertas, publicações).
async function getMonthlyNetFlow(officeId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const [receitas, despesas] = await Promise.all([
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { officeId, status: { not: "CANCELADO" }, dueDate: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.payable.aggregate({
      _sum: { amount: true },
      where: { officeId, status: { not: "CANCELADO" }, dueDate: { gte: monthStart, lte: monthEnd } },
    }),
  ]);
  return (receitas._sum.amount ?? 0) - (despesas._sum.amount ?? 0);
}

export default async function MobileHome() {
  const user = await getCurrentUser();
  const [unreadPublicationsRaw, totalAlerts, assessoriaCount, activeCasesCount, activeJudicialCount, activeAdministrativoCount, blockedSet] = await Promise.all([
    user
      ? prisma.publication.findMany({ where: { officeId: user.officeId, reads: { none: { userId: user.id } } }, select: { id: true, processNumberRaw: true, publishedAt: true } })
      : Promise.resolve([]),
    // Total de alertas (menções, prazos vencidos, tarefas delegadas, contas vencidas — ver
    // lib/alerts.ts) — alimenta o atalho "Central de Alertas" abaixo.
    user ? getAlertsCount(user.officeId, Boolean(user.isAdmin || user.financeAccess), user.id, user.isAdmin) : Promise.resolve(0),
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

  const firstName = user?.name.split(" ")[0] ?? "";
  const modules = user ? await getOfficeModules(user.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(user?.isAdmin || user?.financeAccess);
  const saldoMes = showFinance && user ? await getMonthlyNetFlow(user.officeId) : null;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">O que você quer resolver agora?</p>
      </div>

      <MobileGlobalSearch />

      <div className="space-y-3">
        {/* Criar (dourado/bordô) fica separado de acompanhar (grade abaixo): os dois únicos
            atalhos que lançam algo novo em vez de abrir uma lista que já existe. */}
        <div className={modules.atendimento ? "grid grid-cols-2 gap-3" : ""}>
          <HubCard
            title="Novo Compromisso"
            subtitle="Tarefa, prazo, audiência ou perícia"
            icon={CalendarPlus}
            tone="gold"
            chips={[
              { href: "/m/agenda?novo=1&tipo=TAREFA", label: "Tarefa", icon: ListTodo, tone: "gold" },
              { href: "/m/agenda?novo=1&tipo=PRAZO", label: "Prazo", icon: CalendarClock, tone: "bordo" },
              { href: "/m/agenda?novo=1&tipo=AUDIENCIA", label: "Audiência", icon: Gavel, tone: "bordo" },
              { href: "/m/agenda?novo=1&tipo=PERICIA", label: "Perícia", icon: Stethoscope, tone: "gold" },
            ]}
          />
          {modules.atendimento && (
            <Link href="/m/atendimento/novo" className="block h-full">
              <Card className="p-4 h-full">
                <TileBadge icon={Phone} tone="bordo" />
                <p className="text-sm font-bold text-navy-900 dark:text-cream-50 mt-2.5">Novo Atendimento</p>
                <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-0.5">Abrir caso ou contato</p>
              </Card>
            </Link>
          )}
        </div>

        {/* Acompanhar: cada atalho já mostra a contagem — decide se vale abrir sem precisar
            entrar. Alertas e Publicações usam o mesmo ícone da barra de baixo de propósito. */}
        <div className="grid grid-cols-2 gap-3">
          <TileLink
            href="/m/processos"
            icon={Briefcase}
            tone="navy"
            title="Processos"
            count={activeCasesCount}
            countLabel="ativo(s)"
            // Só mostra a divisão jud./adm. quando já existe algo administrativo cadastrado —
            // enquanto o escritório não usa o recurso, o atalho fica exatamente como sempre foi
            // (sem poluir com "0 adm." pra ninguém).
            subCaption={activeAdministrativoCount > 0 ? `${activeJudicialCount} jud. · ${activeAdministrativoCount} adm.` : undefined}
          />
          <TileLink href="/m/alertas" icon={Bell} tone="bordo" title="Central de Alertas" count={totalAlerts} countLabel="pendente(s)" />
          <TileLink href="/m/publicacoes" icon={Newspaper} tone="navy" title="Publicações" count={unreadCount} countLabel="não lida(s)" />
          {modules.assessoria && (
            <TileLink href="/m/assessoria" icon={Building2} tone="magenta" title="Assessoria Jurídica" count={assessoriaCount} countLabel="ativa(s)" />
          )}
        </div>

        {showFinance && (
          <HubCard
            wide
            title="Financeiro"
            subtitle={saldoMes !== null ? `Fluxo do mês: ${formatCurrency(saldoMes)}` : undefined}
            icon={DollarSign}
            tone="gold"
            chips={[
              { href: "/m/financeiro/despesas", label: "Despesas", icon: Wallet, tone: "bordo" },
              { href: "/m/financeiro/receitas", label: "Receitas", icon: Wallet, tone: "gold" },
              { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", icon: FileBarChart, tone: "gold" },
              { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: LineChart, tone: "gold" },
              { href: "/m/financeiro/dre", label: "DRE", icon: FileBarChart, tone: "gold" },
              { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", icon: BookOpen, tone: "gold" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

type Tone = "gold" | "bordo" | "navy" | "magenta";
type ChipTone = "gold" | "bordo";

const BADGE_TONE: Record<Tone, string> = {
  gold: "bg-gradient-to-br from-gold-400 to-gold-600",
  bordo: "bg-gradient-to-br from-bordo-500 to-bordo-700",
  navy: "bg-gradient-to-br from-navy-600 to-navy-900",
  magenta: "bg-gradient-to-br from-magenta-600 to-magenta-700",
};

// Selo do ícone em "squircle" (quadrado bem arredondado, não círculo) com gradiente na cor
// do próprio atalho — mesma cor em todo tema (Dia/Tarde/Noite), só o cartão ao redor muda.
function TileBadge({ icon: Icon, tone, size = 18 }: { icon: LucideIcon; tone: Tone; size?: number }) {
  return (
    <span className={`h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 ${BADGE_TONE[tone]}`}>
      <Icon size={size} />
    </span>
  );
}

// Atalho de "acompanhar": ícone + título + contagem ao vivo (não é só ícone — é resposta
// antes do toque, pra decidir se vale abrir sem precisar entrar).
function TileLink({
  href,
  icon,
  tone,
  title,
  count,
  countLabel,
  subCaption,
}: {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  count: number;
  countLabel: string;
  // Legenda pequena opcional abaixo da contagem (ex.: "96 jud. · 27 adm.") — hoje só o atalho
  // Processos usa isso, pra abrir a divisão por natureza sem precisar entrar na lista.
  subCaption?: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="p-3.5 h-full">
        <TileBadge icon={icon} tone={tone} size={17} />
        <p className="text-[13px] font-bold text-navy-900 dark:text-cream-50 mt-2.5 leading-tight">{title}</p>
        <p className="text-xs mt-0.5">
          <span className="font-extrabold text-navy-900 dark:text-cream-50 tabular-nums">{count}</span>{" "}
          <span className="text-navy-800/50 dark:text-cream-50/50">{countLabel}</span>
        </p>
        {subCaption && <p className="text-[10px] text-navy-800/40 dark:text-cream-50/40 mt-0.5 tabular-nums">{subCaption}</p>}
      </Card>
    </Link>
  );
}

type Chip = { href: string; label: string; icon: LucideIcon; tone: ChipTone };

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
    <details className="group rounded-xl2 border border-navy-800/8 dark:border-white/10 bg-white dark:bg-navy-900 shadow-card open:shadow-pop transition-shadow">
      {wide ? (
        <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <TileBadge icon={Icon} tone={tone} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy-900 dark:text-cream-50">{title}</p>
            {subtitle && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 truncate">{subtitle}</p>}
          </div>
          <ChevronDown size={16} className="text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-180 shrink-0" />
        </summary>
      ) : (
        <summary className="flex flex-col p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between">
            <TileBadge icon={Icon} tone={tone} />
            <ChevronDown size={15} className="text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-180 mt-1.5" />
          </div>
          <p className="text-sm font-bold text-navy-900 dark:text-cream-50 mt-2.5">{title}</p>
          {subtitle && <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-0.5">{subtitle}</p>}
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

function HubChip({ href, label, icon: Icon, tone }: Chip) {
  const toneClasses =
    tone === "bordo"
      ? "bg-bordo-500/10 text-bordo-700 border-bordo-500/20 dark:bg-bordo-400/10 dark:text-bordo-400 dark:border-bordo-400/25"
      : "bg-gold-500/10 text-gold-800 border-gold-500/25 dark:bg-gold-400/10 dark:text-gold-400 dark:border-gold-400/25";

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${toneClasses}`}
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
