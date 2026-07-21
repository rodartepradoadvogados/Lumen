"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceivable } from "@/lib/actions/financeiro";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string };

const KIND_OPTIONS = [
  { value: "HONORARIOS_CONTRATUAIS", label: "Honorários Contratuais" },
  { value: "HONORARIOS_SUCUMBENCIAIS", label: "Honorários Sucumbenciais" },
  { value: "REEMBOLSO", label: "Reembolso" },
  { value: "OUTROS", label: "Outros" },
];

// Versão compacta do NewReceivableModal do desktop: sem parcelamento, sem divisão em
// êxito/agora e sem vínculo a processo — usa <select> simples em vez do EntityPicker com
// busca/cadastro rápido, mantendo só os campos essenciais para lançar em campo.
export default function MobileNewReceivableForm({
  clients,
  categories,
  costCenters,
}: {
  clients: Option[];
  categories: Option[];
  costCenters: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Nova Conta a Receber
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-100 dark:bg-white/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Nova Conta a Receber</p>
        <button type="button" onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40" aria-label="Fechar">
          <X size={16} />
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
          });
          setLoading(false);
          setOpen(false);
          router.refresh();
        }}
        className="space-y-3"
      >
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição</label>
          <input name="description" required className="mobile-input" placeholder="Ex: Honorários - parcela 1/6" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor (R$)</label>
            <input name="amount" type="number" step="0.01" required className="mobile-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vencimento</label>
            <input name="dueDate" type="date" required className="mobile-input" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo de Honorário</label>
          <select name="kind" defaultValue="HONORARIOS_CONTRATUAIS" className="mobile-input">
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Cliente (opcional)</label>
          <select name="clientId" defaultValue="" className="mobile-input">
            <option value="">Nenhum</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          className="w-full bg-bordo-600 hover:bg-bordo-700 dark:bg-bordo-500 dark:hover:bg-bordo-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
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
