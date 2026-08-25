"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/components/ui";
import SettleButton from "@/components/SettleButton";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import { updateHonorarioLancamentoParcelas, type ParcelaEdicao } from "@/lib/actions/honorarioLancamento";
import { VALUE_TYPE_LABELS, PERCENTUAL_BASE_LABELS, PAYER_TYPE_LABELS, estimatePercentualAmount, type CaseValueBases } from "@/lib/honorarioLancamento";
import { valorLiquido, saldoEmAberto, HONORARIO_LANCAMENTO_DELETE_CONFIRM } from "@/lib/financeCalc";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FinanceStatusBadge } from "@/lib/financeStatus";
import MoneyInput from "@/components/MoneyInput";

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
  paidAmount: number | null;
  valueType: string;
  percentual: number | null;
  percentualBase: string | null;
  vinculadoAoTotal: boolean;
  isSuccessPortion: boolean;
  installmentBoleto: string | null;
  payerType: string;
  payerName: string | null;
  abaterEntrada: boolean;
};

type Lancamento = {
  id: string;
  valorTotalIndicado: number | null;
  payerType: string;
  payerName: string | null;
  parcelas: Parcela[];
};

// Linha editável de uma parcela dentro do formulário "Editar parcelas" — cada uma vira um objeto
// de lib/actions/honorarioLancamento.ts:ParcelaEdicao no submit. Estado local em vez de FormData
// direto porque o número de linhas é dinâmico (adicionar/remover parcela).
type LinhaEdicao = {
  key: string;
  description: string;
  valueType: "FIXO" | "PERCENTUAL";
  amount: string;
  percentual: string;
  percentualBase: string;
  installmentBoleto: string;
  dueDate: string;
  noDueDate: boolean;
  isSuccessPortion: boolean;
  vinculadoAoTotal: boolean;
  // Sem campo próprio neste formulário — só passam de volta pro servidor no submit, pra editar
  // parcela (descrição, vencimento etc.) não apagar silenciosamente a cláusula de abatimento de
  // entrada nem descontos/acréscimos já aplicados (ver ParcelaEdicao em
  // lib/actions/honorarioLancamento.ts).
  abaterEntrada: boolean;
  discount: number;
  surcharge: number;
};

function toLinha(p: Parcela): LinhaEdicao {
  return {
    key: p.id,
    description: p.description,
    valueType: p.valueType === "PERCENTUAL" ? "PERCENTUAL" : "FIXO",
    amount: String(p.amount ?? ""),
    percentual: String(p.percentual ?? ""),
    percentualBase: p.percentualBase ?? "VALOR_CAUSA",
    installmentBoleto: p.installmentBoleto ?? "",
    dueDate: p.dueDate.slice(0, 10),
    noDueDate: p.noDueDate,
    isSuccessPortion: p.isSuccessPortion,
    vinculadoAoTotal: p.vinculadoAoTotal,
    abaterEntrada: p.abaterEntrada,
    discount: p.discount,
    surcharge: p.surcharge,
  };
}

function novaLinha(): LinhaEdicao {
  return {
    key: crypto.randomUUID(),
    description: "",
    valueType: "FIXO",
    amount: "",
    percentual: "",
    percentualBase: "VALOR_CAUSA",
    installmentBoleto: "",
    dueDate: "",
    noDueDate: false,
    isSuccessPortion: false,
    vinculadoAoTotal: true,
    abaterEntrada: false,
    discount: 0,
    surcharge: 0,
  };
}

// Soma o valor efetivo (paidAmount se já pago, senão amount) de toda parcela vinculada ao total
// indicado — é o número comparado com valorTotalIndicado para a nota de divergência. Parcelas
// A_APURAR nunca entram aqui (nascem com vinculadoAoTotal=false, ver Server Action) — de propósito,
// já que amount=0 nelas não representa dinheiro real nenhum ainda.
function somaVinculada(parcelas: { amount: number; paidAmount: number | null; vinculadoAoTotal: boolean }[]): number {
  return parcelas.filter((p) => p.vinculadoAoTotal).reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);
}

function DivergenceNote({ valorTotalIndicado, parcelas }: { valorTotalIndicado: number | null; parcelas: { amount: number; paidAmount: number | null; vinculadoAoTotal: boolean }[] }) {
  if (valorTotalIndicado == null) return null;
  const soma = somaVinculada(parcelas);
  const diff = soma - valorTotalIndicado;
  if (Math.abs(diff) < 0.01) return null;
  return (
    <p className="text-[11px] text-aviso bg-aviso-bg rounded-md px-3 py-1.5 mt-2">
      A soma das parcelas vinculadas ao total ({formatCurrency(soma)}) {diff > 0 ? "excede" : "é menor que"} o valor indicado ({formatCurrency(valorTotalIndicado)}) em {formatCurrency(Math.abs(diff))}.
    </p>
  );
}

