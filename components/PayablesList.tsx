"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import EditPayableModal from "@/components/EditPayableModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import SettleButton from "@/components/SettleButton";
import BulkSettleBar from "@/components/BulkSettleBar";
import { markManyPayablesPaid } from "@/lib/actions/financeiro";
import { paymentMethodLabels } from "@/lib/paymentMethods";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

type Payable = {
  id: string;
  description: string;
  supplier: string | null;
  supplierId: string | null;
  amount: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  effectiveStatus: string;
  paidAmount: number | null;
  paymentReceiptNumber: string | null;
  paymentMethod: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  caseId: string | null;
  category: { name: string } | null;
  costCenter: { name: string } | null;
  case: { title: string } | null;
};

type Option = { id: string; name: string };

export default function PayablesList({
  payables,
  categories,
  cases,
  suppliers,
  costCenters,
}: {
  payables: Payable[];
  categories: Option[];
  cases: Option[];
  suppliers: Option[];
  costCenters: Option[];
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
  const total = selectedItems.reduce((s, p) => s + p.amount, 0);

  if (payables.length === 0) {
    return <EmptyState title="Nenhuma conta encontrada" />;
  }

  return (
    <div>
      <div className="divide-y divide-navy-800/5 dark:divide-white/10">
        {payables.map((p) => {
          const selectable = p.status !== "PAGO";
          return (
            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5">
              <div className="shrink-0 flex items-center">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    data-tip="Selecionar para baixa em bloco"
                    className="h-4 w-4 rounded border-navy-800/25 dark:border-white/25 text-emerald-600 focus:ring-emerald-500"
                  />
                ) : (
                  <span className="inline-block w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{p.description}</p>
                <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                  {p.supplier && <span>{p.supplier} · </span>}
                  {p.category?.name}
                  {p.costCenter && <span> · {p.costCenter.name}</span>}
                  {p.case && <span> · {p.case.title}</span>}
                  {p.status === "PAGO" && p.paymentMethod && <span> · {paymentMethodLabels[p.paymentMethod] ?? p.paymentMethod}</span>}
                  {p.status === "PAGO" && p.paymentReceiptNumber && <span> · Comprovante: {p.paymentReceiptNumber}</span>}
                </p>
              </div>
              <div className="flex items-center justify-between sm:contents">
                <div className="text-left sm:text-right shrink-0 sm:w-28">
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}</p>
                </div>
                <div className="shrink-0 sm:w-24">
                  <Badge color={statusColor[p.effectiveStatus]}>{p.effectiveStatus}</Badge>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <SettleButton id={p.id} kind="payable" amount={p.paidAmount ?? p.amount} status={p.status} />
                <EditPayableModal
                  payable={{
                    id: p.id,
                    description: p.description,
                    supplierId: p.supplierId,
                    amount: p.amount,
                    dueDate: p.dueDate,
                    noDueDate: p.noDueDate,
                    categoryId: p.categoryId,
                    costCenterId: p.costCenterId,
                    caseId: p.caseId,
                  }}
                  categories={categories}
                  cases={cases}
                  suppliers={suppliers}
                  costCenters={costCenters}
                />
                <DeleteEntityButton entityType="PAYABLE" entityId={p.id} entityLabel={p.description} confirmMessage={`Excluir o lançamento "${p.description}"?`} />
              </div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <BulkSettleBar
          count={selected.size}
          total={total}
          onClear={() => setSelected(new Set())}
          onConfirm={async (paidDate, receiptNumber, paymentMethod) => {
            await markManyPayablesPaid([...selected], paidDate, receiptNumber, paymentMethod);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
