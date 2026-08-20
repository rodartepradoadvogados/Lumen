"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCheck } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { createBankAccountQuick } from "@/lib/actions/settings";
import EntityPicker from "@/components/EntityPicker";

type Option = { id: string; name: string };

// Baixa em bloco (Fase 3): SEMPRE integral — cada conta selecionada é quitada pelo próprio saldo
// em aberto (ver lib/actions/financeiro.ts:markManyPayablesPaid/markManyReceivablesPaid), nunca
// um valor arbitrário digitado aqui. Quem precisar de uma baixa PARCIAL usa o botão individual
// "Dar Baixa" de cada linha (SettleButton/SettleModal), que aceita valor menor que o devido.
export default function BulkSettleBar({
  count,
  total,
  bankAccounts = [],
  onConfirm,
  onClear,
}: {
  count: number;
  total: number;
  bankAccounts?: Option[];
  onConfirm: (paidDate: string, receiptNumber: string, paymentMethod: string, bankAccountId?: string) => Promise<void>;
  onClear: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <div className="sticky bottom-4 z-30 mt-4">
        <div className="bg-grafite-800 text-white shadow-pop px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{count} selecionada(s)</span>
            <span className="text-sm text-marca font-bold">Total: {formatCurrency(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3.5 py-2 transition-colors"
            >
              <CheckCheck size={14} /> Dar Baixa em Bloco
            </button>
            <button onClick={onClear} data-tip="Limpar seleção" className="p-2 text-white/60 hover:text-white hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-regua">
              <h3 className="font-bold text-tx text-sm">Confirmar Baixa em Bloco</h3>
              <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx dark:hover:text-tx">
                <X size={16} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                const paidDate = String(formData.get("paidDate"));
                const receiptNumber = String(formData.get("receiptNumber") || "");
                const paymentMethod = String(formData.get("paymentMethod") || "");
                const bankAccountId = String(formData.get("bankAccountId") || "");
                try {
                  await onConfirm(paidDate, receiptNumber, paymentMethod, bankAccountId || undefined);
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Erro ao confirmar a baixa em bloco. Tente novamente.");
                } finally {
                  setLoading(false);
                }
              }}
              className="p-5 space-y-3"
            >
              <p className="text-xs text-tx-2">
                {count} lançamento(s) selecionado(s) · Total <strong>{formatCurrency(total)}</strong>. Baixa em bloco é sempre <strong>integral</strong> —
                cada lançamento é quitado pelo próprio saldo em aberto.
              </p>
              <div>
                <label className="text-xs font-medium text-tx-2">Data do pagamento</label>
                <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="settle-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Conta bancária</label>
                <EntityPicker
                  name="bankAccountId"
                  options={bankAccounts}
                  placeholder="Buscar conta..."
                  emptyLabel="Nenhuma"
                  addLabel="Cadastrar nova conta bancária"
                  onQuickAdd={createBankAccountQuick}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Modalidade de pagamento</label>
                <select name="paymentMethod" required defaultValue="" className="settle-input">
                  <option value="" disabled>Selecione...</option>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Nº do comprovante (opcional, único para todos)</label>
                <input name="receiptNumber" placeholder="Ex: nº da transferência/PIX" className="settle-input" />
              </div>
              {error && <p className="text-[11px] text-urgente bg-urgente-bg px-3 py-2">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2 text-sm disabled:opacity-50 transition-colors"
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
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background-color: var(--sf);
          color: var(--tx);
        }
        .settle-input:focus {
          outline: none;
          border-color: var(--acao);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent);
        }
      `}</style>
    </>
  );
}
