"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export async function createAttachment(data: { name: string; driveUrl: string; docType?: string; caseId?: string; attendanceId?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
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
