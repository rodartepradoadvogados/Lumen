"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import EditReceivableModal from "@/components/EditReceivableModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import SettleButton from "@/components/SettleButton";
import BulkSettleBar from "@/components/BulkSettleBar";
import { markManyReceivablesPaid } from "@/lib/actions/financeiro";
import { paymentMethodLabels } from "@/lib/paymentMethods";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

const kindLabels: Record<string, string> = {
  HONORARIOS_CONTRATUAIS: "Honorários Contratuais",
  HONORARIOS_SUCUMBENCIAIS: "Honorários Sucumbenciais",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

type Receivable = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  effectiveStatus: string;
  paidAmount: number | null;
  paymentReceiptNumber: string | null;
  paymentMethod: string | null;
  kind: string;
  isSuccessPortion: boolean;
  categoryId: string | null;
  costCenterId: string | null;
  clientId: string | null;
  caseId: string | null;
  category: { name: string } | null;
  costCenter: { name: string } | null;
  case: { title: string } | null;
  client: { name: string } | null;
};

type Option = { id: string; name: string };

export default function ReceivablesList({
  receivables,
  categories,
  cases,
  clients,
  costCenters,
}: {
  receivables: Receivable[];
  categories: Option[];
  cases: Option[];
  clients: Option[];
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

  const selectedItems = receivables.filter((r) => selected.has(r.id));
  const total = selectedItems.reduce((s, r) => s + r.amount, 0);

  if (receivables.length === 0) {
    return <EmptyState title="Nenhuma conta encontrada" />;
  }

  return (
    <div>
      <div className="divide-y divide-navy-800/5">
        {receivables.map((r) => {
          const selectable = r.status !== "PAGO";
          return (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5">
              <div className="shrink-0 flex items-center">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    data-tip="Selecionar para baixa em bloco"
                    className="h-4 w-4 rounded border-navy-800/25 text-emerald-600 focus:ring-emerald-500"
                  />
                ) : (
                  <span className="inline-block w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy-900">{r.description}</p>
                <p className="text-xs text-navy-800/45 mt-0.5">
                  {r.client?.name}
                  {r.case && <span> · {r.case.title}</span>}
                  {r.costCenter && <span> · {r.costCenter.name}</span>}
                  {" · "}
                  {kindLabels[r.kind]}
                  {r.isSuccessPortion && <span> · Êxito</span>}
                  {r.status === "PAGO" && r.paymentMethod && <span> · {paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod}</span>}
                  {r.status === "PAGO" && r.paymentReceiptNumber && <span> · Comprovante: {r.paymentReceiptNumber}</span>}
                </p>
              </div>
              <div className="flex items-center justify-between sm:contents">
                <div className="text-left sm:text-right shrink-0 sm:w-28">
                  <p className="text-sm font-semibold text-navy-900">{formatCurrency(r.amount)}</p>
                  <p className="text-xs text-navy-800/40">{r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}</p>
                </div>
                <div className="shrink-0 sm:w-24">
                  <Badge color={statusColor[r.effectiveStatus]}>{r.effectiveStatus}</Badge>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <SettleButton id={r.id} kind="receivable" amount={r.paidAmount ?? r.amount} status={r.status} />
                <EditReceivableModal
                  receivable={{
                    id: r.id,
                    description: r.description,
                    amount: r.amount,
                    dueDate: r.dueDate,
                    noDueDate: r.noDueDate,
                    kind: r.kind,
                    categoryId: r.categoryId,
                    costCenterId: r.costCenterId,
                    clientId: r.clientId,
                    caseId: r.caseId,
                  }}
                  categories={categories}
                  cases={cases}
                  clients={clients}
                  costCenters={costCenters}
                />
                <DeleteEntityButton entityType="RECEIVABLE" entityId={r.id} entityLabel={r.description} confirmMessage={`Excluir o lançamento "${r.description}"?`} />
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
            await markManyReceivablesPaid([...selected], paidDate, receiptNumber, paymentMethod);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
