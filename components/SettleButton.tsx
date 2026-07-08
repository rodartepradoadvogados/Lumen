"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPayablePaid, markReceivablePaid, reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import { Check, RotateCcw, X } from "lucide-react";

export default function SettleButton({
  id,
  kind,
  amount,
  status,
}: {
  id: string;
  kind: "payable" | "receivable";
  amount: number;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (status === "PAGO") {
    return (
      <button
        onClick={async () => {
          setLoading(true);
          await (kind === "payable" ? reopenPayable(id) : reopenReceivable(id));
          router.refresh();
          setLoading(false);
        }}
        disabled={loading}
        className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 hover:text-navy-900 px-2 py-1 rounded-lg hover:bg-cream-100"
      >
        <RotateCcw size={12} /> Reabrir
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg"
      >
        <Check size={12} /> Dar Baixa
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900 text-sm">Confirmar Baixa</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={16} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                const paidAmount = parseFloat(String(formData.get("paidAmount")));
                const paidDate = String(formData.get("paidDate"));
                await (kind === "payable" ? markPayablePaid(id, paidAmount, paidDate) : markReceivablePaid(id, paidAmount, paidDate));
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60">Valor pago (R$)</label>
                <input name="paidAmount" type="number" step="0.01" defaultValue={amount} required className="settle-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Data do pagamento</label>
                <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="settle-input" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {loading ? "Confirmando..." : "Confirmar Baixa"}
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
