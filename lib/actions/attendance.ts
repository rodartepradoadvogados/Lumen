"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createAttendance(data: {
  clientName: string;
  contact?: string;
  subject: string;
  area?: string;
  description?: string;
  channel: string;
  responsibleId?: string;
  estimatedValue?: number | null;
  leadSource?: string;
  nextContactAt?: string;
}) {
  await prisma.attendance.create({
    data: {
      clientName: data.clientName,
      contact: data.contact || null,
      subject: data.subject,
      area: data.area || null,
      description: data.description || null,
      channel: data.channel,
      responsibleId: data.responsibleId || null,
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      stageChangedAt: new Date(),
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
}

export async function updateAttendanceStatus(id: string, status: string) {
  await prisma.attendance.update({ where: { id }, data: { status } });
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
}

// ===== Funil comercial (CRM de captação) — eixo independente do status operacional =====

export async function setAttendanceStage(id: string, stage: string, lostReason?: string) {
  await prisma.attendance.update({
    where: { id },
    data: {
      stage,
      stageChangedAt: new Date(),
      // motivo só é gravado (ou limpo) quando o estágio é PERDIDO
      lostReason: stage === "PERDIDO" ? lostReason || null : null,
      // não mexe no `status` operacional: os dois eixos são independentes
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
}

export async function updateAttendanceCommercial(
  id: string,
  data: { estimatedValue?: number | null; leadSource?: string | null; nextContactAt?: string | null }
) {
  await prisma.attendance.update({
    where: { id },
    data: {
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
}

export async function convertAttendanceToCase(
  attendanceId: string,
  data: { type: string; processNumber?: string; court?: string }
) {
  const attendance = await prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } });

  let client = await prisma.client.findFirst({ where: { name: { equals: attendance.clientName, mode: "insensitive" } } });
  if (!client) {
    client = await prisma.client.create({ data: { name: attendance.clientName, type: "PF" } });
  }

  const created = await prisma.case.create({
    data: {
      title: attendance.subject,
      type: data.type,
      area: attendance.area || null,
      description: attendance.description || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      clientId: client.id,
      responsibleId: attendance.responsibleId,
    },
  });

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { status: "CONVERTIDO", convertedCaseId: created.id },
  });

  revalidatePath("/atendimento");
  revalidatePath("/processos");
  redirect(`/processos/${created.id}`);
}
