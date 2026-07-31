"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate, Badge } from "@/components/ui";
import SettleButton from "@/components/SettleButton";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import { updateHonorarioLancamentoParcelas, type ParcelaEdicao } from "@/lib/actions/honorarioLancamento";
import { VALUE_TYPE_LABELS, PERCENTUAL_BASE_LABELS, PAYER_TYPE_LABELS, estimatePercentualAmount, type CaseValueBases } from "@/lib/honorarioLancamento";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { Pencil, Plus, Trash2, X } from "lucide-react";

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
    <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5 mt-2">
      A soma das parcelas vinculadas ao total ({formatCurrency(soma)}) {diff > 0 ? "excede" : "é menor que"} o valor indicado ({formatCurrency(valorTotalIndicado)}) em {formatCurrency(Math.abs(diff))}.
    </p>
  );
}

// PENDENTE/ATRASADO seguem o mesmo tom âmbar de antes; PAGO verde, PARCIAL âmbar também (ainda
// está em aberto, só que parcialmente) e A_APURAR ganha um tom neutro (slate) — não é nem "aberto"
// nem "pago", é uma estimativa sem valor real ainda (ver lib/financeQuery.ts).
function statusBadgeColor(status: string): "green" | "red" | "amber" | "slate" {
  if (status === "PAGO") return "green";
  if (status === "ATRASADO") return "red";
  if (status === "A_APURAR") return "slate";
  return "amber";
}

function statusLabel(status: string): string {
  if (status === "A_APURAR") return "A apurar";
  return status;
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
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(() => lancamento.parcelas.filter((p) => p.status !== "PAGO").map(toLinha));
  const pagas = lancamento.parcelas.filter((p) => p.status === "PAGO");

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
    <div className="px-5 py-3 border-b border-navy-800/5 dark:border-white/10 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">
            Honorário parcelado{lancamento.valorTotalIndicado != null && <> — total indicado {formatCurrency(lancamento.valorTotalIndicado)}</>}
          </p>
          {lancamento.payerType !== "CLIENTE" && (
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50">
              Pagador: {lancamento.payerType === "OUTRO" ? lancamento.payerName || "Outro" : PAYER_TYPE_LABELS[lancamento.payerType]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            data-tip="Editar parcelas"
            className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10"
          >
            <Pencil size={14} />
          </button>
          <DeleteEntityButton
            entityType="HONORARIO_LANCAMENTO"
            entityId={lancamento.id}
            entityLabel="Honorário parcelado"
            confirmMessage="Excluir este lançamento de honorários? Parcelas já pagas continuam em Contas a Receber; as pendentes são apagadas."
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
            <div key={p.id} className="flex justify-between items-center">
              <div>
                <p className="text-sm text-navy-900 dark:text-cream-50">{p.description}</p>
                <p className="text-xs text-navy-800/40 dark:text-cream-50/40">
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
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{isApurar ? "—" : formatCurrency(liquido)}</p>
                  {p.status === "PARCIAL" && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">saldo {formatCurrency(saldo)}</p>}
                  <Badge color={statusBadgeColor(p.status)}>{statusLabel(p.status)}</Badge>
                </div>
                {!isApurar && (
                  <SettleButton id={p.id} kind="receivable" liquido={liquido} alreadyPaid={p.paidSum} status={p.status} bankAccounts={bankAccounts} />
                )}
                <DeleteEntityButton entityType="RECEIVABLE" entityId={p.id} entityLabel={p.description} confirmMessage={`Excluir a parcela "${p.description}"?`} />
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Editar parcelas</h3>
              <button onClick={() => setEditing(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

              {pagas.length > 0 && (
                <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10">
                  <p className="text-[11px] font-medium text-navy-800/50 dark:text-cream-50/50 mb-1">Parcelas já pagas (não editáveis)</p>
                  {pagas.map((p) => (
                    <div key={p.id} className="flex justify-between text-xs text-navy-800/70 dark:text-cream-50/70 py-0.5">
                      <span>{p.description}</span>
                      <span className="font-semibold">{formatCurrency(p.paidAmount ?? p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor total indicado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={valorTotalIndicado}
                  onChange={(e) => setValorTotalIndicado(e.target.value)}
                  className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                />
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
                  <div key={l.key} className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={l.description}
                        onChange={(e) => updateLinha(l.key, { description: e.target.value })}
                        placeholder="Descrição da parcela"
                        className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setLinhas((prev) => prev.filter((x) => x.key !== l.key))}
                        className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400"
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
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            l.valueType === vt
                              ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                              : "bg-white dark:bg-navy-900 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15"
                          }`}
                        >
                          {VALUE_TYPE_LABELS[vt]}
                        </button>
                      ))}
                    </div>
                    {l.valueType === "FIXO" ? (
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Valor (R$)"
                        value={l.amount}
                        onChange={(e) => updateLinha(l.key, { amount: e.target.value })}
                        className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="%"
                          value={l.percentual}
                          onChange={(e) => updateLinha(l.key, { percentual: e.target.value })}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                        />
                        <select
                          value={l.percentualBase}
                          onChange={(e) => updateLinha(l.key, { percentualBase: e.target.value })}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
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
                      className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-navy-800/70 dark:text-cream-50/70">
                        <input type="checkbox" checked={l.noDueDate} onChange={(e) => updateLinha(l.key, { noDueDate: e.target.checked })} />
                        Sem vencimento
                      </label>
                      {!l.noDueDate && (
                        <input
                          type="date"
                          value={l.dueDate}
                          onChange={(e) => updateLinha(l.key, { dueDate: e.target.value })}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-navy-800/70 dark:text-cream-50/70">
                      <input type="checkbox" checked={l.vinculadoAoTotal} onChange={(e) => updateLinha(l.key, { vinculadoAoTotal: e.target.checked })} />
                      Conta no total indicado acima
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLinhas((prev) => [...prev, novaLinha()])}
                className="flex items-center gap-1.5 text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50"
              >
                <Plus size={14} /> Adicionar parcela
              </button>

              <button
                onClick={handleSave}
                disabled={loading}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .fin-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </div>
  );
}
