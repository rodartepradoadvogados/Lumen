"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateReceivable } from "@/lib/actions/financeiro";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { DOCUMENT_TYPE_OPTIONS, RECEIVABLE_KIND_OPTIONS } from "@/lib/honorarioLancamento";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido } from "@/lib/financeCalc";
import { formatCurrency, formatDate } from "@/components/ui";
import { Pencil, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";

type Option = { id: string; name: string };

// Mesmo mapeamento {value,label} -> {id,name} de NewPayableModal.tsx (ver comentário lá).
const documentTypeOptions: Option[] = DOCUMENT_TYPE_OPTIONS.map((o) => ({ id: o.value, name: o.label }));

const labelCls = "text-xs font-medium text-tx-2";

export default function EditReceivableModal({
  receivable,
  categories,
  cases,
  clients,
  costCenters = [],
  responsibles = [],
}: {
  receivable: {
    id: string;
    description: string;
    amount: number;
    // Os campos abaixo são da Fase 3 — opcionais aqui para telas mais antigas (ex.: aba
    // Financeiro do Processo) que ainda não foram adaptadas a passá-los continuarem funcionando.
    discount?: number;
    surcharge?: number;
    dueDate: string;
    noDueDate: boolean;
    kind: string;
    categoryId: string | null;
    costCenterId: string | null;
    clientId: string | null;
    caseId: string | null;
    responsibleId?: string | null;
    documentType?: string | null;
    documentNumber?: string | null;
    issueDate?: string | null;
    installmentBoleto?: string | null;
    installmentNumber?: number | null;
    installmentTotal?: number | null;
    status?: string;
    paidAmount?: number | null;
    paidDate?: string | null;
    paymentMethod?: string | null;
    paymentReceiptNumber?: string | null;
    // Comprovante já salvo (ver Receivable.receiptDriveUrl/receiptFileName) — opcional pelo mesmo
    // motivo dos demais campos acima.
    receiptDriveUrl?: string | null;
    receiptFileName?: string | null;
  };
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters?: Option[];
  responsibles?: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [semVencimento, setSemVencimento] = useState(receivable.noDueDate);
  const [amount, setAmount] = useState(String(receivable.amount));
  const [discount, setDiscount] = useState(String(receivable.discount ?? 0));
  const [surcharge, setSurcharge] = useState(String(receivable.surcharge ?? 0));

  // ---- Comprovante ---- mesma ideia de EditPayableModal.tsx: enviado logo depois do
  // updateReceivable ter sucesso.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const liquido = valorLiquido(amountNum, discountNum, surchargeNum);
  const isApurar = receivable.status === "A_APURAR";

  useEscapeToClose(open, () => setOpen(false));

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar" className="p-1.5 rounded-lg text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf rounded-xl shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx">Editar Conta a Receber</h3>
              <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                try {
                  const result = await updateReceivable(receivable.id, {
                    description: String(formData.get("description")),
                    amount,
                    discount,
                    surcharge,
                    dueDate: String(formData.get("dueDate") || ""),
                    kind: String(formData.get("kind")),
                    categoryId: String(formData.get("categoryId") || ""),
                    costCenterId: String(formData.get("costCenterId") || ""),
                    clientId: String(formData.get("clientId") || ""),
                    caseId: String(formData.get("caseId") || ""),
                    responsibleId: String(formData.get("responsibleId") || ""),
                    documentType: String(formData.get("documentType") || ""),
                    documentNumber: String(formData.get("documentNumber") || ""),
                    issueDate: String(formData.get("issueDate") || ""),
                    installmentBoleto: String(formData.get("installmentBoleto") || ""),
                    noDueDate: semVencimento,
                  });
                  setLoading(false);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  if (receiptFile) {
                    const uploadResult = await uploadFinanceReceipt("RECEIVABLE", receivable.id, receiptFile);
                    if (uploadResult.error) {
                      alert(`Alterações salvas, mas houve falha ao enviar o comprovante: ${uploadResult.error}\n\nTente anexá-lo novamente.`);
                    }
                  }
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setLoading(false);
                  setError(err instanceof Error ? err.message : "Não foi possível salvar as alterações. Tente novamente.");
                }
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {error && <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2">{error}</p>}
                {isApurar && (
                  <p className="text-xs text-tx-2 bg-sf-apoio rounded-lg px-3 py-2">
                    Esta parcela é uma provisão &quot;A apurar&quot; (percentual sobre o desfecho do processo) — os campos de valor abaixo não
                    representam dinheiro real ainda; a apuração do êxito é feita na aba Financeiro do processo.
                  </p>
                )}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input name="description" defaultValue={receivable.description} required className="fin-input bg-sf border border-regua text-tx" />
                </div>

                <SecaoLancamento title="Identificação" tone="palha">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Cliente</label>
                      <EntityPicker
                        name="clientId"
                        options={clients}
                        defaultValue={receivable.clientId ?? undefined}
                        placeholder="Buscar cliente..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo cliente"
                        onQuickAdd={createClientQuick}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Tipo de Honorário</label>
                      <select name="kind" defaultValue={receivable.kind} className="fin-input bg-sf border border-regua text-tx">
                        {RECEIVABLE_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Centro de custo</label>
                      <EntityPicker
                        name="costCenterId"
                        options={costCenters}
                        defaultValue={receivable.costCenterId ?? undefined}
                        placeholder="Buscar centro de custo..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo centro de custo"
                        onQuickAdd={createCostCenterQuick}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Categoria</label>
                      <EntityPicker name="categoryId" options={categories} defaultValue={receivable.categoryId ?? undefined} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                    </div>
                    <div>
                      <label className={labelCls}>Processo vinculado</label>
                      <EntityPicker
                        name="caseId"
                        options={cases}
                        defaultValue={receivable.caseId ?? undefined}
                        placeholder="Buscar processo..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo processo"
                        onQuickAdd={(name) => createCaseQuick(name)}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Responsável pelo lançamento</label>
                      <EntityPicker
                        name="responsibleId"
                        title="Responsável pelo lançamento"
                        options={responsibles}
                        defaultValue={receivable.responsibleId ?? undefined}
                        placeholder="Buscar responsável..."
                        emptyLabel="Não informado"
                      />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Documento" tone="azul">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Tipo de documento</label>
                      <EntityPicker
                        name="documentType"
                        title="Tipo de documento"
                        options={documentTypeOptions}
                        defaultValue={receivable.documentType ?? undefined}
                        placeholder="Buscar tipo de documento..."
                        emptyLabel="Não informado"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Número do documento</label>
                      <input name="documentNumber" defaultValue={receivable.documentNumber ?? ""} className="fin-input bg-sf border border-regua text-tx" />
                    </div>
                    <div>
                      <label className={labelCls}>Data de emissão</label>
                      <input name="issueDate" type="date" defaultValue={receivable.issueDate?.slice(0, 10) ?? ""} className="fin-input bg-sf border border-regua text-tx" />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Valores" tone="ouro">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="fin-input bg-sf border border-regua text-tx" />
                    </div>
                    <div>
                      <label className={labelCls}>Desconto (R$)</label>
                      <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="fin-input bg-sf border border-regua text-tx" />
                    </div>
                    <div>
                      <label className={labelCls}>Acréscimo (R$)</label>
                      <input type="number" step="0.01" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className="fin-input bg-sf border border-regua text-tx" />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Vencimento" tone="azul">
                  <label className="flex items-center gap-2 text-xs text-tx-2">
                    <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
                    Sem vencimento definido
                  </label>
                  {!semVencimento ? (
                    <div>
                      <label className={labelCls}>Data de vencimento</label>
                      <input
                        name="dueDate"
                        type="date"
                        defaultValue={receivable.dueDate.slice(0, 10)}
                        required={!semVencimento}
                        className="fin-input bg-sf border border-regua text-tx"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-tx-2">
                      Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
                    </p>
                  )}
                </SecaoLancamento>

                <SecaoLancamento title="Parcelamento" tone="rosa">
                  {receivable.installmentTotal ? (
                    <p className="text-[11px] text-tx-2 bg-white/60 dark:bg-white/5 rounded-lg px-3 py-1.5">
                      Parcela {receivable.installmentNumber}/{receivable.installmentTotal} de um lançamento parcelado — para mudar quantidade/intervalo,
                      lance um novo parcelamento.
                    </p>
                  ) : (
                    <p className="text-[11px] text-tx-2">Lançamento único, não parcelado.</p>
                  )}
                  <div>
                    <label className={labelCls}>Nº do boleto desta parcela</label>
                    <input name="installmentBoleto" defaultValue={receivable.installmentBoleto ?? ""} className="fin-input bg-sf border border-regua text-tx" />
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Recebimento" tone="verde">
                  <ComprovanteField
                    file={receiptFile}
                    onFileChange={setReceiptFile}
                    existingUrl={receivable.receiptDriveUrl}
                    existingName={receivable.receiptFileName}
                  />
                  {receivable.status === "PAGO" || receivable.status === "PARCIAL" ? (
                    <p className="text-xs text-tx-2">
                      {receivable.status === "PARCIAL" ? "Parcialmente recebido" : "Recebido"}: {formatCurrency(receivable.paidAmount ?? 0)}
                      {receivable.paidDate && <> em {formatDate(receivable.paidDate)}</>}
                      {receivable.paymentMethod && <> · {paymentMethodLabels[receivable.paymentMethod] ?? receivable.paymentMethod}</>}
                      {receivable.paymentReceiptNumber && <> · comprovante {receivable.paymentReceiptNumber}</>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-tx-2">Ainda não há nenhuma baixa lançada nesta conta.</p>
                  )}
                  <p className="text-[11px] text-tx-3">
                    Para dar baixa (parcial ou integral) ou reabrir, use os botões na listagem — esta tela edita só o cadastro.
                  </p>
                </SecaoLancamento>
              </div>

              <div className="shrink-0 border-t border-regua px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-sf-apoio">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Bruto</span>
                    <span className="text-sm font-semibold tabular-nums text-tx">{formatCurrency(amountNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Desconto</span>
                    <span className="text-sm font-semibold tabular-nums text-urgente">-{formatCurrency(discountNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Acréscimo</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{formatCurrency(surchargeNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Líquido</span>
                    <span className="font-serif text-lg font-bold tabular-nums text-marca-tx">{formatCurrency(liquido)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium px-4 py-2 rounded-lg text-tx-2 hover:bg-sf-apoio"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50">
                    {loading ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .fin-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
