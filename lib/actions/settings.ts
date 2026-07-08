"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createUser(data: { name: string; email: string; role: string; oab?: string; color: string }) {
  await prisma.user.create({
    data: { name: data.name, email: data.email, role: data.role, oab: data.oab || null, color: data.color },
  });
  revalidatePath("/configuracoes");
}

export async function createKanbanColumn(data: { name: string; color: string }) {
  const count = await prisma.kanbanColumn.count();
  await prisma.kanbanColumn.create({ data: { name: data.name, color: data.color, order: count } });
  revalidatePath("/configuracoes");
  revalidatePath("/kanban");
}

export async function createFinancialCategory(data: { name: string; kind: string }) {
  await prisma.financialCategory.create({ data: { name: data.name, kind: data.kind } });
  revalidatePath("/configuracoes");
}
