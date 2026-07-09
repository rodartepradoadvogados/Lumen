"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendDailyAgendaEmail } from "@/lib/email";

export async function testDailyAgendaEmail(): Promise<{ sent: boolean; reason?: string }> {
  return sendDailyAgendaEmail();
}

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

export async function deleteKanbanColumn(id: string): Promise<{ error?: string }> {
  const taskCount = await prisma.task.count({ where: { columnId: id } });
  if (taskCount > 0) {
    return { error: `Não é possível excluir: há ${taskCount} tarefa(s) nessa coluna. Mova-as antes de excluir.` };
  }
  await prisma.kanbanColumn.delete({ where: { id } });
  revalidatePath("/configuracoes");
  revalidatePath("/kanban");
  return {};
}

export async function createFinancialCategory(data: { name: string; kind: string; parentId?: string }) {
  let code: string;
  if (data.parentId) {
    const parent = await prisma.financialCategory.findUniqueOrThrow({ where: { id: data.parentId } });
    const siblingCount = await prisma.financialCategory.count({ where: { parentId: data.parentId } });
    code = `${parent.code}.${siblingCount + 1}`;
  } else {
    const topCount = await prisma.financialCategory.count({ where: { parentId: null } });
    code = `${topCount + 1}`;
  }
  await prisma.financialCategory.create({
    data: { name: data.name, kind: data.kind, code, parentId: data.parentId || null },
  });
  revalidatePath("/configuracoes");
}

export async function deleteFinancialCategory(id: string): Promise<{ error?: string }> {
  const childCount = await prisma.financialCategory.count({ where: { parentId: id } });
  if (childCount > 0) {
    return { error: `Não é possível excluir: essa categoria tem ${childCount} subcategoria(s). Exclua-as primeiro.` };
  }
  const [payableCount, receivableCount] = await Promise.all([
    prisma.payable.count({ where: { categoryId: id } }),
    prisma.receivable.count({ where: { categoryId: id } }),
  ]);
  if (payableCount + receivableCount > 0) {
    return { error: `Não é possível excluir: há ${payableCount + receivableCount} lançamento(s) usando essa categoria.` };
  }
  await prisma.financialCategory.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}

export async function createCostCenter(data: { name: string; notes?: string }) {
  await prisma.costCenter.create({ data: { name: data.name, notes: data.notes || null } });
  revalidatePath("/configuracoes");
}

export async function deleteCostCenter(id: string): Promise<{ error?: string }> {
  const [payableCount, receivableCount] = await Promise.all([
    prisma.payable.count({ where: { costCenterId: id } }),
    prisma.receivable.count({ where: { costCenterId: id } }),
  ]);
  if (payableCount + receivableCount > 0) {
    return { error: `Não é possível excluir: há ${payableCount + receivableCount} lançamento(s) usando esse centro de custo.` };
  }
  await prisma.costCenter.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}
