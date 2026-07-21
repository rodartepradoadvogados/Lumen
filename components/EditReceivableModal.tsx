"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateReceivable } from "@/lib/actions/financeiro";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { Pencil, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";

type Option = { id: string; name: string };

export default function EditReceivableModal({
  receivable,
  categories,
  cases,
  clients,
  costCenters = [],
}: {
  receivable: {
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    noDueDate: boolean;
    kind: string;
    categoryId: string | null;
    costCenterId: string | null;
    clientId: string | null;
    caseId: string | null;
  };
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters?: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [semVencimento, setSemVencimento] = useState(receivable.noDueDate);

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Editar Conta a Receber</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await updateReceivable(receivable.id, {
                  description: String(formData.get("description")),
                  amount: String(formData.get("amount")),
                  dueDate: String(formData.get("dueDate") || ""),
                  kind: String(formData.get("kind")),
                  categoryId: String(formData.get("categoryId") || ""),
                  costCenterId: String(formData.get("costCenterId") || ""),
                  clientId: String(formData.get("clientId") || ""),
                  caseId: String(formData.get("caseId") || ""),
                  noDueDate: semVencimento,
                });
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição</label>
                <input name="description" defaultValue={receivable.description} required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
                  <input name="amount" type="number" step="0.01" defaultValue={receivable.amount} required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vencimento</label>
                  <input name="dueDate" type="date" defaultValue={receivable.dueDate.slice(0, 10)} required={!semVencimento} disabled={semVencimento} className="fin-input disabled:opacity-40 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
                Sem vencimento definido (aparece na Central de Alertas)
              </label>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo de Honorário</label>
                <select name="kind" defaultValue={receivable.kind} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
                  <option value="HONORARIOS_CONTRATUAIS">Honorários Contratuais</option>
                  <option value="HONORARIOS_SUCUMBENCIAIS">Honorários Sucumbenciais</option>
                  <option value="OUTROS">Outros</option>
                  <option value="REEMBOLSO">Reembolso</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Categoria</label>
                  <EntityPicker name="categoryId" options={categories} defaultValue={receivable.categoryId ?? undefined} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Centro de Custo</label>
                  <EntityPicker
                    name="costCenterId"
                    options={costCenters}
                    defaultValue={receivable.costCenterId ?? undefined}
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
                  defaultValue={receivable.clientId ?? undefined}
                  placeholder="Buscar cliente..."
                  emptyLabel="Nenhum"
                  addLabel="Cadastrar novo cliente"
                  onQuickAdd={createClientQuick}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Processo vinculado</label>
                <EntityPicker
                  name="caseId"
                  options={cases}
                  defaultValue={receivable.caseId ?? undefined}
                  placeholder="Buscar processo..."
                  emptyLabel="Nenhum"
                  addLabel="Cadastrar novo processo"
                  onQuickAdd={(name) => createCaseQuick(name)}
                />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Salvar alterações"}
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
