"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { createPlatformExpense, updatePlatformExpense, deletePlatformExpense } from "@/lib/actions/platformFinanceiro";

type Account = { id: string; name: string; group: string | null };

type ExpenseFormValues = {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  competencia: string;
  paidAt: string | null; // "YYYY-MM-DD" ou null
  supplier: string | null;
  notes: string | null;
};

export default function PlatformExpenseModal({
  mode,
  accounts,
  expense,
  competenciaFoco,
}: {
  mode: "create" | "edit";
  accounts: Account[];
  expense?: ExpenseFormValues;
  // Competência em foco na tela — usada como valor inicial do campo ao criar uma nova despesa.
  competenciaFoco?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const data = {
      accountId: String(formData.get("accountId") || ""),
      description: String(formData.get("description") || ""),
      amount: String(formData.get("amount") || ""),
      competencia: String(formData.get("competencia") || ""),
      paidAt: String(formData.get("paidAt") || "") || undefined,
      supplier: String(formData.get("supplier") || "") || undefined,
      notes: String(formData.get("notes") || "") || undefined,
    };
    try {
      if (mode === "create") {
        await createPlatformExpense(data);
      } else if (expense) {
        await updatePlatformExpense(expense.id, data);
      }
      setLoading(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar a despesa.");
    }
  }

  return (
    <>
      {mode === "create" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Nova despesa
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          data-tip="Editar"
          className="p-1.5 rounded-lg text-cream-50/40 hover:text-cream-50 hover:bg-white/10 transition-colors"
        >
          <Pencil size={14} />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 flex items-center justify-center p-4">
          <div
            className="bg-navy-900 border border-white/10 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-serif font-bold text-cream-50">{mode === "create" ? "Nova despesa" : "Editar despesa"}</h3>
              <button onClick={() => setOpen(false)} className="text-cream-50/40 hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form action={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-cream-50/60">Conta</label>
                <select
                  name="accountId"
                  required
                  defaultValue={expense?.accountId ?? ""}
                  className="pm-input"
                >
                  <option value="" disabled>
                    Selecione uma conta
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.group ? `${a.group} — ${a.name}` : a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-cream-50/60">Descrição</label>
                <input name="description" required defaultValue={expense?.description} className="pm-input" placeholder="Ex: Hospedagem Vercel" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Valor (R$)</label>
                  <input name="amount" type="number" step="0.01" required defaultValue={expense?.amount} className="pm-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Competência</label>
                  <input
                    name="competencia"
                    type="month"
                    required
                    defaultValue={expense?.competencia ?? competenciaFoco}
                    className="pm-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Pago em (opcional)</label>
                  <input name="paidAt" type="date" defaultValue={expense?.paidAt ?? ""} className="pm-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-cream-50/60">Fornecedor (opcional)</label>
                  <input name="supplier" defaultValue={expense?.supplier ?? ""} className="pm-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-cream-50/60">Observações (opcional)</label>
                <textarea name="notes" rows={2} defaultValue={expense?.notes ?? ""} className="pm-input resize-none" />
              </div>
              {error && <p className="text-xs text-bordo-400">{error}</p>}
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : mode === "create" ? "Criar" : "Salvar alterações"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .pm-input {
          width: 100%;
          margin-top: 0.25rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #fdfaf3;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .pm-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
      `}</style>
    </>
  );
}

// Botão simples de exclusão, com confirm() nativo — mesmo nível de simplicidade usado no resto
// do projeto para exclusões (ver components/DeleteButton.tsx). deletePlatformExpense lança
// erro em vez de devolver { error }, então o catch aqui trata a falha.
export function DeletePlatformExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Excluir esta despesa? Esta ação não pode ser desfeita.")) return;
    startTransition(async () => {
      try {
        await deletePlatformExpense(id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Não foi possível excluir a despesa.");
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      data-tip="Excluir"
      className="p-1.5 rounded-lg text-cream-50/40 hover:text-bordo-400 hover:bg-white/10 transition-colors disabled:opacity-40"
    >
      <Trash2 size={14} />
    </button>
  );
}
