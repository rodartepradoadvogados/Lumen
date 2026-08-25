"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayable } from "@/lib/actions/financeiro";
import { PAYABLE_KIND_OPTIONS, EXPENSE_PAYER_LABELS } from "@/lib/despesaProcesso";
import MoneyInput from "@/components/MoneyInput";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";
import { Plus, X, Send } from "lucide-react";

type Option = { id: string; name: string };
type ExpensePayer = "ESCRITORIO" | "CLIENTE";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${
            value === opt.value
              ? "bg-acao text-acao-tx border-acao"
              : "bg-sf text-tx-2 border-regua"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const labelCls = "text-xs font-medium text-tx-2";

// Versão compacta do NewPayableModal do desktop: sem parcelamento e sem cadastro rápido de
// fornecedor/centro de custo (usa <select> simples em vez do EntityPicker com busca) — mantém só
// os campos essenciais para lançar uma conta em campo.
//
// Fase 10 ("Despesas do Processo") acrescentou o modo com processo fixo — mesma ideia de
// MobileLancarHonorariosForm/app/m/processos/[id]/honorarios: quando fixedCaseId vem preenchido
// (ver app/m/processos/[id]/despesa/page.tsx), a tela é a página inteira "Lançar Despesa" de
// dentro do processo (startOpen=true, sem o botão de abrir/fechar) e ganha Natureza da despesa +
// "Quem arca com o custo" (com o checkbox de reembolso quando for do cliente). Sem fixedCaseId,
// continua exatamente como sempre foi: cartão recolhido em app/m/financeiro/despesas, sem
// processo vinculado nenhum.
export default function MobileNewPayableForm({
  suppliers,
  categories,
  costCenters,
  clients,
  fixedCaseId,
  startOpen,
  afterSaveHref,
}: {
  suppliers: Option[];
  categories: Option[];
  costCenters: Option[];
  // Pago a um cliente (repasse de valor de condenação, devolução de adiantamento etc.) — botão
  // "Cliente" só aparece quando esta prop vem preenchida (mesma ideia de ContraparteField.tsx,
  // no desktop). Nenhuma opção de "membro da equipe" aqui: o app, diferente do site, nunca teve
  // esse modo — fora do escopo deste pedido, que é só sobre repasse a cliente.
  clients?: Option[];
  fixedCaseId?: string;
  startOpen?: boolean;
  afterSaveHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(startOpen));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [semVencimento, setSemVencimento] = useState(false);
  const [kind, setKind] = useState("OUTROS");
  const [expensePayer, setExpensePayer] = useState<ExpensePayer>("ESCRITORIO");
  const [createReimbursement, setCreateReimbursement] = useState(true);
  const [payeeMode, setPayeeMode] = useState<"FORNECEDOR" | "CLIENTE">("FORNECEDOR");
  // ---- Comprovante ---- mesma ideia de NewPayableModal.tsx (desktop): enviado só depois do
  // createPayable ter sucesso, quando o id real já existe.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 transition-colors"
      >
        <Plus size={16} /> Nova Conta a Pagar
      </button>
    );
  }

  return (
    <div className={startOpen ? "space-y-3" : " border border-regua bg-sf-apoio p-3 space-y-3"}>
      {!startOpen && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-tx">Nova Conta a Pagar</p>
          <button type="button" onClick={() => setOpen(false)} className="text-tx-2" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}

      <form
        action={async (formData) => {
          setLoading(true);
          setError("");
          try {
            const result = await createPayable({
              description: String(formData.get("description")),
              supplierId: String(formData.get("supplierId") || ""),
              payeeClientId: String(formData.get("payeeClientId") || ""),
              amount: String(formData.get("amount")),
              dueDate: String(formData.get("dueDate") || ""),
              categoryId: String(formData.get("categoryId") || ""),
              costCenterId: String(formData.get("costCenterId") || ""),
              noDueDate: semVencimento,
              caseId: fixedCaseId || undefined,
              kind: fixedCaseId ? kind : undefined,
              expensePayer: fixedCaseId ? expensePayer : undefined,
              createReimbursement: fixedCaseId && expensePayer === "CLIENTE" ? createReimbursement : undefined,
              // Versão de campo, sem parcelamento nem "já pago" — mesma limitação de sempre (ver
              // comentário no topo do arquivo), agora explícita pelo novo formato do Server Action
              // (Fase 3, compartilhado com a tela nova de Contas a Pagar do desktop).
              parcelado: false,
              pago: false,
            });
            if (result.error) {
              setError(result.error);
              return;
            }
            if (receiptFile && result.id) {
              const uploadResult = await uploadFinanceReceipt("PAYABLE", result.id, receiptFile);
              if (uploadResult.error) {
                alert(`Lançamento salvo, mas houve falha ao enviar o comprovante: ${uploadResult.error}\n\nVocê pode anexá-lo novamente editando o lançamento.`);
              }
            }
            if (afterSaveHref) {
              router.push(afterSaveHref);
              return;
            }
            setOpen(false);
            setSemVencimento(false);
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
          <label className={labelCls}>Descrição</label>
          <input name="description" required className="mobile-input" placeholder="Ex: Aluguel escritório" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <MoneyInput name="amount" required className="mobile-input" />
          </div>
          <div>
            <label className={labelCls}>Vencimento</label>
            <input
              name="dueDate"
              type="date"
              required={!semVencimento}
              disabled={semVencimento}
              className="mobile-input disabled:opacity-40"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-tx-2">
          <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
          Sem vencimento definido
        </label>
        <ComprovanteField file={receiptFile} onFileChange={setReceiptFile} />
        <div>
          <label className={labelCls}>Pago a (opcional)</label>
          {clients && (
            <div className="mt-1 mb-1.5">
              <Segmented<"FORNECEDOR" | "CLIENTE">
                value={payeeMode}
                onChange={setPayeeMode}
                options={[
                  { value: "FORNECEDOR", label: "Fornecedor" },
                  { value: "CLIENTE", label: "Cliente" },
                ]}
              />
            </div>
          )}
          {payeeMode === "FORNECEDOR" || !clients ? (
            <select name="supplierId" defaultValue="" className="mobile-input">
              <option value="">Nenhum</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <select name="payeeClientId" defaultValue="" className="mobile-input">
              <option value="">Nenhum</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Categoria</label>
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
            <label className={labelCls}>Centro de Custo</label>
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

        {/* Natureza da despesa e "Quem arca com o custo" só existem com processo fixo (entrando
            de dentro do Processo) — ver lib/despesaProcesso.ts. */}
        {fixedCaseId && (
          <>
            <div>
              <label className={labelCls}>Natureza da despesa</label>
              <div className="mt-1">
                <Segmented value={kind} onChange={setKind} options={PAYABLE_KIND_OPTIONS} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Quem arca com o custo</label>
              <div className="mt-1">
                <Segmented<ExpensePayer>
                  value={expensePayer}
                  onChange={setExpensePayer}
                  options={[
                    { value: "ESCRITORIO", label: EXPENSE_PAYER_LABELS.ESCRITORIO },
                    { value: "CLIENTE", label: EXPENSE_PAYER_LABELS.CLIENTE },
                  ]}
                />
              </div>
            </div>
            {expensePayer === "CLIENTE" && (
              <div className=" bg-acao-bg px-3 py-2.5">
                <label className="flex items-center gap-2 text-xs font-medium text-tx-2">
                  <input type="checkbox" checked={createReimbursement} onChange={(e) => setCreateReimbursement(e.target.checked)} />
                  Criar conta a receber vinculada para reembolso deste valor pelo cliente?
                </label>
                <p className="text-[11px] text-tx-2 mt-1 ml-6">
                  Gera automaticamente uma Conta a Receber (Reembolso) do cliente do processo, no valor total desta despesa.
                </p>
              </div>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm py-2.5 transition-colors disabled:opacity-50"
        >
          {startOpen && <Send size={14} />} {loading ? "Salvando..." : startOpen ? "Salvar lançamento" : "Criar"}
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
