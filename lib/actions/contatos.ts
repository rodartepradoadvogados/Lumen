"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

type ClientInput = {
  name: string;
  type: string;
  document?: string;
  rg?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export async function createClient(data: ClientInput) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.client.create({
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
}

export async function updateClient(id: string, data: ClientInput) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.client.updateMany({
    where: { id, officeId: viewer.officeId },
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
}

export async function createClientQuick(name: string): Promise<{ id: string; name: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  const client = await prisma.client.create({ data: { name, type: "PJ", officeId: viewer.officeId } });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
  return { id: client.id, name: client.name };
}

export async function createLawyer(data: { name: string; oab?: string; firm?: string; side: string; email?: string; phone?: string; notes?: string }) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.lawyer.create({
    data: {
      name: data.name,
      oab: data.oab || null,
      firm: data.firm || null,
      side: data.side,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/contatos/advogados");
  revalidatePath("/contatos");
}

export async function updateLawyer(
  id: string,
  data: { name: string; oab?: string; firm?: string; side: string; email?: string; phone?: string; notes?: string }
) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.lawyer.updateMany({
    where: { id, officeId: viewer.officeId },
    data: {
      name: data.name,
      oab: data.oab || null,
      firm: data.firm || null,
      side: data.side,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/advogados");
  revalidatePath("/contatos");
}

export async function deleteLawyer(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  await prisma.lawyer.deleteMany({ where: { id, officeId: viewer.officeId } });
  revalidatePath("/contatos/advogados");
  revalidatePath("/contatos");
  return {};
}

export async function deleteClient(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  // Case.clientId é campo LEGADO — aponta só para o primeiro cliente do processo. A lista
  // completa de litisconsórcio ativo mora em CaseClient (sem officeId próprio, filtrado via
  // case.officeId); sem contar essa tabela também, um segundo/terceiro litisconsorte passava
  // pela guarda com falso-negativo e o delete estourava violação de FK. Assessoria.client é
  // relação obrigatória do mesmo jeito.
  const [cases, caseClients, receivables, publications, assessorias] = await Promise.all([
    prisma.case.count({ where: { clientId: id, officeId: viewer.officeId } }),
    prisma.caseClient.count({ where: { clientId: id, case: { officeId: viewer.officeId } } }),
    prisma.receivable.count({ where: { clientId: id, officeId: viewer.officeId } }),
    prisma.publication.count({ where: { clientId: id, officeId: viewer.officeId } }),
    prisma.assessoria.count({ where: { clientId: id, officeId: viewer.officeId } }),
  ]);
  if (cases > 0 || caseClients > 0 || receivables > 0 || publications > 0 || assessorias > 0) {
    const parts: string[] = [];
    if (cases > 0 || caseClients > 0) parts.push(`${Math.max(cases, caseClients)} processo(s)/caso(s)`);
    if (receivables > 0) parts.push(`${receivables} lançamento(s) a receber`);
    if (publications > 0) parts.push(`${publications} publicação(ões)`);
    if (assessorias > 0) parts.push(`${assessorias} assessoria(s)`);
    return {
      error: `Não é possível excluir: há ${parts.join(", ")} vinculado(s) a este cliente. Remova ou reatribua esses itens antes de excluir.`,
    };
  }
  try {
    await prisma.client.deleteMany({ where: { id, officeId: viewer.officeId } });
  } catch {
    // Defesa em profundidade — mesmo padrão de lib/actions/clientDuplicates.ts: qualquer outra FK
    // que a guarda acima não cobriu vira mensagem amigável em vez de erro genérico de servidor.
    // Relações opcionais (Attendance, HonorarioLancamento) são desvinculadas silenciosamente
    // pelo SET NULL padrão do Prisma quando o delete passa — não bloqueiam a exclusão.
    return { error: "Não é possível excluir: este cliente ainda tem vínculos no sistema." };
  }
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
  return {};
}
