"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendDailyAgendaEmail } from "@/lib/email";
import { syncJusbrasilEmails, type SyncResult } from "@/lib/jusbrasilEmailSync";
import { testDjenConnection, type DjenTestResult } from "@/lib/djenSync";
import { getCurrentUser } from "@/lib/currentUser";

export async function testDailyAgendaEmail(): Promise<{ sent: boolean; reason?: string }> {
  return sendDailyAgendaEmail();
}

export async function runJusbrasilSync(): Promise<SyncResult> {
  const result = await syncJusbrasilEmails();
  revalidatePath("/publicacoes");
  revalidatePath("/configuracoes");
  return result;
}

export async function runDjenConnectionTest(): Promise<{ error?: string; results?: DjenTestResult[] }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) {
    return { error: "Apenas Jairo ou Rodrigo podem testar essa integração." };
  }
  const results = await testDjenConnection();
  return { results };
}

export async function createUser(data: { name: string; email: string; role: string; oab?: string; color: string }) {
  await prisma.user.create({
    data: { name: data.name, email: data.email, role: data.role, oab: data.oab || null, color: data.color },
  });
  revalidatePath("/configuracoes");
}

export async function updateUser(
  id: string,
  data: { name: string; email: string; role: string; oab?: string; color: string; phone?: string }
): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." };
  await prisma.user.update({
    where: { id },
    data: { name: data.name, email: data.email, role: data.role, oab: data.oab || null, color: data.color, phone: data.phone || null },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function setFinanceAccess(id: string, financeAccess: boolean): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem alterar o acesso ao Financeiro." };
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) return { error: "Sócios sempre têm acesso ao Financeiro." };
  await prisma.user.update({ where: { id }, data: { financeAccess } });
  revalidatePath("/configuracoes");
  revalidatePath("/");
  revalidatePath("/alertas");
  return {};
}

export async function setUserCredentials(id: string, username: string, password: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem definir credenciais de acesso." };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." };

  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername.length < 4) return { error: "O usuário deve ter ao menos 4 caracteres." };
  if (/\s/.test(normalizedUsername)) return { error: "O usuário não pode conter espaços." };
  if (password.length < 6) return { error: "A senha deve ter ao menos 6 caracteres." };

  const existing = await prisma.user.findFirst({
    where: { username: { equals: normalizedUsername, mode: "insensitive" }, id: { not: id } },
  });
  if (existing) return { error: "Já existe outro membro com esse usuário." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { username: normalizedUsername, passwordHash } });
  revalidatePath("/configuracoes");
  return {};
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (newPassword.length < 6) return { error: "A nova senha deve ter ao menos 6 caracteres." };
  if (!user.passwordHash) return { error: "Este usuário ainda não tem senha configurada. Fale com Jairo ou Rodrigo." };
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Senha atual incorreta." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return {};
}

export async function toggleUserActive(id: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) return { error: "Não é possível inativar um administrador (Jairo/Rodrigo)." };
  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteUser(id: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) {
    return { error: "Não é possível excluir um administrador (Jairo/Rodrigo) por aqui." };
  }

  const [commentCount, mentionCount, deletionReqCount] = await Promise.all([
    prisma.comment.count({ where: { authorId: id } }),
    prisma.mention.count({ where: { userId: id } }),
    prisma.deletionRequest.count({ where: { requestedById: id } }),
  ]);
  if (commentCount + mentionCount + deletionReqCount > 0) {
    return { error: "Não é possível excluir: este usuário já tem histórico no sistema (comentários, menções ou solicitações). Use \"Inativar\" em vez de excluir." };
  }

  await prisma.$transaction([
    prisma.task.updateMany({ where: { responsibleId: id }, data: { responsibleId: null } }),
    prisma.case.updateMany({ where: { responsibleId: id }, data: { responsibleId: null } }),
    prisma.attendance.updateMany({ where: { responsibleId: id }, data: { responsibleId: null } }),
    prisma.attachment.updateMany({ where: { uploadedById: id }, data: { uploadedById: null } }),
    prisma.deletionRequest.updateMany({ where: { resolvedById: id }, data: { resolvedById: null } }),
    prisma.user.delete({ where: { id } }),
  ]);
  revalidatePath("/configuracoes");
  return {};
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

export async function createCostCenterQuick(name: string): Promise<{ id: string; name: string }> {
  const costCenter = await prisma.costCenter.create({ data: { name } });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  return { id: costCenter.id, name: costCenter.name };
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
