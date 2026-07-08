import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import KanbanBoard from "@/components/KanbanBoard";
import NewTaskModal from "@/components/NewTaskModal";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const [columns, cases, users] = await Promise.all([
    prisma.kanbanColumn.findMany({
      orderBy: { order: "asc" },
      include: {
        tasks: {
          where: { status: { not: "CANCELADO" } },
          orderBy: { columnOrder: "asc" },
          include: { case: true, responsible: true, _count: { select: { comments: true } } },
        },
      },
    }),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  const columnsForModal = columns.map((c) => ({ id: c.id, name: c.name }));
  const casesForModal = cases.map((c) => ({ id: c.id, name: c.title }));

  const serialized = columns.map((c) => ({
    ...c,
    tasks: c.tasks.map((t) => ({ ...t, dueDate: t.dueDate.toISOString() })),
  }));

  return (
    <div className="p-6 h-full flex flex-col max-w-[1600px] mx-auto animate-fade-in">
      <PageHeader
        title="Kanban de Gestão da Agenda"
        subtitle="Cada card representa uma tarefa, evento, audiência, perícia ou prazo — arraste entre colunas para atualizar o status"
        action={<NewTaskModal cases={casesForModal} users={users} columns={columnsForModal} />}
      />
      <div className="flex-1 min-h-0">
        <KanbanBoard columns={serialized as any} />
      </div>
    </div>
  );
}
