"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCheck } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";

export default function BulkSettleBar({
  count,
  total,
  onConfirm,
  onClear,
}: {
  count: number;
  total: number;
  onConfirm: (paidDate: string, receiptNumber: string, paymentMethod: string) => Promise<void>;
  onClear: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <div className="sticky bottom-4 z-30 mt-4">
        <div className="bg-navy-900 text-white rounded-xl shadow-pop px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{count} selecionada(s)</span>
            <span className="text-sm text-gold-300 font-bold">Total: {formatCurrency(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg"
            >
              <CheckCheck size={14} /> Dar Baixa em Bloco
            </button>
            <button onClick={onClear} data-tip="Limpar seleção" className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Confirmar Baixa em Bloco</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={16} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                const paidDate = String(formData.get("paidDate"));
                const receiptNumber = String(formData.get("receiptNumber") || "");
                const paymentMethod = String(formData.get("paymentMethod") || "");
                await onConfirm(paidDate, receiptNumber, paymentMethod);
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <p className="text-xs text-navy-800/60 dark:text-cream-50/60">
                {count} lançamento(s) selecionado(s) · Total <strong>{formatCurrency(total)}</strong>. Cada lançamento será baixado pelo seu próprio valor.
              </p>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Data do pagamento</label>
                <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="settle-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Modalidade de pagamento</label>
                <select name="paymentMethod" required defaultValue="" className="settle-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
                  <option value="" disabled>Selecione...</option>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Nº do comprovante (opcional, único para todos)</label>
                <input name="receiptNumber" placeholder="Ex: nº da transferência/PIX" className="settle-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {loading ? "Confirmando..." : `Confirmar Baixa de ${count} Lançamento(s)`}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .settle-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid rgba(15, 31, 61, 0.12);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .settle-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.4);
        }
      `}</style>
    </>
  );
}
