"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPayablePaid, markReceivablePaid } from "@/lib/actions/financeiro";
import { createBankAccountQuick } from "@/lib/actions/settings";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import { X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import MoneyInput from "@/components/MoneyInput";

type Option = { id: string; name: string };

// Card de "Dar Baixa" / confirmar recebimento (Fase 3 — aceita valor PARCIAL, menor que o saldo
// em aberto): cada confirmação cria UM FinancePayment novo (nunca sobrescreve os anteriores) —
// ver lib/actions/financeiro.ts:markPayablePaid/markReceivablePaid. `liquido` já vem líquido de
// desconto/acréscimo (valorLiquido) e `alreadyPaid` é a soma dos FinancePayment já lançados —
// juntos dão o saldo em aberto ATUAL, que é o valor sugerido por padrão (baixa integral do que
// falta) mas pode ser reduzido pelo usuário para registrar uma baixa parcial.
export default function SettleModal({
  id,
  kind,
  liquido,
  alreadyPaid,
  bankAccounts,
  existingReceiptUrl,
  existingReceiptName,
  onClose,
}: {
  id: string;
  kind: "payable" | "receivable";
  liquido: number;
  alreadyPaid: number;
  bankAccounts: Option[];
  // Comprovante já anexado antes da baixa (ex.: pelo Editar) — opcional, pode não vir de toda
  // listagem antiga que ainda não foi adaptada a passar (ver ReceivablesList.tsx/PayablesList.tsx).
  existingReceiptUrl?: string | null;
  existingReceiptName?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const saldoAtual = Math.max(0, liquido - alreadyPaid);
  const [paidAmount, setPaidAmount] = useState(saldoAtual > 0 ? saldoAtual.toFixed(2) : "");
  // Anexar o comprovante junto da própria baixa (pedido explícito — antes só dava pra anexar
  // reabrindo o Editar depois, um passo a mais desnecessário no momento em que a pessoa já está
  // com o comprovante em mãos). Upload roda só depois da baixa confirmar (o id já existe, então
  // não precisa do encadeamento create->upload dos modais de Novo).
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const valorNum = parseFloat(paidAmount || "0") || 0;
  const ficaParcial = valorNum > 0 && valorNum < saldoAtual - 0.004;
  const saldoResultante = Math.max(0, saldoAtual - valorNum);

  // Sempre montado só quando aberto (o pai decide renderizar <SettleModal /> ou não), então o
  // hook fica sempre "ativo" enquanto este componente existe — mesma convenção de
  // components/ClientQualificationModal.tsx e components/AttendanceLostReasonModal.tsx, que
  // também recebem `onClose` do pai em vez de ter seu próprio estado `open`.
  useEscapeToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
      <div className="bg-sf shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-regua">
          <h3 className=" font-bold text-tx text-sm">Confirmar Baixa</h3>
          <button onClick={onClose} className="text-tx-3 hover:text-tx">
            <X size={16} />
          </button>
        </div>
        <form
          action={async (formData) => {
            setLoading(true);
            setError("");
            const paidAmountNum = parseFloat(String(formData.get("paidAmount")));
            const paidDate = String(formData.get("paidDate"));
            const receiptNumber = String(formData.get("receiptNumber") || "");
            const paymentMethod = String(formData.get("paymentMethod") || "");
            const bankAccountId = String(formData.get("bankAccountId") || "");
            try {
              await (kind === "payable"
                ? markPayablePaid(id, paidAmountNum, paidDate, receiptNumber, paymentMethod, bankAccountId || undefined)
                : markReceivablePaid(id, paidAmountNum, paidDate, receiptNumber, paymentMethod, bankAccountId || undefined));
              if (receiptFile) {
                const uploadResult = await uploadFinanceReceipt(kind === "payable" ? "PAYABLE" : "RECEIVABLE", id, receiptFile);
                if (uploadResult.error) {
                  alert(`Baixa confirmada, mas houve falha ao enviar o comprovante: ${uploadResult.error}\n\nTente anexá-lo novamente pelo Editar.`);
                }
              }
              router.refresh();
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Erro ao confirmar a baixa. Tente novamente.");
            } finally {
              setLoading(false);
            }
          }}
          className="p-5 space-y-3"
        >
          {alreadyPaid > 0 && (
            <p className="text-xs text-tx-2 bg-sf-apoio px-3 py-2">
              Já pago: <span className="font-semibold text-tx">{formatCurrency(alreadyPaid)}</span> · Saldo em aberto:{" "}
              <span className="font-semibold text-tx">{formatCurrency(saldoAtual)}</span>
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-tx-2">Valor pago (R$)</label>
            <MoneyInput
              name="paidAmount"
              value={paidAmount}
              onChange={setPaidAmount}
              required
              className="settle-input bg-sf border border-regua text-tx"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Data do pagamento</label>
            <input name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="settle-input bg-sf border border-regua text-tx" />
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
            <select name="paymentMethod" required defaultValue="" className="settle-input bg-sf border border-regua text-tx">
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
            <label className="text-xs font-medium text-tx-2">Nº do comprovante (opcional)</label>
            <input name="receiptNumber" placeholder="Ex: nº da transferência/PIX" className="settle-input bg-sf border border-regua text-tx" />
          </div>
          <ComprovanteField file={receiptFile} onFileChange={setReceiptFile} existingUrl={existingReceiptUrl} existingName={existingReceiptName} />
          {ficaParcial && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-2">
              Valor menor que o saldo em aberto — esta conta ficará <strong>PARCIAL</strong>, com saldo em aberto de {formatCurrency(saldoResultante)}{" "}
              após esta baixa.
            </p>
          )}
          {error && <p className="text-[11px] text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || valorNum <= 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Confirmando..." : "Confirmar Baixa"}
          </button>
        </form>
      </div>
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
    </div>
  );
}
