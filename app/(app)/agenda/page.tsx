import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AgendaView from "@/components/AgendaView";
import NewTaskModal from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

function startOfWeek(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; visao?: string; week?: string; responsibleId?: string; tipo?: string };
}) {
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
    // OR com safetyDueDate: o prazo de segurança (24h antes do prazo fatal) pode cair um dia
    // antes do início do período visível (ex.: prazo fatal logo no primeiro dia do mês) — sem
    // isso, esse aviso ficaria de fora da consulta mesmo devendo aparecer na Agenda.
    OR: [{ dueDate: { gte: rangeStart, lte: rangeEnd } }, { safetyDueDate: { gte: rangeStart, lte: rangeEnd } }],
    responsibleId: searchParams.responsibleId || undefined,
    type: searchParams.tipo || undefined,
  };

  const [tasks, cases, users, columns] = await Promise.all([
    prisma.task.findMany({
      where,
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const serialized = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate.toISOString(),
    dueTime: t.dueTime,
    safetyDueDate: t.safetyDueDate ? t.safetyDueDate.toISOString() : null,
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
        action={<NewTaskModal cases={cases.map((c) => ({ id: c.id, name: c.title }))} users={users} columns={columns} />}
      />
      <AgendaView
        visao={visao}
        year={year}
        month={month}
        weekStart={weekStart.toISOString()}
        tasks={serialized}
        users={users}
        responsibleId={searchParams.responsibleId || ""}
        tipo={searchParams.tipo || ""}
        cases={cases.map((c) => ({ id: c.id, name: c.title }))}
        columns={columns}
      />
    </div>
  );
}
