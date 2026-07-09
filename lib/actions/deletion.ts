"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

type EntityType = "TASK" | "CASE" | "ATTENDANCE";

async function performDelete(entityType: string, entityId: string) {
  if (entityType === "TASK") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { comment: { taskId: entityId } } }),
      prisma.comment.deleteMany({ where: { taskId: entityId } }),
      prisma.task.delete({ where: { id: entityId } }),
    ]);
    revalidatePath("/kanban");
    revalidatePath("/agenda");
    revalidatePath("/");
    revalidatePath("/alertas");
  } else if (entityType === "CASE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { comment: { OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } } }),
      prisma.comment.deleteMany({ where: { OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } }),
      prisma.attachment.deleteMany({ where: { caseId: entityId } }),
      prisma.publication.updateMany({ where: { caseId: entityId }, data: { caseId: null } }),
      prisma.payable.updateMany({ where: { caseId: entityId }, data: { caseId: null } }),
      prisma.receivable.updateMany({ where: { caseId: entityId }, data: { caseId: null } }),
      prisma.task.deleteMany({ where: { caseId: entityId } }),
      prisma.case.delete({ where: { id: entityId } }),
    ]);
    revalidatePath("/processos");
    revalidatePath("/kanban");
    revalidatePath("/agenda");
  } else if (entityType === "ATTENDANCE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { comment: { task: { attendanceId: entityId } } } }),
      prisma.comment.deleteMany({ where: { task: { attendanceId: entityId } } }),
      prisma.attachment.deleteMany({ where: { attendanceId: entityId } }),
      prisma.task.deleteMany({ where: { attendanceId: entityId } }),
      prisma.attendance.delete({ where: { id: entityId } }),
    ]);
    revalidatePath("/atendimento");
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
    await performDelete(entityType, entityId);
    return {};
  }

  const existing = await prisma.deletionRequest.findFirst({
    where: { entityType, entityId, status: "PENDENTE" },
  });
  if (existing) return { pending: true };

  await prisma.deletionRequest.create({
    data: { entityType, entityId, entityLabel, status: "PENDENTE", requestedById: user.id },
  });
  revalidatePath("/alertas");
  return { pending: true };
}

export async function approveDeletion(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem aprovar exclusões." };

  const req = await prisma.deletionRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDENTE") return { error: "Solicitação não encontrada ou já resolvida." };

  try {
    await performDelete(req.entityType, req.entityId);
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

  await prisma.deletionRequest.update({
    where: { id },
    data: { status: "REJEITADA", resolvedById: user.id, resolvedAt: new Date() },
  });
  revalidatePath("/alertas");
  return {};
}
