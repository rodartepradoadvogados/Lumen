"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createCase(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clientId?: string;
  opposingPartyId?: string;
  opposingLawyerId?: string;
  responsibleId?: string;
  description?: string;
}) {
  const created = await prisma.case.create({
    data: {
      title: data.title,
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId: data.clientId || null,
      opposingPartyId: data.opposingPartyId || null,
      opposingLawyerId: data.opposingLawyerId || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
    },
  });
  revalidatePath("/processos");
  redirect(`/processos/${created.id}`);
}

export async function updateCaseStatus(caseId: string, status: string) {
  await prisma.case.update({ where: { id: caseId }, data: { status } });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}
