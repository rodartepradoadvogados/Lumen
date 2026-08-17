"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPayable, createRecurringExpense, type ParcelaInput, type PagamentoInput } from "@/lib/actions/financeiro";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick, createBankAccountQuick } from "@/lib/actions/settings";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/honorarioLancamento";
import { PAYABLE_KIND_OPTIONS, EXPENSE_PAYER_LABELS } from "@/lib/despesaProcesso";
import { valorLiquido } from "@/lib/financeCalc";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import ContraparteField from "@/components/financeiro/ContraparteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";
import MoneyInput from "@/components/MoneyInput";

type Option = { id: string; name: string };

// DOCUMENT_TYPE_OPTIONS é {value,label} (mesmo catálogo usado por um <select> comum) — EntityPicker
// espera {id,name}, ver components/EntityPicker.tsx. Só o formato muda, o catálogo é o mesmo.
const documentTypeOptions: Option[] = DOCUMENT_TYPE_OPTIONS.map((o) => ({ id: o.value, name: o.label }));

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mesma convenção de soma de dias em UTC-meia-noite usada em
// components/honorarios/LancarHonorariosModal.tsx e lib/prazos.ts.
function addDaysStr(dateStr: string, days: number): string {
  const base = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date();
  const d = new Date(base.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

type ParcelaRow = {
  key: string;
  dueDate: string;
  dueDateManual: boolean;
  amount: string;
  installmentBoleto: string;
  pago: boolean;
};

type ExpensePayer = "ESCRITORIO" | "CLIENTE";

// Mesmo componente (copiado, não importado — cada tela de lançamento mantém sua própria cópia
// local, ver comentário equivalente em LancarHonorariosModal.tsx) usado para a Natureza da
// despesa e para "Quem arca com o custo", abaixo — só aparece quando há processo vinculado.
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
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
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

// Idêntica à regenerateParcelas de LancarHonorariosModal.tsx — as três telas de lançamento
// (Honorários, Conta a Pagar, Conta a Receber) reaproveitam a MESMA regra de regeneração da
// tabela de parcelas, não cópias divergentes: preserva o que já foi digitado nas linhas que
// continuam existindo, só recalcula vencimento "automático" (dueDateManual=false).
function regenerateParcelas(prev: ParcelaRow[], count: number, intervalDays: number, baseDate: string, totalIndicado: string): ParcelaRow[] {
  const n = Math.max(1, count);
  const total = parseFloat(totalIndicado || "0") || 0;
  const perParcela = total > 0 ? total / n : 0;
  const rows: ParcelaRow[] = [];
  for (let i = 0; i < n; i++) {
    const existing = prev[i];
    if (existing) {
      rows.push(existing.dueDateManual ? existing : { ...existing, dueDate: addDaysStr(baseDate, i * intervalDays) });
    } else {
      rows.push({
        key: crypto.randomUUID(),
        dueDate: addDaysStr(baseDate, i * intervalDays),
        dueDateManual: false,
        amount: perParcela ? perParcela.toFixed(2) : "",
        installmentBoleto: "",
        pago: false,
      });
    }
  }
  return rows;
}

const labelCls = "text-xs font-medium text-tx-2";

export default function NewPayableModal({
  categories,
  cases,
  suppliers,
  costCenters = [],
  responsibles = [],
  bankAccounts = [],
  teamMembers = [],
  clients,
  defaultResponsibleId,
  defaultCaseId,
}: {
  categories: Option[];
  cases: Option[];
  suppliers: Option[];
  costCenters?: Option[];
  responsibles?: Option[];
  bankAccounts?: Option[];
  // Pago a um membro da equipe em vez de a um Fornecedor — ver components/financeiro/ContraparteField.tsx.
  teamMembers?: Option[];
  // Pago a um cliente (repasse/devolução) — mesmo componente, botão "Cliente" só aparece quando
  // esta prop vem preenchida (ver ContraparteField.tsx).
  clients?: Option[];
  defaultResponsibleId?: string;
  // Presente = entrada pelo Processo (aba Financeiro → "+ Lançar Despesa"): pré-seleciona e trava
  // o processo, exatamente como LancarHonorariosModal.tsx faz. Ausente = entrada pelo Financeiro
  // central (Contas a Pagar), comportamento de sempre — processo opcional, escolhido à mão.
  defaultCaseId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---- Processo / Despesa do Processo (Fase 10) ----
  // Com defaultCaseId (entrada pelo Processo) nunca muda depois do mount. Sem defaultCaseId
  // (entrada pelo Financeiro), começa vazio e só é preenchido se o usuário escolher um processo
  // no seletor genérico da seção Identificação — nos dois casos, é isto que decide se a Natureza
  // da despesa/"Quem arca com o custo" aparecem (não fazem sentido para despesa sem processo).
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const hasCase = Boolean(caseId);
  const [kind, setKind] = useState("OUTROS");
  const [expensePayer, setExpensePayer] = useState<ExpensePayer>("ESCRITORIO");
  const [createReimbursement, setCreateReimbursement] = useState(true);

  // ---- Documento ---- documentType não é state controlado (ver EntityPicker.tsx, não aceita
  // `value` externo) — lido via formData no submit, mesmo padrão de caseId/supplierId/categoryId.
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");

  // ---- Valores ----
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [surcharge, setSurcharge] = useState("0");

  // ---- Vencimento ----
  const [dueDate, setDueDate] = useState("");
  const [semVencimento, setSemVencimento] = useState(false);

  // ---- Parcelamento ----
  const [parcelado, setParcelado] = useState(false);
  const [valorTotalIndicado, setValorTotalIndicado] = useState("");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([]);

  // ---- Pagamento ----
  const [pago, setPago] = useState(false);
  const [paidDate, setPaidDate] = useState(todayStr());
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  // ---- Despesa recorrente, sem data de fim (ver RecurringExpense, prisma/schema.prisma) ----
  // Mutuamente exclusivo com parcelado/pago (ver handlers abaixo) — quando marcado, o submit vai
  // inteiro para createRecurringExpense em vez de createPayable, e as seções Vencimento/
  // Parcelamento/Pagamento somem da tela (não fazem sentido para um "molde" mensal indefinido).
  const [recorrente, setRecorrente] = useState(false);
  const [recorrenteDueDay, setRecorrenteDueDay] = useState("10");

  // ---- Comprovante ---- a conta ainda não existe neste ponto (o id só nasce depois do
  // createPayable abaixo) — o arquivo fica em memória e só é enviado depois do create ter
  // sucesso, ver o "action" do form.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function regenerate(count: string, interval: string, total: string) {
    setParcelas((prev) => regenerateParcelas(prev, parseInt(count || "1") || 1, parseInt(interval || "1") || 1, dueDate || todayStr(), total));
  }

  function handleParceladoToggle(checked: boolean) {
    setParcelado(checked);
    if (checked) {
      setPago(false);
      setRecorrente(false);
      if (parcelas.length === 0) regenerate(installmentCount, installmentIntervalDays, valorTotalIndicado);
    }
  }

  function handlePagoToggle(checked: boolean) {
    setPago(checked);
    if (checked) {
      setParcelado(false);
      setRecorrente(false);
    }
  }

  function handleRecorrenteToggle(checked: boolean) {
    setRecorrente(checked);
    if (checked) {
      setParcelado(false);
      setPago(false);
    }
  }

  function updateParcela(key: string, patch: Partial<ParcelaRow>) {
    setParcelas((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const parcelasSoma = parcelas.reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0);
  const bruto = parcelado ? parcelasSoma : amountNum;
  const liquido = valorLiquido(bruto, parcelado ? 0 : discountNum, parcelado ? 0 : surchargeNum);
  const totalIndicadoNum = parseFloat(valorTotalIndicado || "0") || 0;
  const divergencia = parcelado && totalIndicadoNum > 0 ? parcelasSoma - totalIndicadoNum : 0;

  function resetAndClose() {
    setOpen(false);
  }

  useEscapeToClose(open, resetAndClose);

  // Rótulo muda conforme a entrada (mesma ideia de LancarHonorariosModal, que sempre mostra
  // "Lançar Honorários" — aqui o texto reflete o que a Fase 10 pediu: dentro do Processo isto é
  // "Lançar Despesa"; no Financeiro central continua "Nova Conta a Pagar", como sempre foi.
  const title = defaultCaseId ? "Lançar Despesa" : "Nova Conta a Pagar";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {title}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf rounded-xl shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">{title}</h3>
              <button onClick={resetAndClose} className="text-tx-3 hover:text-tx dark:hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                try {
                  const description = String(formData.get("description") || "");
                  const supplierId = String(formData.get("supplierId") || "");
                  const payeeUserId = String(formData.get("payeeUserId") || "");
                  const payeeClientId = String(formData.get("payeeClientId") || "");
                  const costCenterId = String(formData.get("costCenterId") || "");
                  const categoryId = String(formData.get("categoryId") || "");

                  // Despesa recorrente é um "molde" mensal indefinido — não é um Payable em si
                  // (não tem vencimento único, parcelamento nem baixa própria), vai inteiro para
                  // createRecurringExpense e sai daqui sem tocar em nada do resto do formulário
                  // (parcelas/pagamento/comprovante não fazem sentido pra ela).
                  if (recorrente) {
                    const recResult = await createRecurringExpense({
                      description,
                      amount,
                      dueDay: recorrenteDueDay,
                      categoryId: categoryId || undefined,
                      costCenterId: costCenterId || undefined,
                      supplierId: supplierId || undefined,
                      payeeUserId: payeeUserId || undefined,
                      payeeClientId: payeeClientId || undefined,
                    });
                    setLoading(false);
                    if (recResult.error) {
                      setError(recResult.error);
                      return;
                    }
                    setOpen(false);
                    router.refresh();
                    return;
                  }

                  // Vem da prop fixa (entrada pelo Processo) ou do seletor da seção Identificação
                  // (entrada pelo Financeiro central) — mesma convenção de LancarHonorariosModal.tsx.
                  const effectiveCaseId = defaultCaseId || caseId;
                  const responsibleId = String(formData.get("responsibleId") || "");
                  const bankAccountId = String(formData.get("bankAccountId") || "");
                  const paymentDocumentNumber = String(formData.get("paymentDocumentNumber") || "");

                  const parcelasInput: ParcelaInput[] = parcelas.map((p) => ({
                    dueDate: p.dueDate,
                    amount: p.amount,
                    installmentBoleto: p.installmentBoleto || undefined,
                    pago: p.pago,
                  }));
                  const pagamentoInput: PagamentoInput | undefined = pago
                    ? { paidDate, paidAmount, bankAccountId: bankAccountId || undefined, documentNumber: paymentDocumentNumber || undefined, paymentMethod }
                    : undefined;

                  const result = await createPayable({
                    description,
                    supplierId: supplierId || undefined,
                    payeeUserId: payeeUserId || undefined,
                    payeeClientId: payeeClientId || undefined,
                    costCenterId: costCenterId || undefined,
                    categoryId: categoryId || undefined,
                    caseId: effectiveCaseId || undefined,
                    kind: effectiveCaseId ? kind : undefined,
                    expensePayer: effectiveCaseId ? expensePayer : undefined,
                    createReimbursement: effectiveCaseId && expensePayer === "CLIENTE" ? createReimbursement : undefined,
                    responsibleId: responsibleId || undefined,
                    documentType: String(formData.get("documentType") || "") || undefined,
                    documentNumber: documentNumber || undefined,
                    issueDate: issueDate || undefined,
                    amount: parcelado ? undefined : amount,
                    discount: parcelado ? undefined : discount,
                    surcharge: parcelado ? undefined : surcharge,
                    dueDate: semVencimento ? undefined : dueDate,
                    noDueDate: semVencimento,
                    parcelado,
                    parcelas: parcelado ? parcelasInput : undefined,
                    pago,
                    pagamento: pagamentoInput,
                  });
                  setLoading(false);
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
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  setLoading(false);
                  setError(err instanceof Error ? err.message : "Não foi possível salvar o lançamento. Tente novamente.");
                }
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {error && <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2">{error}</p>}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input name="description" required className="fin-input" placeholder="Ex: Aluguel escritório" />
                </div>

                <SecaoLancamento title="Identificação" tone="palha">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <ContraparteField suppliers={suppliers} teamMembers={teamMembers} clients={clients} />
                    </div>
                    <div>
                      <label className={labelCls}>Centro de custo</label>
                      <EntityPicker
                        name="costCenterId"
                        options={costCenters}
                        placeholder="Buscar centro de custo..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo centro de custo"
                        onQuickAdd={createCostCenterQuick}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Categoria</label>
                      <EntityPicker name="categoryId" options={categories} placeholder="Buscar categoria..." emptyLabel="Sem categoria" />
                    </div>
                    {!defaultCaseId && (
                      <div>
                        <label className={labelCls}>Processo vinculado (opcional)</label>
                        <EntityPicker
                          name="caseId"
                          options={cases}
                          placeholder="Buscar processo..."
                          emptyLabel="Nenhum"
                          addLabel="Cadastrar novo processo"
                          onQuickAdd={(name) => createCaseQuick(name)}
                          onChange={setCaseId}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Responsável pelo lançamento</label>
                      <EntityPicker
                        name="responsibleId"
                        title="Responsável pelo lançamento"
                        options={responsibles}
                        defaultValue={defaultResponsibleId}
                        placeholder="Buscar responsável..."
                        emptyLabel="Não informado"
                      />
                    </div>

                    {/* Natureza da despesa e "Quem arca com o custo" só fazem sentido com processo
                        vinculado (defaultCaseId, entrada pelo Processo, ou escolhido acima na
                        entrada pelo Financeiro central) — ver lib/despesaProcesso.ts. */}
                    {hasCase && (
                      <>
                        <div>
                          <label className={labelCls}>Natureza da despesa</label>
                          <div className="mt-1">
                            <Segmented
                              value={kind}
                              onChange={setKind}
                              options={PAYABLE_KIND_OPTIONS}
                            />
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
                          <div className="sm:col-span-2 rounded-lg bg-marca-bg px-3 py-2.5">
                            <label className="flex items-center gap-2 text-xs font-medium text-tx-2">
                              <input
                                type="checkbox"
                                checked={createReimbursement}
                                onChange={(e) => setCreateReimbursement(e.target.checked)}
                              />
                              Criar conta a receber vinculada para reembolso deste valor pelo cliente?
                            </label>
                            <p className="text-[11px] text-tx-2 mt-1 ml-6">
                              Gera automaticamente uma Conta a Receber (Reembolso) do cliente do processo, no valor líquido total desta
                              despesa{parcelado ? " (parcelada ou não, o reembolso nasce como um único lançamento pelo total)" : ""}.
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
                        placeholder="Buscar tipo de documento..."
                        emptyLabel="Não informado"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Número do documento</label>
                      <input
                        value={documentNumber}
                        onChange={(e) => setDocumentNumber(e.target.value)}
                        className="fin-input"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Data de emissão</label>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="fin-input"
                      />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Valores" tone="ouro">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <MoneyInput
                        value={amount}
                        onChange={setAmount}
                        disabled={parcelado}
                        required={!parcelado}
                        className="fin-input disabled:opacity-50"
                      />
                      {parcelado && <p className="text-[11px] text-tx-2 mt-1">Substituído pela tabela de parcelas, abaixo.</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Desconto (R$)</label>
                      <MoneyInput
                        value={discount}
                        onChange={setDiscount}
                        disabled={parcelado || recorrente}
                        className="fin-input disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Acréscimo (R$)</label>
                      <MoneyInput
                        value={surcharge}
                        onChange={setSurcharge}
                        disabled={parcelado || recorrente}
                        className="fin-input disabled:opacity-50"
                      />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title={recorrente ? "Recorrência" : "Vencimento"} tone="azul">
                  {/* Despesa recorrente é sempre do escritório como um todo (RecurringExpense não
                      tem caseId) — some daqui quando a entrada é pelo Processo (defaultCaseId),
                      pra não deixar o usuário marcar algo que silenciosamente ignoraria o
                      processo escolhido. */}
                  {!defaultCaseId && (
                    <label className="flex items-center gap-2 text-xs text-tx-2">
                      <input type="checkbox" checked={recorrente} onChange={(e) => handleRecorrenteToggle(e.target.checked)} />
                      Despesa recorrente (sem data de fim)
                    </label>
                  )}
                  {recorrente ? (
                    <>
                      <p className="text-[11px] text-tx-2">
                        Ex.: honorário de advogado contratado, salário de funcionário/estagiário, assinatura de software (Claude, Jusbrasil,
                        T.I....) — gera a conta automaticamente todo mês, sem precisar lançar de novo. Encerre quando o contrato/assinatura
                        acabar (fica um card &quot;Despesa recorrente&quot; no topo da listagem, com o botão Encerrar).
                      </p>
                      <div>
                        <label className={labelCls}>Dia do vencimento (todo mês)</label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={recorrenteDueDay}
                          onChange={(e) => setRecorrenteDueDay(e.target.value)}
                          required
                          className="fin-input"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-xs text-tx-2">
                        <input type="checkbox" checked={semVencimento} onChange={(e) => setSemVencimento(e.target.checked)} />
                        Sem vencimento definido
                      </label>
                      {!semVencimento ? (
                        <div>
                          <label className={labelCls}>Data de vencimento</label>
                          <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            required={!semVencimento && !parcelado}
                            className="fin-input"
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-tx-2">
                          Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
                        </p>
                      )}
                    </>
                  )}
                </SecaoLancamento>

                {!recorrente && (
                <SecaoLancamento title="Parcelamento" tone="rosa">
                  <label className="flex items-center gap-2 text-xs text-tx-2">
                    <input type="checkbox" checked={parcelado} disabled={pago} onChange={(e) => handleParceladoToggle(e.target.checked)} />
                    Lançamento parcelado
                  </label>
                  {pago && <p className="text-[11px] text-tx-3">Indisponível com &quot;Já foi pago&quot; marcado, abaixo.</p>}

                  {parcelado && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Valor total indicado (R$)</label>
                          <MoneyInput
                            value={valorTotalIndicado}
                            onChange={setValorTotalIndicado}
                            className="fin-input"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Quantidade de parcelas</label>
                          <input
                            type="number"
                            min={1}
                            value={installmentCount}
                            onChange={(e) => {
                              setInstallmentCount(e.target.value);
                              regenerate(e.target.value, installmentIntervalDays, valorTotalIndicado);
                            }}
                            className="fin-input"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Intervalo (dias)</label>
                          <input
                            type="number"
                            min={1}
                            value={installmentIntervalDays}
                            onChange={(e) => {
                              setInstallmentIntervalDays(e.target.value);
                              regenerate(installmentCount, e.target.value, valorTotalIndicado);
                            }}
                            className="fin-input"
                          />
                        </div>
                      </div>

                      {Math.abs(divergencia) > 0.01 && (
                        <p className="text-[11px] text-aviso bg-aviso-bg rounded-lg px-3 py-1.5">
                          A soma das parcelas ({formatCurrency(parcelasSoma)}) {divergencia > 0 ? "excede" : "é menor que"} o valor total indicado (
                          {formatCurrency(totalIndicadoNum)}) em {formatCurrency(Math.abs(divergencia))}.
                        </p>
                      )}

                      <div className="overflow-x-auto rounded-lg border border-regua">
                        <table className="w-full text-xs">
                          <thead className="bg-white/50 dark:bg-white/5">
                            <tr className="text-left text-tx-2">
                              <th className="px-2 py-1.5 font-medium">Parcela</th>
                              <th className="px-2 py-1.5 font-medium">Vencimento</th>
                              <th className="px-2 py-1.5 font-medium">Valor (R$)</th>
                              <th className="px-2 py-1.5 font-medium">Nº do boleto</th>
                              <th className="px-2 py-1.5 font-medium text-center">Pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parcelas.map((p, i) => (
                              <tr key={p.key} className="border-t border-regua">
                                <td className="px-2 py-1.5 text-tx-2 whitespace-nowrap">
                                  {i + 1}/{parcelas.length}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="date"
                                    value={p.dueDate}
                                    onChange={(e) => updateParcela(p.key, { dueDate: e.target.value, dueDateManual: true })}
                                    className="w-full bg-transparent border border-regua-forte rounded-md px-1.5 py-1 text-tx"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <MoneyInput
                                    value={p.amount}
                                    onChange={(v) => updateParcela(p.key, { amount: v })}
                                    className="w-full bg-transparent border border-regua-forte rounded-md px-1.5 py-1 text-tx"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={p.installmentBoleto}
                                    onChange={(e) => updateParcela(p.key, { installmentBoleto: e.target.value })}
                                    className="w-full bg-transparent border border-regua-forte rounded-md px-1.5 py-1 text-tx"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" checked={p.pago} onChange={(e) => updateParcela(p.key, { pago: e.target.checked })} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-tx-2">
                        Parcela quitada antes do cadastro se marca na coluna &quot;Pago&quot; da própria linha — é o único caminho para lançamento
                        retroativo parcelado.
                      </p>
                    </div>
                  )}
                </SecaoLancamento>
                )}

                {!recorrente && (
                <SecaoLancamento title="Pagamento" tone="verde">
                  <ComprovanteField file={receiptFile} onFileChange={setReceiptFile} />
                  <label className="flex items-center gap-2 text-xs text-tx-2">
                    <input type="checkbox" checked={pago} disabled={parcelado} onChange={(e) => handlePagoToggle(e.target.checked)} />
                    Já foi pago
                  </label>
                  {parcelado && (
                    <p className="text-[11px] text-tx-3">
                      Indisponível com &quot;Lançamento parcelado&quot; marcado, acima — quite parcelas retroativas na própria tabela de parcelas.
                    </p>
                  )}

                  {pago && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Data do pagamento</label>
                        <input
                          type="date"
                          value={paidDate}
                          onChange={(e) => setPaidDate(e.target.value)}
                          required={pago}
                          className="fin-input"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Valor pago (R$)</label>
                        <MoneyInput
                          value={paidAmount}
                          onChange={setPaidAmount}
                          required={pago}
                          className="fin-input"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Conta bancária</label>
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
                        <label className={labelCls}>Nº do documento de pagamento</label>
                        <input name="paymentDocumentNumber" className="fin-input" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Forma de pagamento</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="fin-input"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </SecaoLancamento>
                )}
              </div>

              <div className="shrink-0 border-t border-regua px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-sf-apoio">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Bruto</span>
                    <span className="text-sm font-semibold tabular-nums text-tx">{formatCurrency(bruto)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Desconto</span>
                    <span className="text-sm font-semibold tabular-nums text-urgente">
                      -{formatCurrency(parcelado ? 0 : discountNum)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Acréscimo</span>
                    <span className="text-sm font-semibold tabular-nums text-concluido">
                      +{formatCurrency(parcelado ? 0 : surchargeNum)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-tx-2">Líquido</span>
                    <span className="text-lg font-bold tabular-nums text-marca-tx">{formatCurrency(liquido)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="text-sm font-medium px-4 py-2 rounded-lg text-tx-2 hover:bg-sf"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
                    {loading ? "Salvando..." : "Salvar lançamento"}
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
