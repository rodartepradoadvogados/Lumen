"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, formatCurrency, formatDate } from "@/components/ui";
import EditPayableModal from "@/components/EditPayableModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import SettleButton from "@/components/SettleButton";
import BulkSettleBar from "@/components/BulkSettleBar";
import { markManyPayablesPaid } from "@/lib/actions/financeiro";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { financeGroupKind } from "@/lib/financeGroupKind";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/honorarioLancamento";
import { FinanceStatusBadge } from "@/lib/financeStatus";

const documentTypeLabels: Record<string, string> = Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

type Payable = {
  id: string;
  description: string;
  supplier: string | null;
  supplierId: string | null;
  // Pago a um membro da equipe em vez de a um Fornecedor — ver Payable.payeeUserId.
  payeeUserId: string | null;
  amount: number;
  discount: number;
  surcharge: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  effectiveStatus: string;
  paidAmount: number | null;
  paidDate: string | null;
  paidSum: number;
  paymentReceiptNumber: string | null;
  paymentMethod: string | null;
  documentType: string | null;
  documentNumber: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  caseId: string | null;
  responsibleId: string | null;
  issueDate: string | null;
  installmentBoleto: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  groupId: string | null;
  // Despesa recorrente sem data de fim (ver RecurringExpense, prisma/schema.prisma) — usado por
  // financeGroupKind para o mesmo agrupamento visual "RECORRENTE" do honorário até o arquivamento.
  recurringExpenseId: string | null;
  category: { name: string } | null;
  costCenter: { name: string } | null;
  case: { title: string } | null;
  // ---- Despesas do Processo (Fase 10) — ver lib/despesaProcesso.ts ----
  kind: string;
  expensePayer: string;
  // Presente só quando esta despesa já tem um reembolso vinculado — ver
  // Payable.reimbursementReceivable em prisma/schema.prisma.
  reimbursementReceivable: { id: string; amount: number; status: string } | null;
  // Comprovante de pagamento (ver Payable.receiptDriveUrl/receiptFileName, lib/financeReceiptNaming.ts).
  receiptDriveUrl: string | null;
  receiptFileName: string | null;
};

type Option = { id: string; name: string };

