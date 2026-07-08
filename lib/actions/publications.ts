"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function markPublicationRead(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function generateDeadlineFromPublication(id: string, data: { title: string; dueDate: string; priority: string }) {
  const pub = await prisma.publication.findUniqueOrThrow({ where: { id } });
  const firstColumn = await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      title: data.title,
      type: "PRAZO",
      dueDate: new Date(data.dueDate),
      priority: data.priority,
      caseId: pub.caseId,
      columnId: firstColumn?.id,
    },
  });
  await prisma.publication.update({ where: { id }, data: { deadlineGenerated: true, read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/alertas");
  revalidatePath("/");
}
