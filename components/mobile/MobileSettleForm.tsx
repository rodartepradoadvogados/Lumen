"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayablePaid, markReceivablePaid, reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import { Check, RotateCcw, X } from "lucide-react";

type Option = { id: string; name: string };

// Versão mobile compacta do fluxo SettleButton/SettleModal do desktop: em vez de um modal
// sobreposto, abre um formulário inline logo abaixo do item da lista (mesmos campos e mesmas
// server actions do desktop — valor pago, data, conta bancária, forma de pagamento, nº do
// comprovante — Fase 4: antes só tinha baixa integral, sem conta nem prévia de saldo).
// `liquido`/`alreadyPaid` (em vez de um único `amount` já resolvido) para poder mostrar a MESMA
// prévia de saldo em aberto/PARCIAL do desktop (ver SettleModal.tsx) — quem chama já tem os dois
// valores calculados (ver app/m/financeiro/despesas|receitas/page.tsx).
export default function MobileSettleForm({
  id,
  kind,
  liquido,
  alreadyPaid,
  status,
  bankAccounts,
}: {
  id: string;
  kind: "payable" | "receivable";
  liquido: number;
  alreadyPaid: number;
  status: string;
  bankAccounts: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const saldoAtual = Math.max(0, liquido - alreadyPaid);
  const [paidAmount, setPaidAmount] = useState(saldoAtual > 0 ? saldoAtual.toFixed(2) : "");
  const paidAmountNum = parseFloat(paidAmount || "0") || 0;
  const ficaParcial = paidAmountNum > 0 && paidAmountNum < saldoAtual - 0.004;

  if (status === "PAGO") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              try {
                await (kind === "payable" ? reopenPayable(id) : reopenReceivable(id));
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Erro ao reabrir. Tente novamente.");
              }
            })
          }
          className={`flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 ${
            pending ? "opacity-50" : ""
          }`}
        >
          <RotateCcw size={12} /> Reabrir
        </button>
        {error && <p className="text-[10px] text-bordo-700 dark:text-bordo-400">{error}</p>}
      </div>
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
      {alreadyPaid > 0 && (
        <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 bg-white/60 dark:bg-white/5 rounded-lg px-2.5 py-1.5">
          Já pago: <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(alreadyPaid)}</span> · Saldo em aberto:{" "}
          <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(saldoAtual)}</span>
        </p>
      )}
      <form
        action={async (formData) => {
          setLoading(true);
          setError("");
          const paidDate = String(formData.get("paidDate"));
          const receiptNumber = String(formData.get("receiptNumber") || "");
          const paymentMethod = String(formData.get("paymentMethod") || "");
          const bankAccountId = String(formData.get("bankAccountId") || "");
          try {
            await (kind === "payable"
              ? markPayablePaid(id, paidAmountNum, paidDate, receiptNumber, paymentMethod, bankAccountId || undefined)
              : markReceivablePaid(id, paidAmountNum, paidDate, receiptNumber, paymentMethod, bankAccountId || undefined));
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao confirmar a baixa. Tente novamente.");
          } finally {
            setLoading(false);
          }
        }}
        className="space-y-2.5"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Valor pago (R$)</label>
            <input
              name="paidAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              required
              className="mobile-input"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Data</label>
            <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="mobile-input" />
          </div>
        </div>
        {ficaParcial && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
            Valor menor que o saldo em aberto — esta conta ficará <strong>PARCIAL</strong>.
          </p>
        )}
        <div>
          <label className="text-[11px] font-medium text-navy-800/60 dark:text-cream-50/60">Conta bancária</label>
          <select name="bankAccountId" defaultValue="" className="mobile-input">
            <option value="">Nenhuma</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
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
        {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-2.5 py-1.5">{error}</p>}
        <button
          type="submit"
          disabled={loading || paidAmountNum <= 0}
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