export default function PayablesList({
  payables,
  categories,
  cases,
  suppliers,
  costCenters,
  responsibles = [],
  bankAccounts = [],
  teamMembers = [],
}: {
  payables: Payable[];
  categories: Option[];
  cases: Option[];
  suppliers: Option[];
  costCenters: Option[];
  responsibles?: Option[];
  bankAccounts?: Option[];
  // Pago a um membro da equipe (ver Payable.payeeUserId/EditPayableModal.tsx) — mesma lista de
  // usuários ativos do escritório usada em `responsibles`, passada solta pra deixar explícito
  // que os dois papéis (quem lançou vs. quem é pago) podem divergir.
  teamMembers?: Option[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = payables.filter((p) => selected.has(p.id));
  // Soma líquida (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = selectedItems.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);

  if (payables.length === 0) {
    return <EmptyState title="Nenhuma conta encontrada" />;
  }

  return (
    <div>
      <div className="divide-y divide-regua">
        {payables.map((p) => {
          const selectable = p.status !== "PAGO";
          const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
          const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
          return (
            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5">
              <div className="shrink-0 flex items-center">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    data-tip="Selecionar para baixa em bloco"
                    className="h-4 w-4 rounded border-regua-forte focus:ring-acao"
                  />
                ) : (
                  <span className="inline-block w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tx">{p.description}</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  {p.supplier && <span>{p.supplier} · </span>}
                  {p.category?.name}
                  {p.costCenter && <span> · {p.costCenter.name}</span>}
                  {p.case && <span> · {p.case.title}</span>}
                  {p.documentType && <span> · {documentTypeLabels[p.documentType] ?? p.documentType}{p.documentNumber && ` ${p.documentNumber}`}</span>}
                  {p.status === "PAGO" && p.paymentMethod && <span> · {paymentMethodLabels[p.paymentMethod] ?? p.paymentMethod}</span>}
                  {p.status === "PAGO" && p.paymentReceiptNumber && <span> · Comprovante: {p.paymentReceiptNumber}</span>}
                </p>
                {/* Problema 2 (autoavaliação Fase 10) — sem isto, nada na lista denunciava que esta
                    despesa já tinha um reembolso vinculado, abrindo espaço para duplicar por engano. */}
                {p.reimbursementReceivable && (
                  <p className="text-[11px] text-tx-2 mt-1 flex items-center gap-1.5">
                    ↳ Reembolso vinculado · {formatCurrency(p.reimbursementReceivable.amount)}
                    <FinanceStatusBadge status={p.reimbursementReceivable.status} />
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between sm:contents">
                <div className="text-left sm:text-right shrink-0 sm:w-32">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      p.effectiveStatus === "CANCELADO" ? "line-through text-tx-3" : "text-tx"
                    }`}
                  >
                    {formatCurrency(liquido)}
                  </p>
                  {p.effectiveStatus === "PARCIAL" && (
                    <p className="text-[11px] text-tx-2 tabular-nums">saldo {formatCurrency(saldo)}</p>
                  )}
                  <p className="text-xs text-tx-3">{p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}</p>
                </div>
                <div className="shrink-0 sm:w-24">
                  <FinanceStatusBadge status={p.effectiveStatus} />
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <SettleButton
                  id={p.id}
                  kind="payable"
                  liquido={liquido}
                  alreadyPaid={p.paidSum}
                  status={p.status}
                  bankAccounts={bankAccounts}
                  existingReceiptUrl={p.receiptDriveUrl}
                  existingReceiptName={p.receiptFileName}
                />
                <EditPayableModal
                  payable={{
                    id: p.id,
                    description: p.description,
                    supplierId: p.supplierId,
                    payeeUserId: p.payeeUserId,
                    amount: p.amount,
                    discount: p.discount,
                    surcharge: p.surcharge,
                    dueDate: p.dueDate,
                    noDueDate: p.noDueDate,
                    categoryId: p.categoryId,
                    costCenterId: p.costCenterId,
                    caseId: p.caseId,
                    responsibleId: p.responsibleId,
                    documentType: p.documentType,
                    documentNumber: p.documentNumber,
                    issueDate: p.issueDate,
                    installmentBoleto: p.installmentBoleto,
                    installmentNumber: p.installmentNumber,
                    installmentTotal: p.installmentTotal,
                    status: p.status,
                    paidAmount: p.paidAmount,
                    paidDate: p.paidDate,
                    paymentMethod: p.paymentMethod,
                    paymentReceiptNumber: p.paymentReceiptNumber,
                    kind: p.kind,
                    expensePayer: p.expensePayer,
                    reimbursementReceivable: p.reimbursementReceivable,
                    receiptDriveUrl: p.receiptDriveUrl,
                    receiptFileName: p.receiptFileName,
                  }}
                  categories={categories}
                  cases={cases}
                  suppliers={suppliers}
                  teamMembers={teamMembers}
                  costCenters={costCenters}
                  responsibles={responsibles}
                />
                <DeleteEntityButton
                  entityType="PAYABLE"
                  entityId={p.id}
                  entityLabel={p.description}
                  confirmMessage={`Excluir o lançamento "${p.description}"?`}
                  groupKind={financeGroupKind(p)}
                  linkedReimbursement={
                    p.reimbursementReceivable
                      ? { direction: "payableHasReimbursement", amount: p.reimbursementReceivable.amount, status: p.reimbursementReceivable.status }
                      : null
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <BulkSettleBar
          count={selected.size}
          total={total}
          bankAccounts={bankAccounts}
          onClear={() => setSelected(new Set())}
          onConfirm={async (paidDate, receiptNumber, paymentMethod, bankAccountId) => {
            await markManyPayablesPaid([...selected], paidDate, receiptNumber, paymentMethod, bankAccountId);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
