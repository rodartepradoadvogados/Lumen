"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isUserInOffice } from "@/lib/officeScope";
import { DOC_TYPE_TO_PENDENCIA_ENVIAR } from "@/lib/pendencias";

export type PendenciaInput = {
  direction: string; // SOLICITAR | ENVIAR
  kind: string;
  description?: string;
  responsibleId?: string;
  dueDate?: string; // YYYY-MM-DD
};

// Usado tanto na criação do atendimento (várias pendências de uma vez, junto com o cadastro)
// quanto na tela de detalhe (uma pendência nova adicionada depois). `attendanceId` já precisa
// existir — pendência nunca é criada em rascunho de atendimento que ainda não virou registro real.
export async function createAttendancePendencias(attendanceId: string, items: PendenciaInput[]): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (items.length === 0) return {};

  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: viewer.officeId }, select: { id: true } });
  if (!attendance) return { error: "Atendimento não encontrado." };

  for (const item of items) {
    if (item.responsibleId && !(await isUserInOffice(item.responsibleId, viewer.officeId))) {
      return { error: "Responsável não encontrado." };
    }
  }

  await prisma.atendimentoPendencia.createMany({
    data: items.map((item) => ({
      attendanceId,
      direction: item.direction,
      kind: item.kind,
      description: item.description || null,
      responsibleId: item.responsibleId || null,
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      officeId: viewer.officeId,
    })),
  });

  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

export async function completeAttendancePendencia(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const pendencia = await prisma.atendimentoPendencia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pendencia) return { error: "Pendência não encontrada." };

  await prisma.atendimentoPendencia.update({ where: { id }, data: { status: "CONCLUIDA", completedAt: new Date() } });
  revalidatePath(`/atendimento/${pendencia.attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

export async function reopenAttendancePendencia(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const pendencia = await prisma.atendimentoPendencia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pendencia) return { error: "Pendência não encontrada." };

  await prisma.atendimentoPendencia.update({ where: { id }, data: { status: "PENDENTE", completedAt: null } });
  revalidatePath(`/atendimento/${pendencia.attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

export async function deleteAttendancePendencia(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const pendencia = await prisma.atendimentoPendencia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pendencia) return { error: "Pendência não encontrada." };

  await prisma.atendimentoPendencia.delete({ where: { id } });
  revalidatePath(`/atendimento/${pendencia.attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

export async function updateAttendancePendenciaFollowUp(
  id: string,
  data: { responsibleId?: string | null; dueDate?: string | null }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const pendencia = await prisma.atendimentoPendencia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pendencia) return { error: "Pendência não encontrada." };
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, viewer.officeId))) {
    return { error: "Responsável não encontrado." };
  }

  await prisma.atendimentoPendencia.update({
    where: { id },
    data: {
      responsibleId: data.responsibleId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });
  revalidatePath(`/atendimento/${pendencia.attendanceId}`);
  return {};
}

// Resolução automática (item 3 da Fase 5) — chamado por createAttachment/finalizeAttachmentUpload
// (lib/actions/attachments.ts) sempre que um anexo ganha um attendanceId. Fecha a(s) pendência(s)
// de ENVIAR ainda em aberto cujo kind corresponde ao docType do anexo (ver
// DOC_TYPE_TO_PENDENCIA_ENVIAR, lib/pendencias.ts) — só os 3 tipos com correspondência inequívoca.
// Best-effort: nunca lança, para nunca derrubar o upload do anexo por causa disto.
export async function autoResolvePendenciasForAttachment(attendanceId: string, docType: string, officeId: string): Promise<void> {
  const kind = DOC_TYPE_TO_PENDENCIA_ENVIAR[docType];
  if (!kind) return;
  try {
    await prisma.atendimentoPendencia.updateMany({
      where: { attendanceId, officeId, direction: "ENVIAR", kind, status: "PENDENTE" },
      data: { status: "CONCLUIDA", completedAt: new Date() },
    });
  } catch {
    // best-effort — nunca deve impedir o anexo de ser salvo
  }
}
