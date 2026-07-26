"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

async function requirePlatformOwner() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) throw new Error("Apenas donos da plataforma podem gerenciar o financeiro da Lúmen.");
}

function revalidateFinanceiroLumen() {
  revalidatePath("/painel-mestre/financeiro");
  revalidatePath("/painel-mestre");
}

export async function createPlatformExpense(data: {
  accountId: string;
  description: string;
  amount: string;
  competencia: string; // "2026-08"
  paidAt?: string;
  supplier?: string;
  notes?: string;
}) {
  await requirePlatformOwner();
  if (!data.accountId || !data.description || !data.competencia) throw new Error("Preencha conta, descrição e competência.");
  await prisma.platformExpense.create({
    data: {
      accountId: data.accountId,
      description: data.description,
      amount: parseFloat(data.amount) || 0,
      competencia: data.competencia,
      paidAt: data.paidAt ? new Date(data.paidAt) : null,
      supplier: data.supplier || null,
      notes: data.notes || null,
    },
  });
  revalidateFinanceiroLumen();
}

export async function updatePlatformExpense(id: string, data: {
  accountId: string;
  description: string;
  amount: string;
  competencia: string;
  paidAt?: string;
  supplier?: string;
  notes?: string;
}) {
  await requirePlatformOwner();
  await prisma.platformExpense.update({
    where: { id },
    data: {
      accountId: data.accountId,
      description: data.description,
      amount: parseFloat(data.amount) || 0,
      competencia: data.competencia,
      paidAt: data.paidAt ? new Date(data.paidAt) : null,
      supplier: data.supplier || null,
      notes: data.notes || null,
    },
  });
  revalidateFinanceiroLumen();
}

export async function deletePlatformExpense(id: string) {
  await requirePlatformOwner();
  await prisma.platformExpense.delete({ where: { id } });
  revalidateFinanceiroLumen();
}
