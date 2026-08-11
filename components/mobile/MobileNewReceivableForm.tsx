"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceivable } from "@/lib/actions/financeiro";
import { RECEIVABLE_KIND_OPTIONS } from "@/lib/honorarioLancamento";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string };

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
  const [error, setError] = useState("");
  // ---- Comprovante ---- mesma ideia de MobileNewPayableForm.tsx: enviado só depois do
  // createReceivable ter sucesso.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Nova Conta a Receber
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-regua bg-sf-apoio p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-tx">Nova Conta a Receber</p>
        <button type="button" onClick={() => setOpen(false)} className="text-tx-2" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      {error && <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2">{error}</p>}

      <form
        action={async (formData) => {
          setLoading(true);
          setError("");
          try {
            const result = await createReceivable({
              description: String(formData.get("description")),
              amount: String(formData.get("amount")),
              dueDate: String(formData.get("dueDate")),
              kind: String(formData.get("kind")),
              categoryId: String(formData.get("categoryId") || ""),
              costCenterId: String(formData.get("costCenterId") || ""),
              clientId: String(formData.get("clientId") || ""),
              // Versão de campo, sem parcelamento nem "já recebido" — mesma limitação de sempre (ver
              // comentário no topo do arquivo), agora explícita pelo novo formato do Server Action
              // (Fase 3, compartilhado com a tela nova de Contas a Receber do desktop).
              parcelado: false,
              recebido: false,
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            if (receiptFile && result.id) {
              const uploadResult = await uploadFinanceReceipt("RECEIVABLE", result.id, receiptFile);
              if (uploadResult.error) {
                alert(`Lançamento salvo, mas houve falha ao enviar o comprovante: ${uploadResult.error}\n\nVocê pode anexá-lo novamente editando o lançamento.`);
              }
            }
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.");
          } finally {
            setLoading(false);
          }
        }}
        className="space-y-3"
      >
        <div>
          <label className="text-xs font-medium text-tx-2">Descrição</label>
          <input name="description" required className="mobile-input" placeholder="Ex: Honorários - parcela 1/6" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-tx-2">Valor (R$)</label>
            <input name="amount" type="number" step="0.01" required className="mobile-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Vencimento</label>
            <input name="dueDate" type="date" required className="mobile-input" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Tipo de Honorário</label>
          <select name="kind" defaultValue="HONORARIOS_CONTRATUAIS" className="mobile-input">
            {RECEIVABLE_KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <ComprovanteField file={receiptFile} onFileChange={setReceiptFile} />
        <div>
          <label className="text-xs font-medium text-tx-2">Cliente (opcional)</label>
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
            <label className="text-xs font-medium text-tx-2">Categoria</label>
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
            <label className="text-xs font-medium text-tx-2">Centro de Custo</label>
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
          className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar"}
        </button>
      </form>

      <style jsx global>{`
        .mobile-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background-color: var(--sf-superficie);
          color: var(--tx);
        }
        .mobile-input:focus {
          outline: none;
          border-color: var(--acao);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent);
        }
      `}</style>
    </div>
  );
}
