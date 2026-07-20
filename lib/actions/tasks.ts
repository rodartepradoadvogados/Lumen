"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function moveTask(taskId: string, columnId: string, columnOrder: number) {
  await prisma.task.update({
    where: { id: taskId },
    data: { columnId, columnOrder },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function toggleTaskDone(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const isDone = task.status === "CONCLUIDO";
  const doneColumn = await prisma.kanbanColumn.findFirst({ where: { isDoneCol: true } });
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: isDone ? "PENDENTE" : "CONCLUIDO",
      completedAt: isDone ? null : new Date(),
      columnId: !isDone && doneColumn ? doneColumn.id : task.columnId,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/alertas");
}

export async function createTask(data: {
  title: string;
  type: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  caseId?: string;
  attendanceId?: string;
  responsibleId?: string;
  columnId?: string;
  description?: string;
  meetingType?: string;
  location?: string;
  meetingUrl?: string;
  points?: number;
}) {
  const firstColumn = data.columnId ? null : await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });

  // TaskScore: usa o override manual se informado; senão, o padrão do tipo (fallback 10).
  let points = data.points;
  if (points == null || Number.isNaN(points)) {
    const typePoints = await prisma.taskTypePoints.findUnique({ where: { type: data.type } });
    points = typePoints?.points ?? 10;
  }

  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      responsibleId: data.responsibleId || null,
      columnId: data.columnId || firstColumn?.id || null,
      description: data.description || null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: data.meetingUrl || null,
      points,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/m/agenda");
  if (data.attendanceId) revalidatePath(`/atendimento/${data.attendanceId}`);
  if (data.caseId) revalidatePath(`/m/processos/${data.caseId}`);
}

export type TaskDetail = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  status: string;
  meetingType: string | null;
  location: string | null;
  meetingUrl: string | null;
  responsibleId: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
};

// Usado pelo card de compromisso (aberto a partir de um alerta ou da lista de prazos
// atrasados do painel): traz a tarefa completa + a lista de responsáveis possíveis,
// já serializada (sem Date) para poder ser chamado direto de um client component.
export async function getTaskDetail(id: string): Promise<{ task: TaskDetail | null; users: { id: string; name: string }[] }> {
  const [task, users] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: { case: { select: { id: true, title: true, processNumber: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!task) return { task: null, users };
  return {
    task: {
      id: task.id,
      title: task.title,
      type: task.type,
      description: task.description,
      dueDate: task.dueDate.toISOString(),
      dueTime: task.dueTime,
      priority: task.priority,
      status: task.status,
      meetingType: task.meetingType,
      location: task.location,
      meetingUrl: task.meetingUrl,
      responsibleId: task.responsibleId,
      case: task.case,
    },
    users,
  };
}

export async function updateTask(id: string, data: {
  title: string;
  type: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  responsibleId?: string;
  description?: string;
  meetingType?: string;
  location?: string;
  meetingUrl?: string;
}) {
  await prisma.task.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: data.meetingUrl || null,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/");
  revalidatePath("/alertas");
}

export async function addComment(data: { content: string; authorId: string; taskId?: string; caseId?: string }) {
  const mentionNames = Array.from(data.content.matchAll(/@([\p{L}\s]+?)(?=(@|$|\n))/gu)).map((m) => m[1].trim());
  const comment = await prisma.comment.create({
    data: {
      content: data.content,
      authorId: data.authorId,
      taskId: data.taskId || null,
      caseId: data.caseId || null,
    },
  });

  if (mentionNames.length > 0) {
    const users = await prisma.user.findMany();
    for (const name of mentionNames) {
      const user = users.find((u) => name.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(name.toLowerCase()));
      if (user) {
        await prisma.mention.create({ data: { commentId: comment.id, userId: user.id } });
      }
    }
  }

  if (data.taskId) revalidatePath(`/kanban`);
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  revalidatePath("/alertas");
}
