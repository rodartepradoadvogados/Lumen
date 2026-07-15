"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function markPublicationRead(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function markPublicationUnread(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: false } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function markAllPublicationsRead() {
  const result = await prisma.publication.updateMany({ where: { read: false }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
  return { count: result.count };
}

// ===== RIDT — fila de triagem de publicações com atribuição de responsável =====

export async function assignPublication(id: string, userId: string | null) {
  await prisma.publication.update({ where: { id }, data: { assignedToId: userId || null } });
  revalidatePath("/publicacoes");
}

export async function setPublicationTriageStatus(id: string, status: string) {
  await prisma.publication.update({ where: { id }, data: { triageStatus: status } });
  revalidatePath("/publicacoes");
}

export async function generateTaskFromPublication(
  id: string,
  data: { title: string; type: string; dueDate: string; dueTime?: string; priority: string }
) {
  const pub = await prisma.publication.findUniqueOrThrow({ where: { id } });
  const firstColumn = await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      caseId: pub.caseId,
      publicationId: pub.id,
      columnId: firstColumn?.id,
    },
  });
  await prisma.publication.update({ where: { id }, data: { deadlineGenerated: true, read: true, triageStatus: "TRATADA" } });
  revalidatePath("/publicacoes");
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/alertas");
  revalidatePath("/");
  if (pub.caseId) revalidatePath(`/processos/${pub.caseId}`);
}
