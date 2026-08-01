import { formatCurrency, formatCalendarDate, Badge } from "@/components/ui";
import { PERCENTUAL_BASE_LABELS, PAYER_TYPE_LABELS } from "@/lib/honorarioLancamento";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import DeleteEntityButton from "@/components/DeleteEntityButton";

type Option = { id: string; name: string };

type Parcela = {
  id: string;
  description: string;
  amount: number;
  discount: number;
  surcharge: number;
  paidSum: number;
  dueDate: string;
  noDueDate: boolean;
  status: string;
  valueType: string;
  percentual: number | null;
  percentualBase: string | null;
  installmentBoleto: string | null;
  payerType: string;
  payerName: string | null;
};

type Lancamento = {
  id: string;
  valorTotalIndicado: number | null;
  payerType: string;
  payerName: string | null;
  parcelas: Parcela[];
};

function statusBadgeColor(status: string): "green" | "red" | "amber" | "slate" {
  if (status === "PAGO") return "green";
  if (status === "ATRASADO") return "red";
  if (status === "A_APURAR") return "slate";
  return "amber";
}

function statusLabel(status: string): string {
  return status === "A_APURAR" ? "A apurar" : status;
}

// Versão mobile (só leitura das parcelas + baixa, sem a edição em massa que
// components/honorarios/HonorarioLancamentoCard.tsx oferece no desktop — aquele arquivo é
// exclusivo do outro agente desta fase, então este componente próprio cobre a parte que o pedido
// do dono do produto realmente pede aqui: ver o lançamento parcelado e dar baixa numa parcela
// pelo celular). Editar o parcelamento inteiro continua sendo tarefa do site.
export default function MobileHonorarioLancamentoGroup({
  lancamento,
  bankAccounts,
}: {
  lancamento: Lancamento;
  bankAccounts: Option[];
}) {
  return (
    <div className="px-4 py-3 border-b border-navy-800/5 dark:border-white/10 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">
          Honorário parcelado{lancamento.valorTotalIndicado != null && <> — total {formatCurrency(lancamento.valorTotalIndicado)}</>}
        </p>
        <DeleteEntityButton
          entityType="HONORARIO_LANCAMENTO"
          entityId={lancamento.id}
          entityLabel="Honorário parcelado"
          confirmMessage="Excluir este lançamento de honorários? Parcelas já pagas continuam em Contas a Receber; as pendentes são apagadas."
        />
      </div>
      {lancamento.payerType !== "CLIENTE" && (
        <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mb-1.5">
          Pagador: {lancamento.payerType === "OUTRO" ? lancamento.payerName || "Outro" : PAYER_TYPE_LABELS[lancamento.payerType]}
        </p>
      )}
      <div className="space-y-2.5">
        {lancamento.parcelas.map((p) => {
          const isApurar = p.status === "A_APURAR";
          const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
          const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
          return (
            <div key={p.id} className="rounded-lg bg-cream-50/60 dark:bg-white/5 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-navy-900 dark:text-cream-50">{p.description}</p>
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                    {isApurar
                      ? `${p.percentual}% de ${PERCENTUAL_BASE_LABELS[p.percentualBase ?? ""] ?? "base não definida"} — a apurar`
                      : p.noDueDate
                        ? "Sem vencimento"
                        : formatCalendarDate(p.dueDate)}
                    {!isApurar && p.valueType === "PERCENTUAL" && (
                      <> · {p.percentual}% de {PERCENTUAL_BASE_LABELS[p.percentualBase ?? ""] ?? "base não definida"}</>
                    )}
                    {p.installmentBoleto && <> · boleto {p.installmentBoleto}</>}
                    {p.payerType !== "CLIENTE" && (
                      <> · pagador: {p.payerType === "OUTRO" ? p.payerName || "Outro" : PAYER_TYPE_LABELS[p.payerType]}</>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{isApurar ? "—" : formatCurrency(liquido)}</p>
                  {p.status === "PARCIAL" && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">saldo {formatCurrency(saldo)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <Badge color={statusBadgeColor(p.status)}>{statusLabel(p.status)}</Badge>
                <DeleteEntityButton entityType="RECEIVABLE" entityId={p.id} entityLabel={p.description} confirmMessage={`Excluir a parcela "${p.description}"?`} />
              </div>
              {!isApurar && (
                <div className="mt-2">
                  <MobileSettleForm id={p.id} kind="receivable" liquido={liquido} alreadyPaid={p.paidSum} status={p.status} bankAccounts={bankAccounts} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
