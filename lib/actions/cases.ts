"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { isClientInOffice, isUserInOffice, isAssessoriaInOffice } from "@/lib/officeScope";

async function assertCaseRelationsInOffice(
  data: { clientId?: string; responsibleId?: string; assessoriaId?: string },
  officeId: string
): Promise<void> {
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.assessoriaId && !(await isAssessoriaInOffice(data.assessoriaId, officeId))) throw new Error("Assessoria não encontrada.");
}

export async function createCase(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clientId?: string;
  newClientName?: string;
  clientRole?: string;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  opposingPartyDocument?: string;
  opposingPartyAddress?: string;
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice(data, viewer.officeId);

  let clientId = data.clientId || null;
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({ data: { name: data.newClientName, type: "PF", officeId: viewer.officeId } });
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
      clientRole: data.clientRole || null,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      opposingPartyDocument: data.opposingPartyDocument || null,
      opposingPartyAddress: data.opposingPartyAddress || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  redirect(`/processos/${created.id}`);
}

// Mesmo cadastro de createCase, mas sem redirect() — o redirect da versão desktop aponta
// pra "/processos/{id}" (fora de /m), então o app mobile precisa navegar ele mesmo, pro
// equivalente "/m/processos/{id}" (ver components/mobile/MobileNewCaseForm.tsx).
export async function createCaseMobile(data: {
  title: string;
  type: string;
  area?: string;
  processNumber?: string;
  court?: string;
  caseValue?: string;
  clientId?: string;
  newClientName?: string;
  clientRole?: string;
  opposingPartyName?: string;
  opposingPartyRole?: string;
  opposingPartyDocument?: string;
  opposingPartyAddress?: string;
  responsibleId?: string;
  description?: string;
  assessoriaId?: string;
}): Promise<{ id: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  await assertCaseRelationsInOffice(data, viewer.officeId);

  let clientId = data.clientId || null;
  if (!clientId && data.newClientName) {
    const client = await prisma.client.create({ data: { name: data.newClientName, type: "PF", officeId: viewer.officeId } });
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
      clientRole: data.clientRole || null,
      opposingPartyName: data.opposingPartyName || null,
      opposingPartyRole: data.opposingPartyRole || null,
      opposingPartyDocument: data.opposingPartyDocument || null,
      opposingPartyAddress: data.opposingPartyAddress || null,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  return { id: created.id };
}

export async function createCaseQuick(title: string, clientId?: string): Promise<{ id: string; title: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão inválida.");
  if (clientId && !(await isClientInOffice(clientId, viewer.officeId))) throw new Error("Cliente não encontrado.");
  const created = await prisma.case.create({
    data: { title, type: "ATENDIMENTO", clientId: clientId || null, officeId: viewer.officeId },
  });
  revalidatePath("/processos");
  return { id: created.id, title: created.title };
}

export async function updateCaseStatus(caseId: string, status: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.case.updateMany({ where: { id: caseId, officeId: viewer.officeId }, data: { status } });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}

export async function promoteCaseToJudicial(caseId: string, data: { processNumber: string; court?: string }) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.case.updateMany({
    where: { id: caseId, officeId: viewer.officeId },
    data: { type: "JUDICIAL", processNumber: data.processNumber, court: data.court || null },
  });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
}
