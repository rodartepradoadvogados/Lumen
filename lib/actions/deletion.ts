"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

type EntityType = "TASK" | "CASE" | "ATTENDANCE" | "PAYABLE" | "RECEIVABLE";

async function performDelete(entityType: string, entityId: string, officeId: string) {
  if (entityType === "TASK") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { taskId: entityId } } }),
      prisma.comment.deleteMany({ where: { officeId, taskId: entityId } }),
      prisma.task.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/kanban");
    revalidatePath("/agenda");
    revalidatePath("/painel");
    revalidatePath("/alertas");
  } else if (entityType === "CASE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } } }),
      prisma.comment.deleteMany({ where: { officeId, OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } }),
      prisma.attachment.deleteMany({ where: { officeId, caseId: entityId } }),
      prisma.publication.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.payable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.receivable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.task.deleteMany({ where: { officeId, caseId: entityId } }),
      prisma.case.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/processos");
    revalidatePath("/kanban");
    revalidatePath("/agenda");
  } else if (entityType === "ATTENDANCE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { task: { attendanceId: entityId } } } }),
      prisma.comment.deleteMany({ where: { officeId, task: { attendanceId: entityId } } }),
      prisma.attachment.deleteMany({ where: { officeId, attendanceId: entityId } }),
      prisma.task.deleteMany({ where: { officeId, attendanceId: entityId } }),
      prisma.attendance.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/atendimento");
  } else if (entityType === "PAYABLE") {
    const payable = await prisma.payable.findFirst({ where: { id: entityId, officeId } });
    if (!payable) return;
    await prisma.payable.delete({ where: { id: entityId } });
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/contas-a-pagar");
    revalidatePath("/financeiro/dre");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/alertas");
    revalidatePath("/painel");
    if (payable?.caseId) revalidatePath(`/processos/${payable.caseId}`);
  } else if (entityType === "RECEIVABLE") {
    const receivable = await prisma.receivable.findFirst({ where: { id: entityId, officeId } });
    if (!receivable) return;
    await prisma.receivable.delete({ where: { id: entityId } });
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/contas-a-receber");
    revalidatePath("/financeiro/dre");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/alertas");
    revalidatePath("/painel");
    if (receivable?.caseId) revalidatePath(`/processos/${receivable.caseId}`);
  }
}

export async function requestDeletion(
  entityType: EntityType,
  entityId: string,
  entityLabel: string
): Promise<{ error?: string; pending?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  if (user.isAdmin) {
    await performDelete(entityType, entityId, user.officeId);
    return {};
  }

  const existing = await prisma.deletionRequest.findFirst({
    where: { entityType, entityId, status: "PENDENTE", officeId: user.officeId },
  });
  if (existing) return { pending: true };

  await prisma.deletionRequest.create({
    data: { entityType, entityId, entityLabel, status: "PENDENTE", requestedById: user.id, officeId: user.officeId },
  });
  revalidatePath("/alertas");
  return { pending: true };
}

export async function approveDeletion(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem aprovar exclusões." };

  const req = await prisma.deletionRequest.findFirst({ where: { id, officeId: user.officeId } });
  if (!req || req.status !== "PENDENTE") return { error: "Solicitação não encontrada ou já resolvida." };

  try {
    await performDelete(req.entityType, req.entityId, user.officeId);
  } catch {
    // entidade pode já ter sido removida por outro caminho — segue para marcar a solicitação como resolvida
  }
  await prisma.deletionRequest.update({
    where: { id },
    data: { status: "APROVADA", resolvedById: user.id, resolvedAt: new Date() },
  });
  revalidatePath("/alertas");
  return {};
}

export async function rejectDeletion(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem recusar exclusões." };

  const result = await prisma.deletionRequest.updateMany({
    where: { id, officeId: user.officeId },
    data: { status: "REJEITADA", resolvedById: user.id, resolvedAt: new Date() },
  });
  if (result.count === 0) return { error: "Solicitação não encontrada." };
  revalidatePath("/alertas");
  return {};
}
