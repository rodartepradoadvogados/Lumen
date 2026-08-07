"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceivable, type ParcelaInput, type PagamentoInput } from "@/lib/actions/financeiro";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick, createBankAccountQuick } from "@/lib/actions/settings";
import { DOCUMENT_TYPE_OPTIONS, RECEIVABLE_KIND_OPTIONS } from "@/lib/honorarioLancamento";
import { valorLiquido } from "@/lib/financeCalc";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";
import ComprovanteField from "@/components/financeiro/ComprovanteField";
import { uploadFinanceReceipt } from "@/lib/financeReceiptUpload";

type Option = { id: string; name: string };

// Mesmo mapeamento {value,label} -> {id,name} de NewPayableModal.tsx (ver comentário lá).
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

// Idêntica à regenerateParcelas de LancarHonorariosModal.tsx/NewPayableModal.tsx — as três telas
// de lançamento reaproveitam a MESMA regra de regeneração da tabela de parcelas.
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

const labelCls = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

export default function NewReceivableModal({
  categories,
  cases,
  clients,
  costCenters = [],
  responsibles = [],
  bankAccounts = [],
  defaultCaseId,
  defaultClientId,
  defaultResponsibleId,
  label,
  alreadyReceivedForCase,
}: {
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters?: Option[];
  responsibles?: Option[];
  bankAccounts?: Option[];
  defaultCaseId?: string;
  defaultClientId?: string;
  defaultResponsibleId?: string;
  label?: string;
  alreadyReceivedForCase?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---- Identificação ----
  const [kind, setKind] = useState("HONORARIOS_CONTRATUAIS");

  // ---- Documento ---- documentType não é state controlado (ver EntityPicker.tsx, não aceita
  // `value` externo) — lido via formData no submit, mesmo padrão de caseId/clientId/categoryId.
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

  // ---- Recebimento ----
  const [recebido, setRecebido] = useState(false);
  const [paidDate, setPaidDate] = useState(todayStr());
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  // ---- Comprovante ---- mesma ideia de NewPayableModal.tsx: enviado só depois do
  // createReceivable ter sucesso, quando o id real já existe.
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function regenerate(count: string, interval: string, total: string) {
    setParcelas((prev) => regenerateParcelas(prev, parseInt(count || "1") || 1, parseInt(interval || "1") || 1, dueDate || todayStr(), total));
  }

  function handleParceladoToggle(checked: boolean) {
    setParcelado(checked);
    if (checked) {
      setRecebido(false);
      if (parcelas.length === 0) regenerate(installmentCount, installmentIntervalDays, valorTotalIndicado);
    }
  }

  function handleRecebidoToggle(checked: boolean) {
    setRecebido(checked);
    if (checked) setParcelado(false);
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {label ?? "Nova Conta a Receber"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">{label ?? "Nova Conta a Receber"}</h3>
              <button onClick={resetAndClose} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                try {
                  const description = String(formData.get("description") || "");
                  const clientId = String(formData.get("clientId") || "");
                  const costCenterId = String(formData.get("costCenterId") || "");
                  const categoryId = String(formData.get("categoryId") || "");
                  const caseId = defaultCaseId || String(formData.get("caseId") || "");
                  const responsibleId = String(formData.get("responsibleId") || "");
                  const bankAccountId = String(formData.get("bankAccountId") || "");
                  const paymentDocumentNumber = String(formData.get("paymentDocumentNumber") || "");

                  const parcelasInput: ParcelaInput[] = parcelas.map((p) => ({
                    dueDate: p.dueDate,
                    amount: p.amount,
                    installmentBoleto: p.installmentBoleto || undefined,
                    pago: p.pago,
                  }));
                  const pagamentoInput: PagamentoInput | undefined = recebido
                    ? { paidDate, paidAmount, bankAccountId: bankAccountId || undefined, documentNumber: paymentDocumentNumber || undefined, paymentMethod }
                    : undefined;

                  const result = await createReceivable({
                    description,
                    clientId: clientId || undefined,
                    costCenterId: costCenterId || undefined,
                    categoryId: categoryId || undefined,
                    caseId: caseId || undefined,
                    responsibleId: responsibleId || undefined,
                    kind,
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
                    recebido,
                    pagamento: pagamentoInput,
                  });
                  setLoading(false);
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
                  setLoading(false);
                  setError(err instanceof Error ? err.message : "Não foi possível salvar o lançamento. Tente novamente.");
                }
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {alreadyReceivedForCase !== undefined && (
                  <p className="text-xs text-navy-800/50 dark:text-cream-50/50 bg-cream-50 dark:bg-navy-800 rounded-lg px-3 py-2">
                    Já recebido neste processo:{" "}
                    <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(alreadyReceivedForCase)}</span>
                  </p>
                )}
                {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input name="description" required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" placeholder="Ex: Honorários contratuais" />
                </div>

                <SecaoLancamento title="Identificação" tone="palha">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Cliente</label>
                      <EntityPicker
                        name="clientId"
                        options={clients}
                        defaultValue={defaultClientId}
                        placeholder="Buscar cliente..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo cliente"
                        onQuickAdd={createClientQuick}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Tipo de Honorário</label>
                      <select value={kind} onChange={(e) => setKind(e.target.value)} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
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
                        />
                      </div>
                    )}
                    <div>
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
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Data de emissão</label>
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Valores" tone="ouro">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={parcelado}
                        required={!parcelado}
                        className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 disabled:opacity-50"
                      />
                      {parcelado && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Substituído pela tabela de parcelas, abaixo.</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Desconto (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                        disabled={parcelado}
                        className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Acréscimo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={surcharge}
                        onChange={(e) => setSurcharge(e.target.value)}
                        disabled={parcelado}
                        className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Vencimento" tone="azul">
                  <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
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
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                      Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
                    </p>
                  )}
                </SecaoLancamento>

                <SecaoLancamento title="Parcelamento" tone="rosa">
                  <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                    <input type="checkbox" checked={parcelado} disabled={recebido} onChange={(e) => handleParceladoToggle(e.target.checked)} />
                    Lançamento parcelado
                  </label>
                  {recebido && <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40">Indisponível com &quot;Já foi recebido&quot; marcado, abaixo.</p>}

                  {parcelado && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Valor total indicado (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={valorTotalIndicado}
                            onChange={(e) => setValorTotalIndicado(e.target.value)}
                            className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
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
                            className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
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
                            className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                          />
                        </div>
                      </div>

                      {Math.abs(divergencia) > 0.01 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
                          A soma das parcelas ({formatCurrency(parcelasSoma)}) {divergencia > 0 ? "excede" : "é menor que"} o valor total indicado (
                          {formatCurrency(totalIndicadoNum)}) em {formatCurrency(Math.abs(divergencia))}.
                        </p>
                      )}

                      <div className="overflow-x-auto rounded-lg border border-navy-800/10 dark:border-white/10">
                        <table className="w-full text-xs">
                          <thead className="bg-white/50 dark:bg-white/5">
                            <tr className="text-left text-navy-800/50 dark:text-cream-50/50">
                              <th className="px-2 py-1.5 font-medium">Parcela</th>
                              <th className="px-2 py-1.5 font-medium">Vencimento</th>
                              <th className="px-2 py-1.5 font-medium">Valor (R$)</th>
                              <th className="px-2 py-1.5 font-medium">Nº do boleto</th>
                              <th className="px-2 py-1.5 font-medium text-center">Pago</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parcelas.map((p, i) => (
                              <tr key={p.key} className="border-t border-navy-800/8 dark:border-white/10">
                                <td className="px-2 py-1.5 text-navy-800/70 dark:text-cream-50/70 whitespace-nowrap">
                                  {i + 1}/{parcelas.length}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="date"
                                    value={p.dueDate}
                                    onChange={(e) => updateParcela(p.key, { dueDate: e.target.value, dueDateManual: true })}
                                    className="w-full bg-transparent border border-navy-800/12 dark:border-white/15 rounded-md px-1.5 py-1 text-navy-900 dark:text-cream-50"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={p.amount}
                                    onChange={(e) => updateParcela(p.key, { amount: e.target.value })}
                                    className="w-full bg-transparent border border-navy-800/12 dark:border-white/15 rounded-md px-1.5 py-1 text-navy-900 dark:text-cream-50"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={p.installmentBoleto}
                                    onChange={(e) => updateParcela(p.key, { installmentBoleto: e.target.value })}
                                    className="w-full bg-transparent border border-navy-800/12 dark:border-white/15 rounded-md px-1.5 py-1 text-navy-900 dark:text-cream-50"
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
                      <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                        Parcela quitada antes do cadastro se marca na coluna &quot;Pago&quot; da própria linha — é o único caminho para lançamento
                        retroativo parcelado.
                      </p>
                    </div>
                  )}
                </SecaoLancamento>

                <SecaoLancamento title="Recebimento" tone="verde">
                  <ComprovanteField file={receiptFile} onFileChange={setReceiptFile} />
                  <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                    <input type="checkbox" checked={recebido} disabled={parcelado} onChange={(e) => handleRecebidoToggle(e.target.checked)} />
                    Já foi recebido
                  </label>
                  {parcelado && (
                    <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40">
                      Indisponível com &quot;Lançamento parcelado&quot; marcado, acima — quite parcelas retroativas na própria tabela de parcelas.
                    </p>
                  )}

                  {recebido && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Data do pagamento</label>
                        <input
                          type="date"
                          value={paidDate}
                          onChange={(e) => setPaidDate(e.target.value)}
                          required={recebido}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Valor pago (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                          required={recebido}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
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
                        <input name="paymentDocumentNumber" className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Forma de pagamento</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
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
              </div>

              <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-cream-50/60 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Bruto</span>
                    <span className="text-sm font-semibold tabular-nums text-navy-900 dark:text-cream-50">{formatCurrency(bruto)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Desconto</span>
                    <span className="text-sm font-semibold tabular-nums text-bordo-600 dark:text-bordo-400">
                      -{formatCurrency(parcelado ? 0 : discountNum)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Acréscimo</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{formatCurrency(parcelado ? 0 : surchargeNum)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Líquido</span>
                    <span className="font-serif text-lg font-bold tabular-nums text-gold-700 dark:text-gold-400">{formatCurrency(liquido)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="text-sm font-medium px-4 py-2 rounded-lg text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-gold-600 hover:bg-gold-700 text-white font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50">
                    {loading ? "Salvando..." : "Salvar lançamento"}
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
