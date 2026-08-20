import { formatCurrency, formatCalendarDate, Badge, financeStatusLabel, financeStatusColors } from "@/components/ui";
import { PERCENTUAL_BASE_LABELS, PAYER_TYPE_LABELS } from "@/lib/honorarioLancamento";
import { valorLiquido, saldoEmAberto, HONORARIO_LANCAMENTO_DELETE_CONFIRM } from "@/lib/financeCalc";
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
    <div className="px-4 py-3 border-b border-regua last:border-0">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-tx">
          Honorário parcelado{lancamento.valorTotalIndicado != null && <> — total <span className="tabular-nums">{formatCurrency(lancamento.valorTotalIndicado)}</span></>}
        </p>
        <DeleteEntityButton
          entityType="HONORARIO_LANCAMENTO"
          entityId={lancamento.id}
          entityLabel="Honorário parcelado"
          confirmMessage={HONORARIO_LANCAMENTO_DELETE_CONFIRM}
        />
      </div>
      {lancamento.payerType !== "CLIENTE" && (
        <p className="text-xs text-tx-2 mb-1.5">
          Pagador: {lancamento.payerType === "OUTRO" ? lancamento.payerName || "Outro" : PAYER_TYPE_LABELS[lancamento.payerType]}
        </p>
      )}
      <div className="space-y-2.5">
        {lancamento.parcelas.map((p) => {
          const isApurar = p.status === "A_APURAR";
          const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
          const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
          return (
            <div key={p.id} id={`receivable-${p.id}`} className=" bg-sf-apoio px-3 py-2.5 target:bg-acao-bg scroll-mt-20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-tx">{p.description}</p>
                  <p className="text-[11px] text-tx-2 mt-0.5">
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
                  <p className="text-sm font-semibold tabular-nums text-tx">{isApurar ? "—" : formatCurrency(liquido)}</p>
                  {p.status === "PARCIAL" && <p className="text-[11px] tabular-nums text-tx-2">saldo {formatCurrency(saldo)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <Badge color={financeStatusColors[p.status] ?? "slate"}>{financeStatusLabel(p.status)}</Badge>
                <DeleteEntityButton
                  entityType="RECEIVABLE"
                  entityId={p.id}
                  entityLabel={p.description}
                  confirmMessage={`Excluir a parcela "${p.description}"?`}
                  groupKind="HONORARIO"
                />
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
