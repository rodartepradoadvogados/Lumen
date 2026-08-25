"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePayable } from "@/lib/actions/financeiro";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/honorarioLancamento";
import { PAYABLE_KIND_OPTIONS, EXPENSE_PAYER_LABELS } from "@/lib/despesaProcesso";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido } from "@/lib/financeCalc";
import { formatCurrency, formatDate } from "@/components/ui";
import { Pencil, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import ContraparteField from "@/components/financeiro/ContraparteField";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";
import { financeStatusLabel } from "@/lib/financeStatus";
import MoneyInput from "@/components/MoneyInput";

type Option = { id: string; name: string };

// Mesmo mapeamento {value,label} -> {id,name} de NewPayableModal.tsx (ver comentário lá).
const documentTypeOptions: Option[] = DOCUMENT_TYPE_OPTIONS.map((o) => ({ id: o.value, name: o.label }));

type ExpensePayer = "ESCRITORIO" | "CLIENTE";

const labelCls = "text-xs font-medium text-tx-2";

// Mesmo componente (copiado, não importado — ver comentário equivalente em NewPayableModal.tsx/
// LancarHonorariosModal.tsx: cada tela de lançamento mantém sua própria cópia local) usado para a
// Natureza da despesa e para "Quem arca com o custo" — só aparece quando há processo vinculado.
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
              : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function EditPayableModal({
  payable,
  categories,
  cases,
  suppliers,
  costCenters = [],
  responsibles = [],
  teamMembers = [],
  clients,
}: {
  payable: {
    id: string;
    description: string;
    supplierId: string | null;
    // Pago a um membro da equipe em vez de a um Fornecedor — opcional pelo mesmo motivo dos
    // demais campos "novos" abaixo (telas mais antigas que ainda não passam este campo).
    payeeUserId?: string | null;
    // Pago a um cliente (repasse/devolução) — mesma ideia de payeeUserId acima.
    payeeClientId?: string | null;
    amount: number;
    // Os campos abaixo são da Fase 3 (documento/desconto/acréscimo/responsável/parcela/
    // pagamento) — opcionais aqui para telas mais antigas (ex.: aba Financeiro do Processo) que
    // ainda não foram adaptadas a passá-los continuarem funcionando (o formulário simplesmente
    // nasce com esses campos vazios/zerados nelas).
    discount?: number;
    surcharge?: number;
    dueDate: string;
    noDueDate: boolean;
    categoryId: string | null;
    costCenterId: string | null;
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
    // ---- Despesas do Processo (Fase 10) — ver lib/despesaProcesso.ts. Opcionais aqui pelo mesmo
    // motivo dos demais campos "novos" deste tipo: telas mais antigas que ainda não foram
    // adaptadas a passá-los continuam funcionando (nasce em OUTROS/ESCRITORIO, igual ao default
    // do banco). ----
    kind?: string;
    expensePayer?: string;
    // Presente só quando esta despesa já tem um reembolso vinculado (ver
    // Payable.reimbursementReceivable) — amount/status bastam para a informação exibida aqui
    // (nunca navega para o reembolso em si, ver Problema 2 do pedido original).
    reimbursementReceivable?: { id: string; amount: number; status: string } | null;
    // Comprovante já salvo (ver Payable.receiptDriveUrl/receiptFileName) — opcional pelo mesmo
    // motivo dos demais campos "novos" acima: telas mais antigas que ainda não foram adaptadas a
    // passá-lo continuam funcionando (nasce sem comprovante nenhum pra mostrar).
    receiptDriveUrl?: string | null;
    receiptFileName?: string | null;
  };
  categories: Option[];
  cases: Option[];
  suppliers: Option[];
  costCenters?: Option[];
  responsibles?: Option[];
  // Pago a um membro da equipe (ver payable.payeeUserId acima) — mesma lista de usuários ativos
  // do escritório usada em `responsibles`, ver comentário equivalente em PayablesList.tsx.
  teamMembers?: Option[];
  // Pago a um cliente (ver payable.payeeClientId acima) — botão "Cliente" só aparece quando esta
  // prop vem preenchida (ver ContraparteField.tsx).
  clients?: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [semVencimento, setSemVencimento] = useState(payable.noDueDate);
  const [amount, setAmount] = useState(String(payable.amount));
  const [discount, setDiscount] = useState(String(payable.discount ?? 0));
  const [surcharge, setSurcharge] = useState(String(payable.surcharge ?? 0));

  // ---- Processo / Despesa do Processo (Fase 10 — mesma ideia de NewPayableModal.tsx) ----
  const [caseId, setCaseId] = useState(payable.caseId ?? "");
  const hasCase = Boolean(caseId);
  const hasReimbursement = Boolean(payable.reimbursementReceivable);
  const [kind, setKind] = useState(payable.kind || "OUTROS");
  const [expensePayer, setExpensePayer] = useState<ExpensePayer>(
    hasReimbursement ? "CLIENTE" : payable.expensePayer === "CLIENTE" ? "CLIENTE" : "ESCRITORIO"
  );
  // Reembolso retroativo (Problema 1): default desmarcado — diferente de NewPayableModal.tsx
  // (onde o default é true), aqui o usuário está editando uma despesa que já existe por outro
  // motivo qualquer; marcar reembolso por padrão criaria um lançamento novo sem o usuário pedir
  // de propósito, só porque ele salvou uma edição em outro campo.
  const [createReimbursement, setCreateReimbursement] = useState(false);

  // ---- Comprovante ---- a conta já existe (payable.id) — o upload roda logo depois de
  // updatePayable ter sucesso, mesma ideia de NewPayableModal.tsx.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const liquido = valorLiquido(amountNum, discountNum, surchargeNum);

  useEscapeToClose(open, () => setOpen(false));

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors rounded-md">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Editar Conta a Pagar</h3>
              <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx dark:hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                try {
                  // Mesma trava do lado do servidor (updatePayable, lib/actions/financeiro.ts): com
                  // reembolso já vinculado, o processo desta despesa não muda mais por aqui — o
                  // seletor abaixo fica desabilitado, então formData sempre traz o mesmo caseId
                  // atual nesse caso.
                  const submittedCaseId = hasReimbursement ? (payable.caseId ?? "") : String(formData.get("caseId") || "");
                  const result = await updatePayable(payable.id, {
                    description: String(formData.get("description")),
                    supplierId: String(formData.get("supplierId") || ""),
                    payeeUserId: String(formData.get("payeeUserId") || ""),
                    payeeClientId: String(formData.get("payeeClientId") || ""),
                    costCenterId: String(formData.get("costCenterId") || ""),
                    categoryId: String(formData.get("categoryId") || ""),
                    caseId: submittedCaseId,
                    responsibleId: String(formData.get("responsibleId") || ""),
                    documentType: String(formData.get("documentType") || ""),
                    documentNumber: String(formData.get("documentNumber") || ""),
                    issueDate: String(formData.get("issueDate") || ""),
                    installmentBoleto: String(formData.get("installmentBoleto") || ""),
                    amount,
                    discount,
                    surcharge,
                    dueDate: String(formData.get("dueDate") || ""),
                    noDueDate: semVencimento,
                    kind: submittedCaseId ? kind : undefined,
                    expensePayer: submittedCaseId ? expensePayer : undefined,
                    createReimbursement: submittedCaseId && expensePayer === "CLIENTE" ? createReimbursement : undefined,
                  });
                  setLoading(false);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  if (receiptFile) {
                    const uploadResult = await uploadFinanceReceipt("PAYABLE", payable.id, receiptFile);
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
                {error && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input name="description" defaultValue={payable.description} required className="fin-input" />
                </div>

                <SecaoLancamento title="Identificação" tone="palha">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <ContraparteField
                        suppliers={suppliers}
                        teamMembers={teamMembers}
                        clients={clients}
                        defaultSupplierId={payable.supplierId}
                        defaultPayeeUserId={payable.payeeUserId}
                        defaultPayeeClientId={payable.payeeClientId}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Centro de custo</label>
                      <EntityPicker
                        name="costCenterId"
                        options={costCenters}
                        defaultValue={payable.costCenterId ?? undefined}
                        placeholder="Buscar centro de custo..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo centro de custo"
                        onQuickAdd={createCostCenterQuick}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Categoria</label>
                      <EntityPicker name="categoryId" options={categories} defaultValue={payable.categoryId ?? undefined} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                    </div>
                    <div>
                      <label className={labelCls}>Processo vinculado</label>
                      {hasReimbursement ? (
                        <>
                          <div className="fin-input bg-sf-apoio text-tx-2">
                            {cases.find((c) => c.id === payable.caseId)?.name ?? "—"}
                          </div>
                          <p className="text-[11px] text-tx-2 mt-1">
                            Travado — esta despesa já tem um reembolso vinculado. Para mudar o processo, exclua primeiro o reembolso vinculado.
                          </p>
                        </>
                      ) : (
                        <EntityPicker
                          name="caseId"
                          options={cases}
                          defaultValue={payable.caseId ?? undefined}
                          placeholder="Buscar processo..."
                          emptyLabel="Nenhum"
                          addLabel="Cadastrar novo processo"
                          onQuickAdd={(name) => createCaseQuick(name)}
                          onChange={setCaseId}
                        />
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Responsável pelo lançamento</label>
                      <EntityPicker
                        name="responsibleId"
                        title="Responsável pelo lançamento"
                        options={responsibles}
                        defaultValue={payable.responsibleId ?? undefined}
                        placeholder="Buscar responsável..."
                        emptyLabel="Não informado"
                      />
                    </div>

                    {/* Natureza da despesa e "Quem arca com o custo" só fazem sentido com processo
                        vinculado — mesma regra de NewPayableModal.tsx, ver lib/despesaProcesso.ts. */}
                    {hasCase && (
                      <>
                        <div>
                          <label className={labelCls}>Natureza da despesa</label>
                          <div className="mt-1">
                            <Segmented value={kind} onChange={setKind} options={PAYABLE_KIND_OPTIONS} />
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Quem arca com o custo</label>
                          {hasReimbursement ? (
                            <div className="mt-1">
                              <p className="text-sm font-medium text-tx">{EXPENSE_PAYER_LABELS.CLIENTE}</p>
                              <p className="text-[11px] text-tx-2 mt-1">
                                Travado — já existe um reembolso vinculado a esta despesa. Para voltar a &quot;Escritório&quot;, exclua primeiro o
                                reembolso vinculado.
                              </p>
                            </div>
                          ) : (
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
                          )}
                        </div>
                        {hasReimbursement && payable.reimbursementReceivable && (
                          <div className="sm:col-span-2 bg-marca-bg px-3 py-2.5">
                            <p className="text-xs font-medium text-tx-2">
                              Reembolso vinculado: {formatCurrency(payable.reimbursementReceivable.amount)} · status{" "}
                              {financeStatusLabel(payable.reimbursementReceivable.status)}
                            </p>
                          </div>
                        )}
                        {!hasReimbursement && expensePayer === "CLIENTE" && (
                          <div className="sm:col-span-2 bg-marca-bg px-3 py-2.5">
                            <label className="flex items-center gap-2 text-xs font-medium text-tx-2">
                              <input
                                type="checkbox"
                                checked={createReimbursement}
                                onChange={(e) => setCreateReimbursement(e.target.checked)}
                              />
                              Criar conta a receber vinculada para reembolso deste valor pelo cliente?
                            </label>
                            <p className="text-[11px] text-tx-2 mt-1 ml-6">
                              Gera automaticamente uma Conta a Receber (Reembolso) do cliente do processo, no valor líquido atual desta despesa
                              (lançamento retroativo — a despesa já existia sem reembolso).
                            </p>
                          </div>
                        )}
                      </>
                    )}
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
                        defaultValue={payable.documentType ?? undefined}
                        placeholder="Buscar tipo de documento..."
                        emptyLabel="Não informado"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Número do documento</label>
                      <input name="documentNumber" defaultValue={payable.documentNumber ?? ""} className="fin-input" />
                    </div>
                    <div>
                      <label className={labelCls}>Data de emissão</label>
                      <input name="issueDate" type="date" defaultValue={payable.issueDate?.slice(0, 10) ?? ""} className="fin-input" />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Valores" tone="ouro">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <MoneyInput value={amount} onChange={setAmount} required className="fin-input" />
                    </div>
                    <div>
                      <label className={labelCls}>Desconto (R$)</label>
                      <MoneyInput value={discount} onChange={setDiscount} className="fin-input" />
                    </div>
                    <div>
                      <label className={labelCls}>Acréscimo (R$)</label>
                      <MoneyInput value={surcharge} onChange={setSurcharge} className="fin-input" />
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
                        defaultValue={payable.dueDate.slice(0, 10)}
                        required={!semVencimento}
                        className="fin-input"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-tx-2">
                      Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
                    </p>
                  )}
                </SecaoLancamento>

                {/* Diferente da tela de criação: aqui já existe UM lançamento — não faz sentido
                    reabrir a tabela de parcelas (isso criaria linhas novas do zero). A seção
                    mantém título/tom/ordem para treino visual, mas só edita o que pertence a esta
                    linha específica: o próprio número do boleto e, quando fizer parte de um
                    parcelamento, mostra em qual posição ela está (somente leitura). */}
                <SecaoLancamento title="Parcelamento" tone="rosa">
                  {payable.installmentTotal ? (
                    <p className="text-[11px] text-tx-2 bg-white/60 dark:bg-white/5 px-3 py-1.5">
                      Parcela {payable.installmentNumber}/{payable.installmentTotal} de um lançamento parcelado — para mudar quantidade/intervalo,
                      lance um novo parcelamento.
                    </p>
                  ) : (
                    <p className="text-[11px] text-tx-2">Lançamento único, não parcelado.</p>
                  )}
                  <div>
                    <label className={labelCls}>Nº do boleto desta parcela</label>
                    <input name="installmentBoleto" defaultValue={payable.installmentBoleto ?? ""} className="fin-input" />
                  </div>
                </SecaoLancamento>

                {/* Idem: a baixa em si (criar um FinancePayment) é feita pelo botão "Dar Baixa" da
                    listagem (SettleButton/SettleModal), não por aqui — evita duas telas
                    concorrentes editando o mesmo histórico de pagamentos. Esta seção só resume o
                    que já está lançado. */}
                <SecaoLancamento title="Pagamento" tone="verde">
                  <ComprovanteField
                    file={receiptFile}
                    onFileChange={setReceiptFile}
                    existingUrl={payable.receiptDriveUrl}
                    existingName={payable.receiptFileName}
                  />
                  {payable.status === "PAGO" || payable.status === "PARCIAL" ? (
                    <p className="text-xs text-tx-2">
                      {payable.status === "PARCIAL" ? "Parcialmente pago" : "Pago"}: {formatCurrency(payable.paidAmount ?? 0)}
                      {payable.paidDate && <> em {formatDate(payable.paidDate)}</>}
                      {payable.paymentMethod && <> · {paymentMethodLabels[payable.paymentMethod] ?? payable.paymentMethod}</>}
                      {payable.paymentReceiptNumber && <> · comprovante {payable.paymentReceiptNumber}</>}
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
                    <span className="text-sm font-semibold tabular-nums text-concluido">+{formatCurrency(surchargeNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Líquido</span>
                    <span className="text-lg font-bold tabular-nums text-marca-tx">{formatCurrency(liquido)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium px-4 py-2 text-tx-2 hover:bg-sf"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-5 py-2 disabled:opacity-50 transition-colors">
                    {loading ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; background-color: var(--sf); color: var(--tx); }
        .fin-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </>
  );
}
