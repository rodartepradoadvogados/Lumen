import Link from "next/link";
import { Card, Badge, EmptyState, formatCurrency, formatCalendarDate } from "@/components/ui";
import { FinanceStatusBadge } from "@/lib/financeStatus";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import RecurringFeeCard from "@/components/RecurringFeeCard";
import MobileHonorarioLancamentoGroup from "@/components/mobile/MobileHonorarioLancamentoGroup";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import { HandCoins, Receipt } from "lucide-react";

type Option = { id: string; name: string };

type Payment = { amount: number };

type ReceivableRow = {
  id: string;
  description: string;
  amount: number;
  discount: number;
  surcharge: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  payerType: string;
  payerName: string | null;
  honorarioLancamentoId: string | null;
  payments: Payment[];
  // Presente só quando esta receita nasceu como o reembolso de uma despesa — ver Problema 2
  // (autoavaliação Fase 10) e a contraparte em PayablesList.tsx/ReceivablesList.tsx no site.
  reimbursesPayable: { description: string } | null;
};

type PayableRow = {
  id: string;
  description: string;
  amount: number;
  discount: number;
  surcharge: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  payments: Payment[];
  reimbursementReceivable: { amount: number; status: string } | null;
};

// Aba Financeiro do processo, versão mobile — traz o que o dono do produto pediu explicitamente
// ("no financeiro, não consegui lançar o financeiro como é por dentro do site, dentro de um
// processo"): Contas a Receber/Pagar deste processo com selo próprio para A_APURAR/PARCIAL,
// honorário recorrente até o arquivamento, honorários parcelados agrupados, Dar Baixa e o botão
// Lançar Honorários (página inteira própria, ver app/m/processos/[id]/honorarios/page.tsx).
export default function MobileCaseFinanceTab({
  caseId,
  receivables,
  payables,
  recurringFees,
  honorarioLancamentos,
  bankAccounts,
}: {
  caseId: string;
  receivables: ReceivableRow[];
  payables: PayableRow[];
  recurringFees: { id: string; description: string; amount: number; dueDay: number }[];
  honorarioLancamentos: Parameters<typeof MobileHonorarioLancamentoGroup>[0]["lancamento"][];
  bankAccounts: Option[];
}) {
  const soltas = receivables.filter((r) => !r.honorarioLancamentoId);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Link
          href={`/m/processos/${caseId}/honorarios`}
          className="flex-1 flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 transition-colors"
        >
          <HandCoins size={16} /> Lançar Honorários
        </Link>
        <Link
          href={`/m/processos/${caseId}/despesa`}
          className="flex-1 flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 transition-colors"
        >
          <Receipt size={16} /> Lançar Despesa
        </Link>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-regua">
          <h2 className="font-bold text-tx text-sm">Contas a Receber</h2>
        </div>
        {recurringFees.map((fee) => (
          <RecurringFeeCard key={fee.id} fee={fee} />
        ))}
        {honorarioLancamentos.map((h) => (
          <MobileHonorarioLancamentoGroup key={h.id} lancamento={h} bankAccounts={bankAccounts} />
        ))}
        {soltas.length === 0 && honorarioLancamentos.length === 0 && recurringFees.length === 0 ? (
          <EmptyState title="Nenhum lançamento" />
        ) : (
          <div className="divide-y divide-regua">
            {soltas.map((r) => {
              const isApurar = r.status === "A_APURAR";
              const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
              const paidSum = r.payments.reduce((s, x) => s + x.amount, 0);
              const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, paidSum);
              return (
                <div key={r.id} id={`receivable-${r.id}`} className="px-4 py-3 target:bg-acao-bg scroll-mt-20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-tx">{r.description}</p>
                      <p className="text-xs text-tx-2 mt-0.5">
                        {r.noDueDate ? "Sem vencimento" : formatCalendarDate(r.dueDate)}
                        {r.payerType !== "CLIENTE" && (
                          <> · pagador: {r.payerType === "OUTRO" ? r.payerName || "Outro" : r.payerType === "ADVERSA" ? "Parte adversa" : r.payerType}</>
                        )}
                      </p>
                      {r.reimbursesPayable && (
                        <p className="mt-1">
                          <Badge color="gold">↳ Reembolso de despesa · {r.reimbursesPayable.description}</Badge>
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-tx">{isApurar ? "—" : formatCurrency(liquido)}</p>
                      {r.status === "PARCIAL" && <p className="text-[11px] tabular-nums text-tx-2">saldo {formatCurrency(saldo)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <FinanceStatusBadge status={r.status} kind="receivable" />
                  </div>
                  {!isApurar && (
                    <div className="mt-2">
                      <MobileSettleForm id={r.id} kind="receivable" liquido={liquido} alreadyPaid={paidSum} status={r.status} bankAccounts={bankAccounts} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-regua">
          <h2 className="font-bold text-tx text-sm">Contas a Pagar (custas etc.)</h2>
        </div>
        {payables.length === 0 ? (
          <EmptyState title="Nenhum lançamento" />
        ) : (
          <div className="divide-y divide-regua">
            {payables.map((p) => {
              const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
              const paidSum = p.payments.reduce((s, x) => s + x.amount, 0);
              const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, paidSum);
              return (
                <div key={p.id} id={`payable-${p.id}`} className="px-4 py-3 target:bg-acao-bg scroll-mt-20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-tx">{p.description}</p>
                      <p className="text-xs text-tx-2 mt-0.5">{p.noDueDate ? "Sem vencimento" : formatCalendarDate(p.dueDate)}</p>
                      {p.reimbursementReceivable && (
                        <p className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-tx-2">
                          ↳ Reembolso vinculado · {formatCurrency(p.reimbursementReceivable.amount)}
                          <FinanceStatusBadge status={p.reimbursementReceivable.status} kind="receivable" />
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-tx">{formatCurrency(liquido)}</p>
                      {p.status === "PARCIAL" && <p className="text-[11px] tabular-nums text-tx-2">saldo {formatCurrency(saldo)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <FinanceStatusBadge status={p.status} kind="payable" />
                  </div>
                  <div className="mt-2">
                    <MobileSettleForm id={p.id} kind="payable" liquido={liquido} alreadyPaid={paidSum} status={p.status} bankAccounts={bankAccounts} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
