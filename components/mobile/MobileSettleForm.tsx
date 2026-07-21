"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayablePaid, markReceivablePaid, reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { Check, RotateCcw, X } from "lucide-react";

// Versão mobile compacta do fluxo SettleButton/SettleModal do desktop: em vez de um modal
// sobreposto, abre um formulário inline logo abaixo do item da lista (mesmos campos e mesmas
// server actions do desktop — valor pago, data, forma de pagamento, nº do comprovante).
export default function MobileSettleForm({
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
  const [pending, startTransition] = useTransition();

  if (status === "PAGO") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await (kind === "payable" ? reopenPayable(id) : reopenReceivable(id));
            router.refresh();
          })
        }
        className={`flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 ${
          pending ? "opacity-50" : ""
        }`}
      >
        <RotateCcw size={12} /> Reabrir
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg"
      >
        <Check size={12} /> Dar Baixa
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-400/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-navy-900 dark:text-cream-50">Confirmar baixa</p>
        <button type="button" onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40" aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
      <form
        action={async (formData) => {
          setLoading(true);
          const paidAmount = parseFloat(String(formData.get("paidAmount")));
          const paidDate = String(formData.get("paidDate"));
          const receiptNumber = String(formData.get("receiptNumber") || "");
          const paymentMethod = String(formData.get("paymentMethod") || "");
          await (kind === "payable"
            ? markPayablePaid(id, paidAmount, paidDate, receiptNumber, paymentMethod)
            : markReceivablePaid(id, paidAmount, paidDate, receiptNumber, paymentMethod));
          setLoading(false);
          setOpen(false);
          router.refresh();
        }}
        className="space-y-2.5"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Valor pago (R$)</label>
            <input name="paidAmount" type="number" step="0.01" defaultValue={amount} required className="mobile-input" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Data</label>
            <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="mobile-input" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Forma de pagamento</label>
          <select name="paymentMethod" required defaultValue="" className="mobile-input">
            <option value="" disabled>
              Selecione...
            </option>
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Nº do comprovante (opcional)</label>
          <input name="receiptNumber" placeholder="Ex: nº PIX/transferência" className="mobile-input" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? "Confirmando..." : "Confirmar Baixa"}
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
