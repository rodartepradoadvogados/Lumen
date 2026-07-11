"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinanceAccess } from "@/lib/permissions";

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

function firstOfNextMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export async function markPayablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string) {
  await requireFinanceAccess();
  await prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate), paymentReceiptNumber: receiptNumber || null },
  });
  revalidateFinance();
}

export async function markReceivablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string) {
  await requireFinanceAccess();
  await prisma.receivable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate), paymentReceiptNumber: receiptNumber || null },
  });
  revalidateFinance();
}

// Baixa em bloco: várias contas quitadas na mesma transferência/pagamento.
// Cada lançamento é pago pelo seu próprio valor (não dividido); o nº do comprovante,
// quando informado, é o mesmo para todos os selecionados.
export async function markManyPayablesPaid(ids: string[], paidDate: string, receiptNumber?: string): Promise<{ count: number }> {
  await requireFinanceAccess();
  if (ids.length === 0) return { count: 0 };
  const items = await prisma.payable.findMany({ where: { id: { in: ids } }, select: { id: true, amount: true } });
  const date = new Date(paidDate);
  await prisma.$transaction(
    items.map((p) =>
      prisma.payable.update({
        where: { id: p.id },
        data: { status: "PAGO", paidAmount: p.amount, paidDate: date, paymentReceiptNumber: receiptNumber || null },
      })
    )
  );
  revalidateFinance();
  return { count: items.length };
}

export async function markManyReceivablesPaid(ids: string[], paidDate: string, receiptNumber?: string): Promise<{ count: number }> {
  await requireFinanceAccess();
  if (ids.length === 0) return { count: 0 };
  const items = await prisma.receivable.findMany({ where: { id: { in: ids } }, select: { id: true, amount: true } });
  const date = new Date(paidDate);
  await prisma.$transaction(
    items.map((r) =>
      prisma.receivable.update({
        where: { id: r.id },
        data: { status: "PAGO", paidAmount: r.amount, paidDate: date, paymentReceiptNumber: receiptNumber || null },
      })
    )
  );
  revalidateFinance();
  return { count: items.length };
}

export async function reopenPayable(id: string) {
  await requireFinanceAccess();
  await prisma.payable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null } });
  revalidateFinance();
}

export async function reopenReceivable(id: string) {
  await requireFinanceAccess();
  await prisma.receivable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null } });
  revalidateFinance();
}

export async function updatePayable(id: string, data: {
  description: string;
  supplier?: string;
  amount: string;
  dueDate: string;
  categoryId?: string;
  costCenterId?: string;
  caseId?: string;
  noDueDate?: boolean;
}) {
  await requireFinanceAccess();
  const noDueDate = data.noDueDate ?? false;
  await prisma.payable.update({
    where: { id },
    data: {
      description: data.description,
      supplier: data.supplier || null,
      amount: parseFloat(data.amount),
      dueDate: noDueDate ? undefined : new Date(data.dueDate),
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      caseId: data.caseId || null,
      noDueDate,
    },
  });
  revalidateFinance();
}

export async function updateReceivable(id: string, data: {
  description: string;
  amount: string;
  dueDate: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  clientId?: string;
  caseId?: string;
  noDueDate?: boolean;
}) {
  await requireFinanceAccess();
  const noDueDate = data.noDueDate ?? false;
  await prisma.receivable.update({
    where: { id },
    data: {
      description: data.description,
      amount: parseFloat(data.amount),
      dueDate: noDueDate ? undefined : new Date(data.dueDate),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      clientId: data.clientId || null,
      caseId: data.caseId || null,
      noDueDate,
    },
  });
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
  noDueDate?: boolean;
  installmentCount?: string;
  installmentIntervalDays?: string;
}) {
  await requireFinanceAccess();
  const noDueDate = data.noDueDate ?? false;
  const count = Math.max(1, parseInt(data.installmentCount || "1") || 1);
  const intervalDays = Math.max(1, parseInt(data.installmentIntervalDays || "30") || 30);
  const groupId = count > 1 ? crypto.randomUUID() : null;
  const baseDate = noDueDate ? firstOfNextMonth() : new Date(data.dueDate);

  for (let i = 0; i < count; i++) {
    const dueDate = new Date(baseDate);
    if (!noDueDate) dueDate.setDate(dueDate.getDate() + i * intervalDays);
    await prisma.payable.create({
      data: {
        description: count > 1 ? `${data.description} (${i + 1}/${count})` : data.description,
        supplier: data.supplier || null,
        amount: parseFloat(data.amount),
        dueDate,
        categoryId: data.categoryId || null,
        costCenterId: data.costCenterId || null,
        caseId: data.caseId || null,
        noDueDate,
        groupId,
        installmentNumber: count > 1 ? i + 1 : null,
        installmentTotal: count > 1 ? count : null,
      },
    });
  }
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
  successAmount?: string;
}) {
  await requireFinanceAccess();
  const hasSuccessPortion = !!data.successAmount && parseFloat(data.successAmount) > 0;
  const groupId = hasSuccessPortion ? crypto.randomUUID() : null;

  await prisma.receivable.create({
    data: {
      description: hasSuccessPortion ? `${data.description} (parte agora)` : data.description,
      amount: parseFloat(data.amount),
      dueDate: new Date(data.dueDate),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      clientId: data.clientId || null,
      caseId: data.caseId || null,
      groupId,
    },
  });

  if (hasSuccessPortion) {
    await prisma.receivable.create({
      data: {
        description: `${data.description} (parte no êxito)`,
        amount: parseFloat(data.successAmount!),
        dueDate: firstOfNextMonth(),
        noDueDate: true,
        isSuccessPortion: true,
        kind: data.kind,
        categoryId: data.categoryId || null,
        costCenterId: data.costCenterId || null,
        clientId: data.clientId || null,
        caseId: data.caseId || null,
        groupId,
      },
    });
  }

  revalidateFinance();
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
}
