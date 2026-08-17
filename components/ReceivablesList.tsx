"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, formatCurrency, formatDate } from "@/components/ui";
import EditReceivableModal from "@/components/EditReceivableModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import SettleButton from "@/components/SettleButton";
import BulkSettleBar from "@/components/BulkSettleBar";
import { markManyReceivablesPaid } from "@/lib/actions/financeiro";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { financeGroupKind } from "@/lib/financeGroupKind";
import { DOCUMENT_TYPE_OPTIONS, PAYER_TYPE_LABELS, PERCENTUAL_BASE_LABELS, RECEIVABLE_KIND_LABELS } from "@/lib/honorarioLancamento";
import { FinanceStatusBadge } from "@/lib/financeStatus";

const documentTypeLabels: Record<string, string> = Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const kindLabels = RECEIVABLE_KIND_LABELS;

type Receivable = {
  id: string;
  description: string;
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
  kind: string;
  isSuccessPortion: boolean;
  documentType: string | null;
  documentNumber: string | null;
  payerType: string;
  payerName: string | null;
  percentual: number | null;
  percentualBase: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  clientId: string | null;
  caseId: string | null;
  responsibleId: string | null;
  issueDate: string | null;
  installmentBoleto: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  groupId: string | null;
  honorarioLancamentoId: string | null;
  recurringFeeId: string | null;
  category: { name: string } | null;
  costCenter: { name: string } | null;
  case: { title: string } | null;
  client: { name: string } | null;
  // Presente só quando esta receita NASCEU como o reembolso de uma despesa (kind "REEMBOLSO") —
  // ver Receivable.reimbursesPayableId em prisma/schema.prisma.
  reimbursesPayable: { id: string; description: string } | null;
  // Comprovante de recebimento (ver Receivable.receiptDriveUrl/receiptFileName).
  receiptDriveUrl: string | null;
  receiptFileName: string | null;
};

type Option = { id: string; name: string };

export default function ReceivablesList({
  receivables,
  categories,
  cases,
  clients,
  costCenters,
  responsibles = [],
  bankAccounts = [],
}: {
  receivables: Receivable[];
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters: Option[];
  responsibles?: Option[];
  bankAccounts?: Option[];
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

  const selectedItems = receivables.filter((r) => selected.has(r.id));
  // Soma líquida (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = selectedItems.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);

  if (receivables.length === 0) {
    return <EmptyState title="Nenhuma conta encontrada" />;
  }

  return (
    <div>
      <div className="divide-y divide-regua">
        {receivables.map((r) => {
          const isApurar = r.effectiveStatus === "A_APURAR";
          const selectable = r.status !== "PAGO" && !isApurar;
          const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
          const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, r.paidSum);
          return (
            <div key={r.id} id={`receivable-${r.id}`} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5 target:bg-acao-bg scroll-mt-20">
              <div className="shrink-0 flex items-center">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    data-tip="Selecionar para baixa em bloco"
                    className="h-4 w-4 rounded border-regua-forte text-emerald-600 focus:ring-emerald-500"
                  />
                ) : (
                  <span className="inline-block w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-tx">{r.description}</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  {r.client?.name}
                  {r.case && <span> · {r.case.title}</span>}
                  {r.costCenter && <span> · {r.costCenter.name}</span>}
                  {" · "}
                  {kindLabels[r.kind] ?? r.kind}
                  {r.isSuccessPortion && <span> · Êxito</span>}
                  {r.payerType !== "CLIENTE" && (
                    <span> · pagador: {r.payerType === "OUTRO" ? r.payerName || "Outro" : PAYER_TYPE_LABELS[r.payerType]}</span>
                  )}
                  {r.documentType && <span> · {documentTypeLabels[r.documentType] ?? r.documentType}{r.documentNumber && ` ${r.documentNumber}`}</span>}
                  {r.status === "PAGO" && r.paymentMethod && <span> · {paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod}</span>}
                  {r.status === "PAGO" && r.paymentReceiptNumber && <span> · Comprovante: {r.paymentReceiptNumber}</span>}
                </p>
                {isApurar && (
                  <p className="text-[11px] text-tx-3 mt-0.5">
                    {r.percentual}% de {PERCENTUAL_BASE_LABELS[r.percentualBase ?? ""] ?? "base não definida"} — regra a apurar no desfecho do processo
                  </p>
                )}
                {/* Problema 2 (autoavaliação Fase 10) — contraparte do badge de PayablesList.tsx:
                    sem isto, nada denunciava que esta receita já era o reembolso de uma despesa. */}
                {r.reimbursesPayable && (
                  <p className="text-[11px] text-tx-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-marca-bg text-marca-tx">
                      ↳ Reembolso de despesa · {r.reimbursesPayable.description}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between sm:contents">
                <div className="text-left sm:text-right shrink-0 sm:w-32">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      r.effectiveStatus === "CANCELADO" ? "line-through text-tx-3" : "text-tx"
                    }`}
                  >
                    {isApurar ? "—" : formatCurrency(liquido)}
                  </p>
                  {r.effectiveStatus === "PARCIAL" && (
                    <p className="text-[11px] text-tx-2 tabular-nums">saldo {formatCurrency(saldo)}</p>
                  )}
                  <p className="text-xs text-tx-3">{r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}</p>
                </div>
                <div className="shrink-0 sm:w-24">
                  <FinanceStatusBadge status={r.effectiveStatus} />
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {!isApurar && (
                  <SettleButton
                    id={r.id}
                    kind="receivable"
                    liquido={liquido}
                    alreadyPaid={r.paidSum}
                    status={r.status}
                    bankAccounts={bankAccounts}
                    existingReceiptUrl={r.receiptDriveUrl}
                    existingReceiptName={r.receiptFileName}
                  />
                )}
                <EditReceivableModal
                  receivable={{
                    id: r.id,
                    description: r.description,
                    amount: r.amount,
                    discount: r.discount,
                    surcharge: r.surcharge,
                    dueDate: r.dueDate,
                    noDueDate: r.noDueDate,
                    kind: r.kind,
                    categoryId: r.categoryId,
                    costCenterId: r.costCenterId,
                    clientId: r.clientId,
                    caseId: r.caseId,
                    responsibleId: r.responsibleId,
                    documentType: r.documentType,
                    documentNumber: r.documentNumber,
                    issueDate: r.issueDate,
                    installmentBoleto: r.installmentBoleto,
                    installmentNumber: r.installmentNumber,
                    installmentTotal: r.installmentTotal,
                    status: r.status,
                    paidAmount: r.paidAmount,
                    paidDate: r.paidDate,
                    paymentMethod: r.paymentMethod,
                    paymentReceiptNumber: r.paymentReceiptNumber,
                    receiptDriveUrl: r.receiptDriveUrl,
                    receiptFileName: r.receiptFileName,
                  }}
                  categories={categories}
                  cases={cases}
                  clients={clients}
                  costCenters={costCenters}
                  responsibles={responsibles}
                />
                <DeleteEntityButton
                  entityType="RECEIVABLE"
                  entityId={r.id}
                  entityLabel={r.description}
                  confirmMessage={`Excluir o lançamento "${r.description}"?`}
                  groupKind={financeGroupKind(r)}
                  linkedReimbursement={
                    r.reimbursesPayable ? { direction: "receivableReimbursesPayable", description: r.reimbursesPayable.description } : null
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
            await markManyReceivablesPaid([...selected], paidDate, receiptNumber, paymentMethod, bankAccountId);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
