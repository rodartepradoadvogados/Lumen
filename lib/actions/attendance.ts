"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createAttendance(data: {
  clientName: string;
  contact?: string;
  subject: string;
  channel: string;
  responsibleId?: string;
}) {
  await prisma.attendance.create({
    data: {
      clientName: data.clientName,
      contact: data.contact || null,
      subject: data.subject,
      channel: data.channel,
      responsibleId: data.responsibleId || null,
    },
  });
  revalidatePath("/atendimento");
}

export async function updateAttendanceStatus(id: string, status: string) {
  await prisma.attendance.update({ where: { id }, data: { status } });
  revalidatePath("/atendimento");
}
