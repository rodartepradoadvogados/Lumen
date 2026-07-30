"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinanceAccess } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice, isClientInOffice, isCategoryInOffice, isCostCenterInOffice, isSupplierInOffice } from "@/lib/officeScope";

async function assertFinanceRelationsInOffice(
  data: { caseId?: string; clientId?: string; categoryId?: string; costCenterId?: string; supplierId?: string },
  officeId: string
): Promise<void> {
  if (data.caseId && !(await isCaseInOffice(data.caseId, officeId))) throw new Error("Processo não encontrado.");
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.categoryId && !(await isCategoryInOffice(data.categoryId, officeId))) throw new Error("Categoria não encontrada.");
  if (data.costCenterId && !(await isCostCenterInOffice(data.costCenterId, officeId))) throw new Error("Centro de custo não encontrado.");
  if (data.supplierId && !(await isSupplierInOffice(data.supplierId, officeId))) throw new Error("Fornecedor não encontrado.");
}

function revalidateFinance() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  revalidatePath("/financeiro/fluxo-de-caixa");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath("/agenda");
  revalidatePath("/kanban");
}

function firstOfNextMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// Confere acesso ao módulo Financeiro (requireFinanceAccess) e devolve o officeId do
// usuário logado, para uso em todo where/data deste arquivo — nunca operar em
// Payable/Receivable/FinancialCategory/CostCenter sem passar por aqui.
async function requireFinanceOfficeId(): Promise<string> {
  await requireFinanceAccess();
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão inválida.");
  return user.officeId;
}

// Cria um lembrete de vencimento na Agenda/Kanban para uma parcela recorrente
// de contas a pagar/receber, vinculado ao processo quando houver.
async function createInstallmentReminder(officeId: string, kind: "pagar" | "receber", title: string, dueDate: Date, caseId?: string | null) {
  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId }, orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      officeId,
      title: `${kind === "pagar" ? "Vencimento a pagar" : "Vencimento a receber"}: ${title}`,
      type: "PRAZO",
      dueDate,
      priority: "MEDIA",
      caseId: caseId || null,
      columnId: firstColumn?.id,
    },
  });
}

export async function markPayablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string, paymentMethod?: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a pagar não encontrada.");
  await prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate), paymentReceiptNumber: receiptNumber || null, paymentMethod: paymentMethod || null },
  });
  revalidateFinance();
}

export async function markReceivablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string, paymentMethod?: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a receber não encontrada.");
  await prisma.receivable.update({
    where: { id },
    data: { status: "PAGO", paidAmount, paidDate: new Date(paidDate), paymentReceiptNumber: receiptNumber || null, paymentMethod: paymentMethod || null },
  });
  revalidateFinance();
}

// Baixa em bloco: várias contas quitadas na mesma transferência/pagamento.
// Cada lançamento é pago pelo seu próprio valor (não dividido); o nº do comprovante
// e a modalidade de pagamento, quando informados, são os mesmos para todos os selecionados.
export async function markManyPayablesPaid(ids: string[], paidDate: string, receiptNumber?: string, paymentMethod?: string): Promise<{ count: number }> {
  const officeId = await requireFinanceOfficeId();
  if (ids.length === 0) return { count: 0 };
  const items = await prisma.payable.findMany({ where: { id: { in: ids }, officeId }, select: { id: true, amount: true } });
  const date = new Date(paidDate);
  await prisma.$transaction(
    items.map((p) =>
      prisma.payable.update({
        where: { id: p.id },
        data: { status: "PAGO", paidAmount: p.amount, paidDate: date, paymentReceiptNumber: receiptNumber || null, paymentMethod: paymentMethod || null },
      })
    )
  );
  revalidateFinance();
  return { count: items.length };
}

export async function markManyReceivablesPaid(ids: string[], paidDate: string, receiptNumber?: string, paymentMethod?: string): Promise<{ count: number }> {
  const officeId = await requireFinanceOfficeId();
  if (ids.length === 0) return { count: 0 };
  const items = await prisma.receivable.findMany({ where: { id: { in: ids }, officeId }, select: { id: true, amount: true } });
  const date = new Date(paidDate);
  await prisma.$transaction(
    items.map((r) =>
      prisma.receivable.update({
        where: { id: r.id },
        data: { status: "PAGO", paidAmount: r.amount, paidDate: date, paymentReceiptNumber: receiptNumber || null, paymentMethod: paymentMethod || null },
      })
    )
  );
  revalidateFinance();
  return { count: items.length };
}

