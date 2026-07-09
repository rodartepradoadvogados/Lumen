import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AgendaView from "@/components/AgendaView";
import NewTaskModal from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();

  const rangeStart = new Date(year, month - 1, 20);
  const rangeEnd = new Date(year, month + 2, 10);

  const [tasks, cases, users, columns] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: rangeStart, lte: rangeEnd } },
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
      <AgendaView year={year} month={month} tasks={serialized} />
    </div>
  );
}
