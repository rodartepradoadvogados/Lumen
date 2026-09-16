"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayablePaid, markReceivablePaid, reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
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
          className={`flex items-center gap-1 text-corpo font-semibold text-tx-2 hover:text-tx px-2 py-1 hover:bg-sf-apoio ${
            pending ? "opacity-50" : ""
          }`}
        >
          <RotateCcw size={12} /> Reabrir
        </button>
        {error && <p role="alert" className="text-corpo text-urgente">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-corpo font-semibold text-acao-tx bg-acao hover:bg-acao-hover px-2.5 py-1.5 "
      >
        <Check size={12} /> Dar Baixa
      </button>
    );
  }

  return (
    <div className="w-full border border-concluido/25 bg-concluido-bg rounded-md p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-corpo font-semibold text-tx">Confirmar baixa</p>
        <button type="button" onClick={() => setOpen(false)} className="text-tx-2" aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
      {alreadyPaid > 0 && (
        <p className="text-corpo text-tx-2 bg-sf-apoio px-2.5 py-1.5">
          Já pago: <span className="font-semibold text-tx tabular-nums">{formatCurrency(alreadyPaid)}</span> · Saldo em aberto:{" "}
          <span className="font-semibold text-tx tabular-nums">{formatCurrency(saldoAtual)}</span>
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
            <label className="text-corpo font-medium text-tx-2" htmlFor={`settle-${id}-paid-amount`}>Valor pago (R$)</label>
            <MoneyInput
              id={`settle-${id}-paid-amount`}
              value={paidAmount}
              onChange={setPaidAmount}
              required
              className="mobile-input"
            />
          </div>
          <div>
            <label className="text-corpo font-medium text-tx-2" htmlFor={`settle-${id}-paid-date`}>Data</label>
            <input id={`settle-${id}-paid-date`} name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="mobile-input" />
          </div>
        </div>
        {ficaParcial && (
          <p className="text-corpo text-aviso bg-aviso-bg rounded-md px-2.5 py-1.5">
            Valor menor que o saldo em aberto — esta conta ficará <strong>Parcial</strong>.
          </p>
        )}
        <div>
          <label className="text-corpo font-medium text-tx-2" htmlFor={`settle-${id}-bank-account`}>Conta bancária</label>
          <select id={`settle-${id}-bank-account`} name="bankAccountId" defaultValue="" className="mobile-input">
            <option value="">Nenhuma</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-corpo font-medium text-tx-2" htmlFor={`settle-${id}-payment-method`}>Forma de pagamento</label>
          <select id={`settle-${id}-payment-method`} name="paymentMethod" required defaultValue="" className="mobile-input">
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
          <label className="text-corpo font-medium text-tx-2" htmlFor={`settle-${id}-receipt-number`}>Nº do comprovante (opcional)</label>
          <input id={`settle-${id}-receipt-number`} name="receiptNumber" placeholder="Ex: nº PIX/transferência" className="mobile-input" />
        </div>
        {error && <p role="alert" className="text-corpo text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{error}</p>}
        <button
          type="submit"
          disabled={loading || paidAmountNum <= 0}
          className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm py-2 disabled:opacity-50"
        >
          {loading ? "Confirmando..." : "Confirmar Baixa"}
        </button>
      </form>
    </div>
  );
}