export async function reopenPayable(id: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a pagar não encontrada.");
  await prisma.payable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null, paymentMethod: null } });
  revalidateFinance();
}

export async function reopenReceivable(id: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a receber não encontrada.");
  await prisma.receivable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null, paymentMethod: null } });
  revalidateFinance();
}

async function supplierDisplayName(supplierId: string | undefined, officeId: string): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, officeId }, select: { name: true } });
  return supplier?.name ?? null;
}

export async function updatePayable(id: string, data: {
  description: string;
  supplierId?: string;
  amount: string;
  dueDate: string;
  categoryId?: string;
  costCenterId?: string;
  caseId?: string;
  noDueDate?: boolean;
}) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a pagar não encontrada.");
  await assertFinanceRelationsInOffice(data, officeId);
  const noDueDate = data.noDueDate ?? false;
  const supplierName = await supplierDisplayName(data.supplierId, officeId);
  await prisma.payable.update({
    where: { id },
    data: {
      description: data.description,
      supplierId: data.supplierId || null,
      supplier: supplierName,
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
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) throw new Error("Conta a receber não encontrada.");
  await assertFinanceRelationsInOffice(data, officeId);
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
  supplierId?: string;
  amount: string;
  dueDate: string;
  categoryId?: string;
  costCenterId?: string;
  caseId?: string;
  noDueDate?: boolean;
  installmentCount?: string;
  installmentIntervalDays?: string;
}) {
  const officeId = await requireFinanceOfficeId();
  await assertFinanceRelationsInOffice(data, officeId);
  const noDueDate = data.noDueDate ?? false;
  const count = Math.max(1, parseInt(data.installmentCount || "1") || 1);
  const intervalDays = Math.max(1, parseInt(data.installmentIntervalDays || "30") || 30);
  const groupId = count > 1 ? crypto.randomUUID() : null;
  const baseDate = noDueDate ? firstOfNextMonth() : new Date(data.dueDate);
  const supplierName = await supplierDisplayName(data.supplierId, officeId);

  for (let i = 0; i < count; i++) {
    const dueDate = new Date(baseDate);
    if (!noDueDate) dueDate.setDate(dueDate.getDate() + i * intervalDays);
    const description = count > 1 ? `${data.description} (${i + 1}/${count})` : data.description;
    await prisma.payable.create({
      data: {
        officeId,
        description,
        supplierId: data.supplierId || null,
        supplier: supplierName,
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
    if (count > 1 && !noDueDate) {
      await createInstallmentReminder(officeId, "pagar", description, dueDate, data.caseId);
    }
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
  installmentCount?: string;
  installmentIntervalDays?: string;
}) {
  const officeId = await requireFinanceOfficeId();
  await assertFinanceRelationsInOffice(data, officeId);
  const hasSuccessPortion = !!data.successAmount && parseFloat(data.successAmount) > 0;
  const count = hasSuccessPortion ? 1 : Math.max(1, parseInt(data.installmentCount || "1") || 1);
  const intervalDays = Math.max(1, parseInt(data.installmentIntervalDays || "30") || 30);
  const groupId = hasSuccessPortion || count > 1 ? crypto.randomUUID() : null;
  const baseDate = new Date(data.dueDate);

  for (let i = 0; i < count; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + i * intervalDays);
    const description =
      count > 1 ? `${data.description} (${i + 1}/${count})` : hasSuccessPortion ? `${data.description} (parte agora)` : data.description;
    await prisma.receivable.create({
      data: {
        officeId,
        description,
        amount: parseFloat(data.amount),
        dueDate,
        kind: data.kind,
        categoryId: data.categoryId || null,
        costCenterId: data.costCenterId || null,
        clientId: data.clientId || null,
        caseId: data.caseId || null,
        groupId,
        installmentNumber: count > 1 ? i + 1 : null,
        installmentTotal: count > 1 ? count : null,
      },
    });
    if (count > 1) {
      await createInstallmentReminder(officeId, "receber", description, dueDate, data.caseId);
    }
  }

  if (hasSuccessPortion) {
    await prisma.receivable.create({
      data: {
        officeId,
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

// Quantos meses (mês corrente + à frente) o RecurringFee sempre mantém materializados em
// Receivable — precisa cobrir a janela do Fluxo de Caixa (hoje: 3 meses à frente, ver
// app/(app)/financeiro/fluxo-de-caixa/page.tsx), senão os meses futuros aparecem zerados na
// projeção até o dia em que cada um "chegar" e o cron gerar a linha. Gerando com antecedência,
// a página de projeção não precisa de nenhuma lógica própria de extrapolação — ela já soma linhas
// reais como sempre fez.
const RECURRING_FEE_MONTHS_AHEAD = 4;

function competenciaFor(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// Usa o menor entre o dia configurado e o último dia do mês (evita "31 de fevereiro" virar 3 de
// março sozinho, que é o que Date faz por padrão quando o dia não existe naquele mês).
function dueDateFor(year: number, month0: number, dueDay: number): Date {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(dueDay, daysInMonth));
}

// Cria um honorário "até o arquivamento": diferente do parcelamento comum de createReceivable
// (quantidade fixa, tudo gerado de uma vez), aqui não existe uma quantidade final — o cron diário
// (ensureRecurringFeeReceivables, ver app/api/cron/recurring-fees/route.ts) mantém sempre os
// próximos RECURRING_FEE_MONTHS_AHEAD meses gerados, e para sozinho quando o processo é arquivado.
export async function createRecurringFee(data: {
  description: string;
  amount: string;
  dueDay: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  caseId: string;
}): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  if (!data.caseId) return { error: "Selecione um processo — honorário até o arquivamento precisa de um processo vinculado." };
  await assertFinanceRelationsInOffice(data, officeId);

  await prisma.recurringFee.create({
    data: {
      officeId,
      caseId: data.caseId,
      description: data.description,
      amount: parseFloat(data.amount),
      dueDay: Math.min(28, Math.max(1, parseInt(data.dueDay) || 10)),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
    },
  });
  // Materializa já os próximos meses (não espera o cron rodar amanhã) — a projeção de Fluxo de
  // Caixa reflete o novo honorário recorrente assim que ele é criado.
  await ensureRecurringFeeReceivables();
  revalidateFinance();
  revalidatePath(`/processos/${data.caseId}`);
  return {};
}

// Roda diariamente via cron (app/api/cron/recurring-fees/route.ts) — idempotente: a constraint
// única (recurringFeeId, competencia) em Receivable garante que rodar todo dia em vez de só no
// dia 1 não duplica nada. Também é quem desliga sozinho um RecurringFee cujo processo já foi
// arquivado, sem precisar de nenhum hook em updateCaseStatus.
export async function ensureRecurringFeeReceivables(): Promise<{ created: number; deactivated: number }> {
  const now = new Date();
  const fees = await prisma.recurringFee.findMany({
    where: { active: true },
    include: { case: { select: { status: true, clientId: true } } },
  });

  let created = 0;
  let deactivated = 0;
  for (const fee of fees) {
    if (fee.case.status === "ARQUIVADO") {
      await prisma.recurringFee.update({ where: { id: fee.id }, data: { active: false } });
      deactivated++;
      continue;
    }
    for (let i = 0; i < RECURRING_FEE_MONTHS_AHEAD; i++) {
      const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = target.getFullYear();
      const month0 = target.getMonth();
      const competencia = competenciaFor(year, month0);
      const exists = await prisma.receivable.findUnique({
        where: { recurringFeeId_competencia: { recurringFeeId: fee.id, competencia } },
      });
      if (exists) continue;

      const dueDate = dueDateFor(year, month0, fee.dueDay);
      const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      await prisma.receivable.create({
        data: {
          officeId: fee.officeId,
          description: `${fee.description} — ${monthLabel}`,
          amount: fee.amount,
          dueDate,
          kind: fee.kind,
          categoryId: fee.categoryId,
          costCenterId: fee.costCenterId,
          clientId: fee.case.clientId,
          caseId: fee.caseId,
          recurringFeeId: fee.id,
          competencia,
        },
      });
      created++;
    }
  }

  revalidateFinance();
  return { created, deactivated };
}

// Encerra manualmente um honorário até o arquivamento antes do processo ser arquivado (ex.:
// cliente renegociou, contrato encerrado) — as parcelas já geradas continuam existindo
// normalmente em Contas a Receber, só para de gerar as futuras.
export async function deactivateRecurringFee(id: string): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.recurringFee.findFirst({ where: { id, officeId } });
  if (!existing) return { error: "Honorário recorrente não encontrado." };
  await prisma.recurringFee.update({ where: { id }, data: { active: false } });
  revalidateFinance();
  revalidatePath(`/processos/${existing.caseId}`);
  return {};
}
