"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export async function createAttachment(data: {
  name: string;
  driveUrl: string;
  docType?: string;
  caseId?: string;
  attendanceId?: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  // caseId/attendanceId vêm do cliente — precisam pertencer ao escritório do usuário logado
  // antes de virarem o vínculo gravado no Attachment (senão um usuário poderia anexar um link
  // a um processo/atendimento de outro escritório).
  if (data.caseId) {
    const c = await prisma.case.findFirst({ where: { id: data.caseId, officeId: user.officeId }, select: { id: true } });
    if (!c) return { error: "Processo não encontrado." };
  }
  if (data.attendanceId) {
    const a = await prisma.attendance.findFirst({ where: { id: data.attendanceId, officeId: user.officeId }, select: { id: true } });
    if (!a) return { error: "Atendimento não encontrado." };
  }

  await prisma.attachment.create({
    data: {
      name: data.name,
      driveUrl: data.driveUrl,
      docType: data.docType || "OUTRO",
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      uploadedById: user.id,
      officeId: user.officeId,
    },
  });
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  if (data.attendanceId) revalidatePath(`/atendimento/${data.attendanceId}`);
  return {};
}

export async function deleteAttachment(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  const att = await prisma.attachment.findFirst({ where: { id, officeId: user.officeId } });
  if (!att) return { error: "Anexo não encontrado." };
  await prisma.attachment.delete({ where: { id } });
  if (att.caseId) revalidatePath(`/processos/${att.caseId}`);
  if (att.attendanceId) revalidatePath(`/atendimento/${att.attendanceId}`);
  return {};
}
