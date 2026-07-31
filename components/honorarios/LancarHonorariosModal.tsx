"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHonorarioLancamento } from "@/lib/actions/honorarioLancamento";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { PERCENTUAL_BASE_LABELS, VALUE_TYPE_LABELS, estimatePercentualAmount, type CaseValueBases } from "@/lib/honorarioLancamento";
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";

type Option = { id: string; name: string };
type ValueType = "FIXO" | "PERCENTUAL";
type Modo = "unico" | "parcelado";

function ValueTypeToggle({ value, onChange }: { value: ValueType; onChange: (v: ValueType) => void }) {
  return (
    <div className="flex gap-2">
      {(["FIXO", "PERCENTUAL"] as const).map((vt) => (
        <button
          key={vt}
          type="button"
          onClick={() => onChange(vt)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            value === vt
              ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
              : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
          }`}
        >
          {VALUE_TYPE_LABELS[vt]}
        </button>
      ))}
    </div>
  );
}

export default function LancarHonorariosModal({
  categories,
  clients,
  costCenters = [],
  defaultCaseId,
  defaultClientId,
  bases,
  alreadyReceivedForCase,
}: {
  categories: Option[];
  clients: Option[];
  costCenters?: Option[];
  defaultCaseId: string;
  defaultClientId?: string;
  bases: CaseValueBases;
  alreadyReceivedForCase?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modo, setModo] = useState<Modo>("unico");
  const [valueType, setValueType] = useState<ValueType>("FIXO");
  const [percentual, setPercentual] = useState("");
  const [percentualBase, setPercentualBase] = useState("VALOR_CAUSA");
  const [semVencimento, setSemVencimento] = useState(false);
  const [exitoValueType, setExitoValueType] = useState<ValueType>("PERCENTUAL");
  const [exitoPercentual, setExitoPercentual] = useState("");
  const [exitoPercentualBase, setExitoPercentualBase] = useState("VALOR_CAUSA");
  const [exitoVinculado, setExitoVinculado] = useState(false);

  const estimativa = estimatePercentualAmount(parseFloat(percentual || "0"), percentualBase, bases);
  const exitoEstimativa = estimatePercentualAmount(parseFloat(exitoPercentual || "0"), exitoPercentualBase, bases);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> Lançar Honorários
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Lançar Honorários</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                const description = String(formData.get("description"));
                const kind = String(formData.get("kind"));
                const categoryId = String(formData.get("categoryId") || "");
                const costCenterId = String(formData.get("costCenterId") || "");
                const clientId = String(formData.get("clientId") || "");

                const result = await createHonorarioLancamento({
                  description,
                  kind,
                  categoryId,
                  costCenterId,
                  clientId,
                  caseId: defaultCaseId,
                  modo,
                  valueType: modo === "unico" ? valueType : undefined,
                  amount: modo === "unico" && valueType === "FIXO" ? String(formData.get("amount") || "") : undefined,
                  dueDate: modo === "unico" ? (semVencimento ? undefined : String(formData.get("dueDate") || "")) : undefined,
                  percentual: modo === "unico" && valueType === "PERCENTUAL" ? percentual : undefined,
                  percentualBase: modo === "unico" && valueType === "PERCENTUAL" ? percentualBase : undefined,
                  valorTotalIndicado: modo === "parcelado" ? String(formData.get("valorTotalIndicado") || "") : undefined,
                  entradaAmount: modo === "parcelado" ? String(formData.get("entradaAmount") || "") : undefined,
                  entradaDueDate: modo === "parcelado" ? String(formData.get("entradaDueDate") || "") : undefined,
                  exito:
                    modo === "parcelado"
                      ? exitoValueType === "FIXO"
                        ? { valueType: "FIXO", amount: String(formData.get("exitoAmount") || ""), vinculadoAoTotal: exitoVinculado }
                        : { valueType: "PERCENTUAL", percentual: exitoPercentual, percentualBase: exitoPercentualBase, vinculadoAoTotal: exitoVinculado }
                      : undefined,
                });
                setLoading(false);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              {alreadyReceivedForCase !== undefined && (
                <p className="text-xs text-navy-800/50 dark:text-cream-50/50 bg-cream-50 dark:bg-navy-800 rounded-lg px-3 py-2">
                  Já recebido neste processo: <span className="font-semibold text-navy-900 dark:text-cream-50">{alreadyReceivedForCase.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </p>
              )}
              {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição</label>
                <input name="description" required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" placeholder="Ex: Honorários contratuais" />
              </div>

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Forma de lançamento</label>
                <div className="flex gap-2 mt-1">
                  {(
                    [
                      { value: "unico" as const, label: "Único" },
                      { value: "parcelado" as const, label: "Parcelado (entrada + êxito)" },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setModo(opt.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        modo === opt.value
                          ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                          : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {modo === "unico" && (
                <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo de valor</label>
                  <ValueTypeToggle value={valueType} onChange={setValueType} />
                  {valueType === "FIXO" ? (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
                      <input name="amount" type="number" step="0.01" required className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Percentual (%)</label>
                        <input type="number" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Base</label>
                        <select value={percentualBase} onChange={(e) => setPercentualBase(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50">
                          {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 col-span-2">Estimativa atual: {estimativa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (recalculada na baixa, com o valor real recebido)</p>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                    <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
                    Sem vencimento definido
                  </label>
                  {!semVencimento && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vencimento</label>
                      <input name="dueDate" type="date" required={!semVencimento} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                    </div>
                  )}
                </div>
              )}

              {modo === "parcelado" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10">
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor total dos honorários indicado (R$)</label>
                    <input name="valorTotalIndicado" type="number" step="0.01" className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Usado só para avisar se a soma das parcelas vinculadas divergir deste valor mais tarde.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
                    <p className="text-xs font-semibold text-navy-800/70 dark:text-cream-50/70">Entrada (dinheiro)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
                        <input name="entradaAmount" type="number" step="0.01" required className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vencimento</label>
                        <input name="entradaDueDate" type="date" required className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
                    <p className="text-xs font-semibold text-navy-800/70 dark:text-cream-50/70">Restante no êxito</p>
                    <ValueTypeToggle value={exitoValueType} onChange={setExitoValueType} />
                    {exitoValueType === "FIXO" ? (
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
                        <input name="exitoAmount" type="number" step="0.01" required className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Percentual (%)</label>
                          <input type="number" step="0.01" value={exitoPercentual} onChange={(e) => setExitoPercentual(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Base</label>
                          <select value={exitoPercentualBase} onChange={(e) => setExitoPercentualBase(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50">
                            {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 col-span-2">Estimativa atual: {exitoEstimativa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (recalculada na baixa, com o valor real recebido)</p>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                      <input type="checkbox" checked={exitoVinculado} onChange={(e) => setExitoVinculado(e.target.checked)} />
                      Este valor conta no total indicado acima
                    </label>
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Fica sem vencimento definido e aparece na Central de Alertas para acompanhamento.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo de Honorário</label>
                <select name="kind" className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
                  <option value="HONORARIOS_CONTRATUAIS">Honorários Contratuais</option>
                  <option value="HONORARIOS_SUCUMBENCIAIS">Honorários Sucumbenciais</option>
                  <option value="OUTROS">Outros</option>
                  <option value="REEMBOLSO">Reembolso</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Categoria</label>
                  <EntityPicker name="categoryId" options={categories} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Centro de Custo</label>
                  <EntityPicker
                    name="costCenterId"
                    options={costCenters}
                    placeholder="Buscar centro de custo..."
                    emptyLabel="Nenhum"
                    addLabel="Cadastrar novo centro de custo"
                    onQuickAdd={createCostCenterQuick}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Cliente</label>
                <EntityPicker
                  name="clientId"
                  options={clients}
                  defaultValue={defaultClientId}
                  placeholder="Buscar cliente..."
                  emptyLabel="Nenhum"
                  addLabel="Cadastrar novo cliente"
                  onQuickAdd={createClientQuick}
                />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Criar"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .fin-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
