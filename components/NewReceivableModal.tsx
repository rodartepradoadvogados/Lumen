"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceivable } from "@/lib/actions/financeiro";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";

type Option = { id: string; name: string };

export default function NewReceivableModal({
  categories,
  cases,
  clients,
  costCenters = [],
  defaultCaseId,
  defaultClientId,
  label,
  alreadyReceivedForCase,
}: {
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters?: Option[];
  defaultCaseId?: string;
  defaultClientId?: string;
  label?: string;
  alreadyReceivedForCase?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState(false);
  const [parcelar, setParcelar] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {label ?? "Nova Conta a Receber"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">{label ?? "Nova Conta a Receber"}</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await createReceivable({
                  description: String(formData.get("description")),
                  amount: String(formData.get("amount")),
                  dueDate: String(formData.get("dueDate")),
                  kind: String(formData.get("kind")),
                  categoryId: String(formData.get("categoryId") || ""),
                  costCenterId: String(formData.get("costCenterId") || ""),
                  clientId: String(formData.get("clientId") || ""),
                  caseId: String(formData.get("caseId") || ""),
                  successAmount: splitSuccess ? String(formData.get("successAmount") || "") : undefined,
                  installmentCount: parcelar ? String(formData.get("installmentCount") || "1") : "1",
                  installmentIntervalDays: parcelar ? String(formData.get("installmentIntervalDays") || "30") : "30",
                });
                setLoading(false);
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
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição</label>
                <input name="description" required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" placeholder="Ex: Honorários contratuais - parcela 1/6" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">{splitSuccess ? "Valor a receber agora (R$)" : parcelar ? "Valor de cada parcela (R$)" : "Valor (R$)"}</label>
                  <input name="amount" type="number" step="0.01" required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">{parcelar ? "1º Vencimento" : "Vencimento (parte de agora)"}</label>
                  <input name="dueDate" type="date" required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                </div>
              </div>

              {!splitSuccess && (
                <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                  <input type="checkbox" checked={parcelar} onChange={(e) => setParcelar(e.target.checked)} />
                  Recebimento recorrente (parcelado)
                </label>
              )}

              {parcelar && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Quantidade de parcelas</label>
                    <input name="installmentCount" type="number" min="2" defaultValue="2" className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Intervalo entre parcelas (dias)</label>
                    <input name="installmentIntervalDays" type="number" min="1" defaultValue="30" className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                  </div>
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 sm:col-span-2">Cada parcela é lançada em Contas a Receber e também gera um lembrete de vencimento na Agenda/Kanban.</p>
                </div>
              )}

              {!parcelar && (
                <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                  <input type="checkbox" checked={splitSuccess} onChange={(e) => setSplitSuccess(e.target.checked)} />
                  Dividir: parte agora + parte no êxito (sem vencimento definido)
                </label>
              )}

              {splitSuccess && (
                <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10">
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor a receber no êxito (R$)</label>
                  <input name="successAmount" type="number" step="0.01" className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Fica sem vencimento e aparece na Central de Alertas para acompanhamento.</p>
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
              {!defaultCaseId && (
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Processo vinculado (opcional)</label>
                  <EntityPicker
                    name="caseId"
                    options={cases}
                    placeholder="Buscar processo..."
                    emptyLabel="Nenhum"
                    addLabel="Cadastrar novo processo"
                    onQuickAdd={(name) => createCaseQuick(name)}
                  />
                </div>
              )}
              {defaultCaseId && <input type="hidden" name="caseId" value={defaultCaseId} />}
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
