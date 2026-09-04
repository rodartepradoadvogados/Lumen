import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency } from "@/components/ui";
import MobileAgendaQuickCreate from "@/components/mobile/MobileAgendaQuickCreate";
import MobileAgendaTaskRow from "@/components/mobile/MobileAgendaTaskRow";
import { getFilteredPayables, getFilteredReceivables } from "@/lib/financeQuery";
import { valorLiquido } from "@/lib/financeCalc";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const CREATABLE_TYPES = ["TAREFA", "PRAZO", "AUDIENCIA", "PERICIA"];

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s?: string) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function normalizeTipo(t?: string): string {
  return t && CREATABLE_TYPES.includes(t) ? t : "TAREFA";
}

export default async function MobileAgenda({
  searchParams,
}: {
  searchParams: { d?: string; view?: string; novo?: string; tipo?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  // Pedido explícito: "para quem tem acesso ao financeiro, as contas a pagar e a receber
  // precisam aparecer na agenda" — mesmo gate do site (ver app/(app)/agenda/page.tsx).
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const view = searchParams.view === "week" ? "week" : "day";
  const day = parseDate(searchParams.d);

  if (view === "week") {
    return <WeekView day={day} officeId={viewer.officeId} />;
  }

  const novo = searchParams.novo === "1";
  return (
    <DayView
      day={day}
      novo={novo}
      tipo={normalizeTipo(searchParams.tipo)}
      officeId={viewer.officeId}
      hasFinanceAccess={hasFinanceAccess}
      responsibleId={viewer.id}
    />
  );
}

async function DayView({
  day,
  novo,
  tipo,
  officeId,
  hasFinanceAccess,
  responsibleId,
}: {
  day: Date;
  novo: boolean;
  tipo: string;
  officeId: string;
  hasFinanceAccess: boolean;
  responsibleId: string;
}) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const prev = new Date(start);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = start.getTime() === today.getTime();

  const dayStr = toISODate(start);
  // "todas" (sem filtro de status — ver lib/financeQuery.ts) porque a Agenda mostra VENCIMENTO,
  // não "conta em aberto": inclui já pagas e A_APURAR, do mesmo jeito que uma tarefa concluída
  // continua aparecendo no dia riscada. Mesmo raciocínio de app/(app)/agenda/page.tsx (site).
  const financeRange = { tab: "todas", from: dayStr, to: dayStr };
  const [tasks, payables, receivables] = await Promise.all([
    prisma.task.findMany({
      where: { officeId, dueDate: { gte: start, lte: end }, status: { not: "CANCELADO" } },
      include: { case: true, responsible: true, completedBy: true },
      orderBy: [{ dueTime: "asc" }, { createdAt: "asc" }],
    }),
    hasFinanceAccess ? getFilteredPayables(financeRange, officeId) : Promise.resolve([]),
    hasFinanceAccess ? getFilteredReceivables(financeRange, officeId) : Promise.resolve([]),
  ]);
  // Sem vencimento (noDueDate) não cai em nenhum dia específico — mesmo raciocínio do site.
  const financeItems = [
    ...payables.filter((p) => !p.noDueDate).map((p) => ({
      id: p.id,
      kind: "PAGAR" as const,
      description: p.description,
      amount: valorLiquido(p.amount, p.discount, p.surcharge),
      effectiveStatus: p.effectiveStatus,
      caseId: p.case?.id ?? null,
      caseTitle: p.case?.title ?? null,
    })),
    ...receivables.filter((r) => !r.noDueDate).map((r) => ({
      id: r.id,
      kind: "RECEBER" as const,
      description: r.description,
      amount: r.effectiveStatus === "A_APURAR" ? null : valorLiquido(r.amount, r.discount, r.surcharge),
      effectiveStatus: r.effectiveStatus,
      caseId: r.case?.id ?? null,
      caseTitle: r.case?.title ?? null,
    })),
  ];

  const label = start.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ViewToggle view="day" d={toISODate(start)} />

      {novo && (
        <Card className="p-3">
          <MobileAgendaQuickCreate defaultType={tipo} defaultResponsibleId={responsibleId} />
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/m/agenda?d=${toISODate(prev)}`}
          className="h-9 w-9 bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Dia anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="text-center min-w-0 flex-1">
          <p className="font-bold text-tx text-sm capitalize truncate">{label}</p>
          {!isToday && (
            <Link href="/m/agenda" className="text-[11px] font-semibold text-acao">
              Voltar para hoje
            </Link>
          )}
          {isToday && <p className="text-[11px] font-semibold text-acao">Hoje</p>}
        </div>
        <Link
          href={`/m/agenda?d=${toISODate(next)}`}
          className="h-9 w-9 bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Próximo dia"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card>
        {tasks.length === 0 && financeItems.length === 0 ? (
          <EmptyState title="Nada agendado para este dia" />
        ) : (
          <div className="divide-y divide-regua stagger-in">
            {tasks.map((t) => (
              <MobileAgendaTaskRow
                key={t.id}
                t={{
                  id: t.id,
                  type: t.type,
                  dueDate: t.dueDate.toISOString(),
                  dueTime: t.dueTime,
                  title: t.title,
                  status: t.status,
                  caseTitle: t.case ? t.case.title : null,
                  responsibleName: t.responsible ? t.responsible.name : null,
                  completedByName: t.completedBy ? t.completedBy.name : null,
                  completedAt: t.completedAt ? t.completedAt.toISOString() : null,
                }}
              />
            ))}
            {financeItems.map((f) => (
              <MobileAgendaFinanceRow key={f.id} f={f} day={dayStr} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Vencimento financeiro (Conta a Pagar/Receber) na agenda do app — mesma ideia de
// components/AgendaView.tsx:FinanceListRow (site): sem checkbox/exclusão (não é uma Task), o
// card inteiro é um link pra onde a conta pode de fato ser editada/baixada (aba Financeiro do
// processo vinculado, ou a tela central de Despesas/Receitas quando avulsa).
function MobileAgendaFinanceRow({
  f,
  day,
}: {
  f: {
    id: string;
    kind: "PAGAR" | "RECEBER";
    description: string;
    amount: number | null;
    effectiveStatus: string;
    caseId: string | null;
    caseTitle: string | null;
  };
  // Data (YYYY-MM-DD) do dia sendo visto — todo item de `financeItems` já vem filtrado por esse
  // dia (ver financeRange acima), então serve tanto pra âncora quanto pra from/to da tela central
  // de Despesas/Receitas do app, que por padrão só mostra o MÊS CORRENTE (ver
  // getCurrentMonthRange em lib/financeQuery.ts) — sem isso, um vencimento de outro mês sumia da
  // lista de destino mesmo com a âncora certa.
  day: string;
}) {
  const isPagar = f.kind === "PAGAR";
  const isApurar = f.effectiveStatus === "A_APURAR";
  const statusColor = f.effectiveStatus === "PAGO" ? "green" : f.effectiveStatus === "ATRASADO" ? "red" : isApurar ? "slate" : "amber";
  // Âncora até a linha exata (ver comentário equivalente em components/AgendaView.tsx:FinanceListRow)
  // — bug relatado: clicar no card da Agenda levava pra lista inteira, não pro lançamento
  // específico. Rota do site (/processos/[id], sem /m — não existe versão mobile da aba
  // Financeiro do Processo fora de /m/processos/[id]) corrigida para /m/processos/[id] aqui,
  // que também tinha esse mesmo bug (ia pro site em vez do app).
  const anchor = isPagar ? `payable-${f.id}` : `receivable-${f.id}`;
  const href = f.caseId
    ? `/m/processos/${f.caseId}?tab=financeiro#${anchor}`
    : `/m/financeiro/${isPagar ? "despesas" : "receitas"}?tab=todas&from=${day}&to=${day}#${anchor}`;
  return (
    <Link href={href} className={`flex items-start gap-3 px-4 py-3.5 border-l-[3px] ${isPagar ? "border-l-atencao" : "border-l-concluido"}`}>
      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${isPagar ? "bg-atencao" : "bg-concluido"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[11px] font-semibold ${isPagar ? "text-atencao" : "text-concluido"}`}>{isPagar ? "Conta a Pagar" : "Conta a Receber"}</span>
          <Badge color={statusColor}>{isApurar ? "A apurar" : f.effectiveStatus}</Badge>
        </div>
        <p className="text-sm font-medium text-tx">{f.description}</p>
        {f.caseTitle && <p className="text-xs text-acao mt-0.5 truncate">{f.caseTitle}</p>}
      </div>
      <p className="text-sm font-semibold text-tx tabular-nums shrink-0">{f.amount === null ? "—" : formatCurrency(f.amount)}</p>
    </Link>
  );
}

async function WeekView({ day, officeId }: { day: Date; officeId: string }) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  // Domingo como início da semana (padrão pt-BR usado no restante do app).
  start.setDate(start.getDate() - start.getDay());

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push(d);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);

  const prevWeek = new Date(start);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(start);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Uma única query para a semana toda, agrupando por tarefa e contando por dia no código
  // (SQLite/Prisma não agrupa direto por "dia" de um DateTime, então trazemos só dueDate + status
  // já filtrado pelo intervalo e contamos em memória, evitando 7 queries separadas).
  const tasks = await prisma.task.findMany({
    where: { officeId, dueDate: { gte: start, lte: end }, status: { not: "CANCELADO" } },
    select: { dueDate: true },
  });

  const countsByDay = new Map<string, number>();
  for (const t of tasks) {
    const key = toISODate(t.dueDate);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const monthLabel = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ViewToggle view="week" d={toISODate(day)} />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/m/agenda?view=week&d=${toISODate(prevWeek)}`}
          className="h-9 w-9 bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <p className="font-bold text-tx text-sm capitalize text-center flex-1 truncate">
          {monthLabel}
        </p>
        <Link
          href={`/m/agenda?view=week&d=${toISODate(nextWeek)}`}
          className="h-9 w-9 bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((wd, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-tx-2">
              {wd}
            </div>
          ))}
          {weekDays.map((d) => {
            const key = toISODate(d);
            const isToday = d.getTime() === today.getTime();
            const count = countsByDay.get(key) ?? 0;
            return (
              <Link
                key={key}
                href={`/m/agenda?view=day&d=${key}`}
                className={`aspect-square border flex flex-col items-center justify-center gap-0.5 ${
                  isToday ? "bg-acao border-acao" : "bg-sf-apoio border-regua"
                }`}
              >
                <span className={`text-sm font-semibold ${isToday ? "text-acao-tx" : "text-tx"}`}>
                  {d.getDate()}
                </span>
                {count > 0 && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isToday ? "bg-acao-tx" : "bg-acao"}`}
                    aria-label={`${count} tarefa(s)`}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </Card>

      <p className="text-center text-xs text-tx-2">Toque em um dia para ver as atividades.</p>
    </div>
  );
}

function ViewToggle({ view, d }: { view: "day" | "week"; d: string }) {
  // Controle segmentado de dois estados — mesmo padrão de inversão do menu de tema/modo de
  // visualização (DESIGN-SYSTEM.md §5): opção ativa inverte fundo/texto, sem cor de acento.
  return (
    <div className="flex gap-1 bg-sf-apoio border border-regua p-1">
      <Link
        href={`/m/agenda?view=day&d=${d}`}
        className={`flex-1 text-center text-xs font-semibold py-1.5 transition-colors ${
          view === "day" ? "bg-tx text-sf" : "text-tx-2"
        }`}
      >
        Dia
      </Link>
      <Link
        href={`/m/agenda?view=week&d=${d}`}
        className={`flex-1 text-center text-xs font-semibold py-1.5 transition-colors ${
          view === "week" ? "bg-tx text-sf" : "text-tx-2"
        }`}
      >
        Semana
      </Link>
    </div>
  );
}
