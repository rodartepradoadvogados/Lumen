"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayable } from "@/lib/actions/financeiro";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string };

// Versão compacta do NewPayableModal do desktop: sem parcelamento, sem vínculo a processo e
// sem cadastro rápido de fornecedor/centro de custo (usa <select> simples em vez do
// EntityPicker com busca) — mantém só os campos essenciais para lançar uma conta em campo.
export default function MobileNewPayableForm({
  suppliers,
  categories,
  costCenters,
}: {
  suppliers: Option[];
  categories: Option[];
  costCenters: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [semVencimento, setSemVencimento] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-bordo-600 hover:bg-bordo-700 dark:bg-bordo-500 dark:hover:bg-bordo-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Nova Conta a Pagar
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-100 dark:bg-white/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Nova Conta a Pagar</p>
        <button type="button" onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40" aria-label="Fechar">
          <X size={16} />
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
            noDueDate: semVencimento,
          });
          setLoading(false);
          setOpen(false);
          setSemVencimento(false);
          router.refresh();
        }}
        className="space-y-3"
      >
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição</label>
          <input name="description" required className="mobile-input" placeholder="Ex: Aluguel escritório" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
            <input name="amount" type="number" step="0.01" required className="mobile-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vencimento</label>
            <input
              name="dueDate"
              type="date"
              required={!semVencimento}
              disabled={semVencimento}
              className="mobile-input disabled:opacity-40"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
          <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
          Sem vencimento definido
        </label>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Fornecedor (opcional)</label>
          <select name="supplierId" defaultValue="" className="mobile-input">
            <option value="">Nenhum</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Categoria</label>
            <select name="categoryId" defaultValue="" className="mobile-input">
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Centro de Custo</label>
            <select name="costCenterId" defaultValue="" className="mobile-input">
              <option value="">Nenhum</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar"}
        </button>
      </form>

      <style jsx global>{`
        .mobile-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid rgba(15, 31, 61, 0.12);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #14213d;
          background: white;
        }
        .mobile-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
        :global(html.dark) .mobile-input {
          border-color: rgba(255, 255, 255, 0.12);
          color: #fbfaf7;
          background: #0b1730;
        }
      `}</style>
    </div>
  );
}
