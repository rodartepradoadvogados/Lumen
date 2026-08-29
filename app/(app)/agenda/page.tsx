import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui";
import AgendaView from "@/components/AgendaView";
import NewTaskModal from "@/components/NewTaskModal";
import { getFilteredPayables, getFilteredReceivables } from "@/lib/financeQuery";
import { valorLiquido } from "@/lib/financeCalc";

export const dynamic = "force-dynamic";

function startOfWeek(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; visao?: string; week?: string; responsibleId?: string; tipo?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // Pedido explícito: "para quem tem acesso ao financeiro, as contas a pagar e a receber
  // precisam aparecer na agenda" — mesmo gate usado em todo o resto do produto (financeiro
  // central, app mobile) para decidir quem enxerga dado financeiro.
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const now = new Date();
  const visao = searchParams.visao === "semana" || searchParams.visao === "lista" ? searchParams.visao : "mes";
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();

  const weekRef = searchParams.week ? new Date(`${searchParams.week}T00:00:00`) : now;
  const weekStart = startOfWeek(weekRef);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let rangeStart: Date;
  let rangeEnd: Date;
  if (visao === "semana") {
    rangeStart = weekStart;
    rangeEnd = weekEnd;
  } else if (visao === "lista") {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 31);
  } else {
    rangeStart = new Date(year, month - 1, 20);
    rangeEnd = new Date(year, month + 2, 10);
  }

  const where: Prisma.TaskWhereInput = {
    officeId: viewer.officeId,
    // OR com safetyDueDate: o prazo de segurança (24h antes do prazo fatal) pode cair um dia
    // antes do início do período visível (ex.: prazo fatal logo no primeiro dia do mês) — sem
    // isso, esse aviso ficaria de fora da consulta mesmo devendo aparecer na Agenda.
    OR: [{ dueDate: { gte: rangeStart, lte: rangeEnd } }, { safetyDueDate: { gte: rangeStart, lte: rangeEnd } }],
    responsibleId: searchParams.responsibleId || undefined,
    type: searchParams.tipo || undefined,
  };

  // "todas" (sem filtro de status, ver lib/financeQuery.ts) porque a Agenda mostra VENCIMENTO,
  // não "conta em aberto" — inclui já pagas (aparecem riscadas/com status PAGO no card) e A_APURAR,
  // do mesmo jeito que um prazo/tarefa concluído continua aparecendo no dia riscado.
  const financeRange = { tab: "todas", from: ymd(rangeStart), to: ymd(rangeEnd) };
  const [tasks, cases, users, columns, payables, receivables] = await Promise.all([
    prisma.task.findMany({
      where,
      include: { case: true, responsible: true, completedBy: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.case.findMany({ where: { status: "ATIVO", officeId: viewer.officeId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    hasFinanceAccess ? getFilteredPayables(financeRange, viewer.officeId) : Promise.resolve([]),
    hasFinanceAccess ? getFilteredReceivables(financeRange, viewer.officeId) : Promise.resolve([]),
  ]);

  const serializedFinance = [
    ...payables.map((p) => ({
      id: p.id,
      kind: "PAGAR" as const,
      description: p.description,
      amount: valorLiquido(p.amount, p.discount, p.surcharge),
      effectiveStatus: p.effectiveStatus,
      dueDate: p.dueDate.toISOString(),
      noDueDate: p.noDueDate,
      case: p.case ? { id: p.case.id, title: p.case.title } : null,
    })),
    ...receivables.map((r) => ({
      id: r.id,
      kind: "RECEBER" as const,
      description: r.description,
      amount: r.effectiveStatus === "A_APURAR" ? null : valorLiquido(r.amount, r.discount, r.surcharge),
      effectiveStatus: r.effectiveStatus,
      dueDate: r.dueDate.toISOString(),
      noDueDate: r.noDueDate,
      case: r.case ? { id: r.case.id, title: r.case.title } : null,
    })),
  ];

  const serialized = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate.toISOString(),
    dueTime: t.dueTime,
    safetyDueDate: t.safetyDueDate ? t.safetyDueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    completedBy: t.completedBy ? { id: t.completedBy.id, name: t.completedBy.name } : null,
    case: t.case ? { id: t.case.id, title: t.case.title } : null,
    responsible: t.responsible ? { id: t.responsible.id, name: t.responsible.name, color: t.responsible.color } : null,
    meetingType: t.meetingType,
    location: t.location,
    meetingUrl: t.meetingUrl,
  }));

  return (
    <div className="p-6 h-full flex flex-col max-w-[1600px] mx-auto animate-fade-in">
      <PageHeader
        title="Agenda"
        subtitle="Integrada ao Kanban — dar baixa aqui reflete automaticamente lá"
        action={<NewTaskModal cases={cases.map((c) => ({ id: c.id, name: c.title }))} users={users} columns={columns} tone="accent" />}
      />
      <AgendaView
        visao={visao}
        year={year}
        month={month}
        weekStart={weekStart.toISOString()}
        tasks={serialized}
        financeItems={serializedFinance}
        hasFinanceAccess={hasFinanceAccess}
        users={users}
        responsibleId={searchParams.responsibleId || ""}
        tipo={searchParams.tipo || ""}
        cases={cases.map((c) => ({ id: c.id, name: c.title }))}
        columns={columns}
      />
    </div>
  );
}
