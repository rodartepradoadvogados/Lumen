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
        <h1 className="font-serif text-xl font-bold text-tx">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-tx-2">O que você quer resolver agora?</p>
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
          <TileLink href="/m/alertas" icon={Bell} tone="navy" title="Central de Alertas" count={totalAlerts} countLabel="pendente(s)" countTone="bordo" />
          <TileLink href="/m/publicacoes" icon={Newspaper} tone="navy" title="Publicações" count={unreadCount} countLabel="não lida(s)" />
          {modules.assessoria && (
            <TileLink href="/m/assessoria" icon={Building2} tone="navy" title="Assessoria Jurídica" count={assessoriaCount} countLabel="ativa(s)" />
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
  );
}

// Nível 3 da remodelação: bordô é a única cor de AÇÃO da Início (os 2 cartões que criam algo
// novo), navy é o neutro de "acompanhar" (todo o resto — antes eram 4 tons categorizando área,
// agora um só, a diferença fica no ícone/rótulo de cada atalho). Dourado saiu daqui de
// propósito (fica só como acento pontual, ex.: o número de Central de Alertas, ver TileLink).
type Tone = "bordo" | "navy";

const BADGE_TONE: Record<Tone, string> = {
  bordo: "bg-atencao",
  navy: "bg-grafite-800",
};

// Selo do ícone em "squircle" (quadrado bem arredondado, não círculo) — mesma cor em todo
// tema (Manhã/Noite), só o cartão ao redor muda.
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
  countTone,
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
  // Realce pontual só no NÚMERO (não no cartão inteiro) — hoje só Central de Alertas usa,
  // pra manter uma pista visual de urgência mesmo com o selo do ícone virando navy neutro
  // (ver proposta Nível 3: "navy + número em bordô").
  countTone?: "bordo";
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="p-3.5 h-full">
        <TileBadge icon={icon} tone={tone} size={17} />
        <p className="text-[13px] font-bold text-tx mt-2.5 leading-tight">{title}</p>
        <p className="text-xs mt-0.5">
          <span className={`font-extrabold tabular-nums ${countTone === "bordo" ? "text-urgente" : "text-tx"}`}>
            {count}
          </span>{" "}
          <span className="text-tx-2">{countLabel}</span>
        </p>
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
    <details className="group rounded-xl2 border border-regua bg-sf shadow-card open:shadow-pop transition-shadow">
      {wide ? (
        <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <TileBadge icon={Icon} tone={tone} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-tx">{title}</p>
            {subtitle && <p className="text-xs text-tx-2 truncate">{subtitle}</p>}
          </div>
          <ChevronDown size={16} className="text-tx-3 transition-transform group-open:rotate-180 shrink-0" />
        </summary>
      ) : (
        <summary className="flex flex-col p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between">
            <TileBadge icon={Icon} tone={tone} />
            <ChevronDown size={15} className="text-tx-3 transition-transform group-open:rotate-180 mt-1.5" />
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
      className="flex items-center gap-2 rounded-lg border border-regua text-tx-2 px-3 py-2.5 text-xs font-semibold hover:bg-sf-apoio transition-colors"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
