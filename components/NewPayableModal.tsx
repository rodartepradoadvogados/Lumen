"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayable } from "@/lib/actions/financeiro";
import { createCaseQuick } from "@/lib/actions/cases";
import { createSupplierQuick } from "@/lib/actions/suppliers";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";

type Option = { id: string; name: string };

export default function NewPayableModal({
  categories,
  cases,
  suppliers,
  costCenters = [],
}: {
  categories: Option[];
  cases: Option[];
  suppliers: Option[];
  costCenters?: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parcelar, setParcelar] = useState(false);
  const [semVencimento, setSemVencimento] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> Nova Conta a Pagar
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Nova Conta a Pagar</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await createPayable({
                  description: String(formData.get("description")),
                  supplierId: String(formData.get("supplierId") || ""),
                  amount: String(formData.get("amount")),
                  dueDate: String(formData.get("dueDate") || ""),
                  categoryId: String(formData.get("categoryId") || ""),
                  costCenterId: String(formData.get("costCenterId") || ""),
                  caseId: String(formData.get("caseId") || ""),
                  noDueDate: semVencimento,
                  installmentCount: parcelar ? String(formData.get("installmentCount") || "1") : "1",
                  installmentIntervalDays: parcelar ? String(formData.get("installmentIntervalDays") || "30") : "30",
                });
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60">Descrição</label>
                <input name="description" required className="fin-input" placeholder="Ex: Aluguel escritório" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">{parcelar ? "Valor de cada parcela (R$)" : "Valor (R$)"}</label>
                  <input name="amount" type="number" step="0.01" required className="fin-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">
                    {parcelar ? "1º Vencimento" : "Vencimento"}
                  </label>
                  <input name="dueDate" type="date" required={!semVencimento} disabled={semVencimento} className="fin-input disabled:opacity-40" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-navy-800/70">
                <input
                  type="checkbox"
                  checked={semVencimento}
                  onChange={(e) => { setSemVencimento(e.target.checked); if (e.target.checked) setParcelar(false); }}
                />
                Sem vencimento definido (decidir depois — aparece na Central de Alertas)
              </label>

              {!semVencimento && (
                <label className="flex items-center gap-2 text-xs text-navy-800/70">
                  <input type="checkbox" checked={parcelar} onChange={(e) => setParcelar(e.target.checked)} />
                  Pagamento recorrente (parcelado)
                </label>
              )}

              {parcelar && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-cream-50 border border-navy-800/8">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Quantidade de parcelas</label>
                    <input name="installmentCount" type="number" min="2" defaultValue="2" className="fin-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Intervalo entre parcelas (dias)</label>
                    <input name="installmentIntervalDays" type="number" min="1" defaultValue="30" className="fin-input" />
                  </div>
                  <p className="text-[11px] text-navy-800/45 sm:col-span-2">Cada parcela é lançada em Contas a Pagar e também gera um lembrete de vencimento na Agenda/Kanban.</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60">Fornecedor</label>
                <EntityPicker
                  name="supplierId"
                  options={suppliers}
                  placeholder="Buscar fornecedor..."
                  emptyLabel="Nenhum"
                  addLabel="Cadastrar novo fornecedor"
                  onQuickAdd={createSupplierQuick}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Categoria</label>
                  <EntityPicker name="categoryId" options={categories} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Centro de Custo</label>
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
                <label className="text-xs font-medium text-navy-800/60">Processo vinculado (opcional)</label>
                <EntityPicker
                  name="caseId"
                  options={cases}
                  placeholder="Buscar processo..."
                  emptyLabel="Nenhum"
                  addLabel="Cadastrar novo processo"
                  onQuickAdd={(name) => createCaseQuick(name)}
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