export default function HonorarioLancamentoCard({
  lancamento,
  bases,
  bankAccounts = [],
}: {
  lancamento: Lancamento;
  bases: CaseValueBases;
  bankAccounts?: Option[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [valorTotalIndicado, setValorTotalIndicado] = useState(String(lancamento.valorTotalIndicado ?? ""));
  // Editável = parcela que NÃO recebeu nada ainda. PARCIAL entra em `pagas` (a lista só-leitura)
  // junto com PAGO, e não em `linhas`: salvar a edição recria as parcelas no servidor, e recriar
  // uma parcela que já tem FinancePayment apagaria o recebimento em cascata (ver o deleteMany em
  // lib/actions/honorarioLancamento.ts). O status PARCIAL vem de statusPorPagamentos
  // (lib/financeCalc.ts) — antes daqui ele caía no filtro `!== "PAGO"` e era oferecido para
  // edição como se nada tivesse sido recebido.
  const jaRecebeu = (p: { status: string }) => p.status === "PAGO" || p.status === "PARCIAL";
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(() => lancamento.parcelas.filter((p) => !jaRecebeu(p)).map(toLinha));
  const pagas = lancamento.parcelas.filter(jaRecebeu);

  function updateLinha(key: string, patch: Partial<LinhaEdicao>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    setLoading(true);
    setError("");
    const parcelas: ParcelaEdicao[] = linhas.map((l) => ({
      description: l.description,
      valueType: l.valueType,
      amount: l.valueType === "FIXO" ? l.amount : undefined,
      percentual: l.valueType === "PERCENTUAL" ? l.percentual : undefined,
      percentualBase: l.valueType === "PERCENTUAL" ? l.percentualBase : undefined,
      installmentBoleto: l.installmentBoleto || undefined,
      dueDate: l.noDueDate ? undefined : l.dueDate,
      noDueDate: l.noDueDate,
      isSuccessPortion: l.isSuccessPortion,
      vinculadoAoTotal: l.vinculadoAoTotal,
      abaterEntrada: l.abaterEntrada,
      discount: l.discount,
      surcharge: l.surcharge,
    }));
    const result = await updateHonorarioLancamentoParcelas(lancamento.id, { valorTotalIndicado: valorTotalIndicado || undefined, parcelas });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="px-5 py-3 border-b border-regua last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-tx">
            Honorário parcelado{lancamento.valorTotalIndicado != null && <> — total indicado {formatCurrency(lancamento.valorTotalIndicado)}</>}
          </p>
          {lancamento.payerType !== "CLIENTE" && (
            <p className="text-xs text-tx-2">
              Pagador: {lancamento.payerType === "OUTRO" ? lancamento.payerName || "Outro" : PAYER_TYPE_LABELS[lancamento.payerType]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            data-tip="Editar parcelas"
            className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio rounded-md"
          >
            <Pencil size={14} />
          </button>
          <DeleteEntityButton
            entityType="HONORARIO_LANCAMENTO"
            entityId={lancamento.id}
            entityLabel="Honorário parcelado"
            confirmMessage={HONORARIO_LANCAMENTO_DELETE_CONFIRM}
          />
        </div>
      </div>
      <DivergenceNote valorTotalIndicado={lancamento.valorTotalIndicado} parcelas={lancamento.parcelas} />
      <div className="mt-2 space-y-2">
        {lancamento.parcelas.map((p) => {
          const isApurar = p.status === "A_APURAR";
          const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
          const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
          return (
            <div key={p.id} id={`receivable-${p.id}`} className="flex justify-between items-center target:bg-acao-bg scroll-mt-20">
              <div>
                <p className="text-sm text-tx">{p.description}</p>
                <p className="text-xs text-tx-3">
                  {isApurar
                    ? `${p.percentual}% de ${PERCENTUAL_BASE_LABELS[p.percentualBase ?? ""] ?? "base não definida"} — a apurar no desfecho`
                    : p.noDueDate
                      ? "Sem vencimento"
                      : formatDate(p.dueDate)}
                  {!isApurar && p.valueType === "PERCENTUAL" && (
                    <>
                      {" "}
                      — {p.percentual}% de {PERCENTUAL_BASE_LABELS[p.percentualBase ?? ""] ?? "base não definida"} (estimado)
                    </>
                  )}
                  {p.installmentBoleto && <> · boleto {p.installmentBoleto}</>}
                  {!p.vinculadoAoTotal && !isApurar && " — fora do total indicado"}
                  {p.payerType !== "CLIENTE" && (
                    <> · pagador: {p.payerType === "OUTRO" ? p.payerName || "Outro" : PAYER_TYPE_LABELS[p.payerType]}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      p.status === "CANCELADO" ? "line-through text-tx-3" : "text-tx"
                    }`}
                  >
                    {isApurar ? "—" : formatCurrency(liquido)}
                  </p>
                  {p.status === "PARCIAL" && <p className="text-[11px] text-tx-2 tabular-nums">saldo {formatCurrency(saldo)}</p>}
                  <FinanceStatusBadge status={p.status} kind="receivable" />
                </div>
                {!isApurar && (
                  <SettleButton id={p.id} kind="receivable" liquido={liquido} alreadyPaid={p.paidSum} status={p.status} bankAccounts={bankAccounts} />
                )}
                <DeleteEntityButton
                  entityType="RECEIVABLE"
                  entityId={p.id}
                  entityLabel={p.description}
                  confirmMessage={`Excluir a parcela "${p.description}"?`}
                  groupKind="HONORARIO"
                />
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Editar parcelas</h3>
              <button onClick={() => setEditing(false)} className="text-tx-3 hover:text-tx dark:hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}

              {pagas.length > 0 && (
                <div className="p-3 bg-sf-apoio border border-regua">
                  <p className="text-[11px] font-medium text-tx-2 mb-1">Parcelas que já receberam algo (não editáveis)</p>
                  {pagas.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs text-tx-2 py-0.5">
                      <span>
                        {p.description}
                        {p.status === "PARCIAL" && <span className="ml-1.5 text-[10px] font-semibold text-aviso">recebimento parcial</span>}
                      </span>
                      <span className="font-semibold">
                        {formatCurrency(p.paidAmount ?? p.amount)}
                        {p.status === "PARCIAL" && <span className="font-normal text-tx-3"> de {formatCurrency(p.amount)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-tx-2">Valor total indicado (R$)</label>
                <MoneyInput value={valorTotalIndicado} onChange={setValorTotalIndicado} className="fin-input" />
              </div>
              <DivergenceNote
                valorTotalIndicado={valorTotalIndicado ? parseFloat(valorTotalIndicado) : null}
                parcelas={[
                  ...pagas,
                  ...linhas.map((l) => ({
                    amount: l.valueType === "PERCENTUAL" ? estimatePercentualAmount(parseFloat(l.percentual || "0"), l.percentualBase, bases) : parseFloat(l.amount || "0"),
                    paidAmount: null,
                    vinculadoAoTotal: l.vinculadoAoTotal,
                  })),
                ]}
              />

              <div className="space-y-3">
                {linhas.map((l) => (
                  <div key={l.key} className="p-3 bg-sf-apoio border border-regua space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={l.description}
                        onChange={(e) => updateLinha(l.key, { description: e.target.value })}
                        placeholder="Descrição da parcela"
                        className="fin-input flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setLinhas((prev) => prev.filter((x) => x.key !== l.key))}
                        className="p-1.5 text-tx-3 hover:text-atencao"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["FIXO", "PERCENTUAL"] as const).map((vt) => (
                        <button
                          key={vt}
                          type="button"
                          onClick={() => updateLinha(l.key, { valueType: vt })}
                          className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${
                            l.valueType === vt
                              ? "bg-acao text-acao-tx border-acao"
                              : "bg-sf text-tx-2 border-regua-forte"
                          }`}
                        >
                          {VALUE_TYPE_LABELS[vt]}
                        </button>
                      ))}
                    </div>
                    {l.valueType === "FIXO" ? (
                      <MoneyInput
                        value={l.amount}
                        onChange={(v) => updateLinha(l.key, { amount: v })}
                        className="fin-input"
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="%"
                          value={l.percentual}
                          onChange={(e) => updateLinha(l.key, { percentual: e.target.value })}
                          className="fin-input"
                        />
                        <select
                          value={l.percentualBase}
                          onChange={(e) => updateLinha(l.key, { percentualBase: e.target.value })}
                          className="fin-input"
                        >
                          {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <input
                      placeholder="Nº do boleto"
                      value={l.installmentBoleto}
                      onChange={(e) => updateLinha(l.key, { installmentBoleto: e.target.value })}
                      className="fin-input"
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-tx-2">
                        <input type="checkbox" checked={l.noDueDate} onChange={(e) => updateLinha(l.key, { noDueDate: e.target.checked })} />
                        Sem vencimento
                      </label>
                      {!l.noDueDate && (
                        <input
                          type="date"
                          value={l.dueDate}
                          onChange={(e) => updateLinha(l.key, { dueDate: e.target.value })}
                          className="fin-input"
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-tx-2">
                      <input type="checkbox" checked={l.vinculadoAoTotal} onChange={(e) => updateLinha(l.key, { vinculadoAoTotal: e.target.checked })} />
                      Conta no total indicado acima
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLinhas((prev) => [...prev, novaLinha()])}
                className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx"
              >
                <Plus size={14} /> Adicionar parcela
              </button>

              <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 disabled:opacity-50 transition-colors"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; background-color: var(--sf); color: var(--tx); }
        .fin-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </div>
  );
}
