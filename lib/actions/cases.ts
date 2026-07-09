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
  newClientName?: string;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  responsibleId?: string;
  description?: string;
}) {
  let clientId = data.clientId || null;
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({ data: { name: data.newClientName, type: "PJ" } });
    clientId = client.id;
  }

  const created = await prisma.case.create({
    data: {
      title: data.title,
      type: data.type,
      area: data.area || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      caseValue: data.caseValue ? parseFloat(data.caseValue) : null,
      clientId,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
    },
  });
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  redirect(`/processos/${created.id}`);
}

export async function createCaseQuick(title: string, clientId?: string): Promise<{ id: string; title: string }> {
  const created = await prisma.case.create({
    data: { title, type: "ATENDIMENTO", clientId: clientId || null },
  });
  revalidatePath("/processos");
  return { id: created.id, title: created.title };
}

export async function updateCaseStatus(caseId: string, status: string) {
  await prisma.case.update({ where: { id: caseId }, data: { status } });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}

export async function promoteCaseToJudicial(caseId: string, data: { processNumber: string; court?: string }) {
  await prisma.case.update({
    where: { id: caseId },
    data: { type: "JUDICIAL", processNumber: data.processNumber, court: data.court || null },
  });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}
