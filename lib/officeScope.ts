import { prisma } from "@/lib/prisma";

// ============================================================================
// Checagens de posse entre escritórios — usadas por Server Actions que recebem
// do cliente o ID de uma entidade SECUNDÁRIA (ex.: o clientId de um Caso sendo
// criado, o responsibleId de uma Tarefa) além da entidade principal que já é
// validada por officeId. Sem essas checagens, um usuário poderia gravar um
// vínculo apontando para um registro de outro escritório (o registro em si
// nunca é lido/exposto, mas o vínculo passa a existir e pode aparecer
// indevidamente em páginas do escritório vítima que fazem include por essa FK).
// ============================================================================

export async function isClientInOffice(clientId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.client.findFirst({ where: { id: clientId, officeId }, select: { id: true } }));
}

export async function isCaseInOffice(caseId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.case.findFirst({ where: { id: caseId, officeId }, select: { id: true } }));
}

export async function isAttendanceInOffice(attendanceId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { id: true } }));
}

export async function isUserInOffice(userId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.user.findFirst({ where: { id: userId, officeId }, select: { id: true } }));
}

export async function isAssessoriaInOffice(assessoriaId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId }, select: { id: true } }));
}

export async function isCostCenterInOffice(costCenterId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.costCenter.findFirst({ where: { id: costCenterId, officeId }, select: { id: true } }));
}

export async function isCategoryInOffice(categoryId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.financialCategory.findFirst({ where: { id: categoryId, officeId }, select: { id: true } }));
}

export async function isSupplierInOffice(supplierId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.supplier.findFirst({ where: { id: supplierId, officeId }, select: { id: true } }));
}

export async function isTaskInOffice(taskId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.task.findFirst({ where: { id: taskId, officeId }, select: { id: true } }));
}

export async function isKanbanColumnInOffice(columnId: string, officeId: string): Promise<boolean> {
  return Boolean(await prisma.kanbanColumn.findFirst({ where: { id: columnId, officeId }, select: { id: true } }));
}
