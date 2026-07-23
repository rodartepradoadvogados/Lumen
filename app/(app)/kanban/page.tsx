import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui";
import KanbanBoard, { ColumnData } from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const [columns, cases, users] = await Promise.all([
    prisma.kanbanColumn.findMany({
      where: { officeId: viewer.officeId },
      orderBy: { order: "asc" },
      include: {
        tasks: {
          where: { status: { not: "CANCELADO" }, officeId: viewer.officeId },
          orderBy: { columnOrder: "asc" },
          include: { case: true, responsible: true, _count: { select: { comments: true } } },
        },
      },
    }),
    prisma.case.findMany({ where: { status: "ATIVO", officeId: viewer.officeId }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const columnsForModal = columns.map((c) => ({ id: c.id, name: c.name }));
  const casesForModal = cases.map((c) => ({ id: c.id, name: c.title }));

  const serialized: ColumnData[] = columns.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    isDoneCol: c.isDoneCol,
    tasks: c.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate.toISOString(),
      dueTime: t.dueTime,
      columnId: t.columnId,
      case: t.case ? { id: t.case.id, title: t.case.title } : null,
      responsible: t.responsible ? { id: t.responsible.id, name: t.responsible.name, color: t.responsible.color } : null,
      _count: t._count,
    })),
  }));

  return (
    <div className="p-6 h-full flex flex-col max-w-[1600px] mx-auto animate-fade-in">
      <PageHeader
        title="Kanban de Gestão da Agenda"
        subtitle="Cada card representa uma tarefa, evento, audiência, perícia ou prazo — arraste entre colunas para atualizar o status"
        action={<NewTaskModal cases={casesForModal} users={users} columns={columnsForModal} />}
      />
      <div className="flex-1 min-h-0">
        <KanbanBoard columns={serialized} />
      </div>
    </div>
  );
}
