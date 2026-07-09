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
}) {
  const firstColumn = data.columnId ? null : await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });
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
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/");
  if (data.attendanceId) revalidatePath(`/atendimento/${data.attendanceId}`);
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
