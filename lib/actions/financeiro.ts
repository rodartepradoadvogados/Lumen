"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function revalidateFinance() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/fluxo-de-caixa");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  revalidatePath("/alertas");
}

export async function markPayablePaid(id: string, paidAmount: number, paidDate: string) {
  await prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate) },
  });
  revalidateFinance();
}

export async function markReceivablePaid(id: string, paidAmount: number, paidDate: string) {
  await prisma.receivable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate) },
  });
  revalidateFinance();
}

export async function reopenPayable(id: string) {
  await prisma.payable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null } });
  revalidateFinance();
}

export async function reopenReceivable(id: string) {
  await prisma.receivable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null } });
  revalidateFinance();
}

export async function createPayable(data: {
  description: string;
  supplier?: string;
  amount: string;
  dueDate: string;
  categoryId?: string;
  costCenterId?: string;
  caseId?: string;
}) {
  await prisma.payable.create({
    data: {
      description: data.description,
      supplier: data.supplier || null,
      amount: parseFloat(data.amount),
      dueDate: new Date(data.dueDate),
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      caseId: data.caseId || null,
    },
  });
  revalidateFinance();
}

export async function createReceivable(data: {
  description: string;
  amount: string;
  dueDate: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  clientId?: string;
  caseId?: string;
}) {
  await prisma.receivable.create({
    data: {
      description: data.description,
      amount: parseFloat(data.amount),
      dueDate: new Date(data.dueDate),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      clientId: data.clientId || null,
      caseId: data.caseId || null,
    },
  });
  revalidateFinance();
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
}
