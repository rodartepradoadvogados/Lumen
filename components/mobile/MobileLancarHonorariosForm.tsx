"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHonorarioLancamento } from "@/lib/actions/honorarioLancamento";
import { createRecurringFee } from "@/lib/actions/financeiro";
import {
  PERCENTUAL_BASE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  baseValueFor,
  estimatePercentualLiquido,
  type CaseValueBases,
} from "@/lib/honorarioLancamento";
import { valorLiquido } from "@/lib/financeCalc";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/paymentMethods";
import { formatCurrency } from "@/components/ui";
import MobileSecaoLancamento from "@/components/mobile/MobileSecaoLancamento";
import { Send } from "lucide-react";
import MoneyInput from "@/components/MoneyInput";

type Option = { id: string; name: string };
type Natureza = "CONTRATUAL" | "SUCUMBENCIAL" | "ACORDO";
type PayerType = "CLIENTE" | "ADVERSA" | "OUTRO";
type Cobranca = "DINHEIRO" | "PERCENTUAL" | "AMBOS";
type FormaLancamento = "UNICO" | "PARCELADO" | "RECORRENTE";

type CaseOption = { id: string; title: string } & CaseValueBases;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mesma convenção de lib/prazos.ts: soma dias em UTC-meia-noite para não perder um dia por causa
// do fuso horário local (regra do projeto — nunca usar getters locais de Date para data-calendário).
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

// Formulário mobile de Lançar Honorários — página inteira própria (nunca modal de 80vw como o
// desktop, ver components/honorarios/LancarHonorariosModal.tsx, que é exclusivo do outro agente
// nesta fase), chamando o MESMO Server Action createHonorarioLancamento. Serve dois pontos de
// entrada:
//   1) dentro de um processo (app/m/processos/[id]/honorarios/page.tsx) — caseId fixo, sem
//      seletor de processo, bases já vêm prontas.
//   2) app/m/financeiro/receitas/honorarios/page.tsx — sem processo fixo, então `cases` traz a
//      lista de processos ativos com as quatro bases já embutidas (a página que carrega isto
//      busca direto no Prisma — sem depender de nenhum Server Action novo do outro agente) e o
//      usuário escolhe um antes de salvar (honorário sem processo não existe, ver
//      createHonorarioLancamento: caseId é sempre obrigatório).
export default function MobileLancarHonorariosForm({
  fixedCaseId,
  fixedCaseBases,
  cases,
  categories,
  clients,
  costCenters,
  responsibles,
  bankAccounts,
  defaultClientId,
  defaultResponsibleId,
  alreadyReceivedForCase,
  afterSaveHref,
}: {
  // Quando vem de dentro do processo: id fixo e bases já resolvidas.
  fixedCaseId?: string;
  fixedCaseBases?: CaseValueBases;
  // Quando vem da tela geral de Receitas: lista de processos ativos para escolher.
  cases?: CaseOption[];
  categories: Option[];
  clients: Option[];
  costCenters: Option[];
  responsibles: Option[];
  bankAccounts: Option[];
  defaultClientId?: string;
  defaultResponsibleId?: string;
  alreadyReceivedForCase?: number;
  // Para onde ir depois de salvar — quando o processo é fixo, volta para a aba Financeiro dele;
  // na tela geral, o próprio formulário decide (processo escolhido) porque só é conhecido depois
  // que o usuário escolhe no <select>.
  afterSaveHref?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedCaseId, setSelectedCaseId] = useState(fixedCaseId ?? "");
  const bases: CaseValueBases = fixedCaseBases ?? cases?.find((c) => c.id === selectedCaseId) ?? {
    caseValue: null,
    economicBenefitValue: null,
    convictionValue: null,
    agreementValue: null,
  };

  // ---- Identificação ----
  const [natureza, setNatureza] = useState<Natureza>("CONTRATUAL");
  const [payerType, setPayerType] = useState<PayerType>("CLIENTE");
  const [payerName, setPayerName] = useState("");

  // ---- Documento ----
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");

  // ---- Forma de cobrança ----
  const [cobranca, setCobranca] = useState<Cobranca>("DINHEIRO");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [surcharge, setSurcharge] = useState("0");
  const [percentual, setPercentual] = useState("");
  const [percentualBase, setPercentualBase] = useState("VALOR_CAUSA");
  const [abaterEntrada, setAbaterEntrada] = useState(false);

  // ---- Vencimento ----
  const [dueDate, setDueDate] = useState("");
  const [semVencimento, setSemVencimento] = useState(false);

  // ---- Forma de lançamento ----
  const [forma, setForma] = useState<FormaLancamento>("UNICO");
  const parcelado = forma === "PARCELADO";
  const recorrente = forma === "RECORRENTE";
  const [valorTotalIndicado, setValorTotalIndicado] = useState("");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([]);

  // ---- Recorrente até o arquivamento ----
  const [amountMensal, setAmountMensal] = useState("");
  const [dueDay, setDueDay] = useState("10");

  // ---- Recebimento ----
  const [recebido, setRecebido] = useState(false);
  const [paidDate, setPaidDate] = useState(todayStr());
  const [paidAmount, setPaidAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDocumentNumber, setPaymentDocumentNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  const cobrancaHasDinheiro = cobranca !== "PERCENTUAL";
  const cobrancaHasPercentual = cobranca !== "DINHEIRO";

  function handleNaturezaChange(v: Natureza) {
    setNatureza(v);
    // Mesma regra do modal desktop (components/honorarios/LancarHonorariosModal.tsx): só
    // Sucumbencial troca o pagador padrão para Parte adversa; Acordo mantém Cliente, como
    // Contratual (honorário de acordo normalmente ainda é pago pelo cliente do processo).
    setPayerType(v === "SUCUMBENCIAL" ? "ADVERSA" : "CLIENTE");
  }

  function regenerate(count: string, interval: string, total: string) {
    setParcelas((prev) => regenerateParcelas(prev, parseInt(count || "1") || 1, parseInt(interval || "1") || 1, dueDate || todayStr(), total));
  }

  function handleFormaChange(v: FormaLancamento) {
    setForma(v);
    // Trava do enunciado: parcelado e "já foi recebido" são mutuamente exclusivos.
    if (v !== "UNICO") setRecebido(false);
    if (v === "PARCELADO" && parcelas.length === 0) regenerate(installmentCount, installmentIntervalDays, valorTotalIndicado);
  }

  function updateParcela(key: string, patch: Partial<ParcelaRow>) {
    setParcelas((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  // ---- Prévia ao vivo — mesma conta do Server Action, ver lib/financeCalc.ts ----
  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const percentualNum = parseFloat(percentual || "0") || 0;
  const baseValue = baseValueFor(percentualBase, bases);
  const jaPagoEmDinheiro = parcelado ? parcelas.filter((p) => p.pago).reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0) : amountNum;
  const percentualApurado = cobrancaHasPercentual
    ? estimatePercentualLiquido({ percentual: percentualNum, base: percentualBase, values: bases, abaterEntrada, jaPagoEmDinheiro })
    : 0;
  const parcelasSoma = parcelas.reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0);
  const bruto = parcelado
    ? parcelasSoma + (cobrancaHasPercentual ? percentualApurado : 0)
    : (cobrancaHasDinheiro ? amountNum : 0) + (cobrancaHasPercentual ? percentualApurado : 0);
  const liquido = valorLiquido(bruto, parcelado ? 0 : discountNum, parcelado ? 0 : surchargeNum);
  const totalIndicadoNum = parseFloat(valorTotalIndicado || "0") || 0;
  const divergencia = parcelado && totalIndicadoNum > 0 ? parcelasSoma - totalIndicadoNum : 0;

  async function handleSubmit(formData: FormData) {
    setError("");
    const effectiveCaseId = fixedCaseId ?? selectedCaseId;
    if (!effectiveCaseId) {
      setError("Escolha o processo — honorário sem processo vinculado não é permitido.");
      return;
    }
    setLoading(true);
    const description = String(formData.get("description") || "");
    const clientId = String(formData.get("clientId") || "");
    const costCenterId = String(formData.get("costCenterId") || "");
    const categoryId = String(formData.get("categoryId") || "");
    const responsibleId = String(formData.get("responsibleId") || "");

    if (recorrente) {
      const kind =
        natureza === "SUCUMBENCIAL"
          ? "HONORARIOS_SUCUMBENCIAIS"
          : natureza === "ACORDO"
          ? "HONORARIOS_ACORDO"
          : "HONORARIOS_CONTRATUAIS";
      const recResult = await createRecurringFee({
        description,
        amount: amountMensal,
        dueDay,
        kind,
        categoryId: categoryId || undefined,
        costCenterId: costCenterId || undefined,
        caseId: effectiveCaseId,
      });
      setLoading(false);
      if (recResult.error) {
        setError(recResult.error);
        return;
      }
      router.push(afterSaveHref ?? `/m/processos/${effectiveCaseId}?tab=financeiro`);
      return;
    }

    const result = await createHonorarioLancamento({
      description,
      caseId: effectiveCaseId,
      clientId: clientId || undefined,
      costCenterId: costCenterId || undefined,
      categoryId: categoryId || undefined,
      natureza,
      payerType,
      payerName: payerType === "OUTRO" ? payerName : undefined,
      responsibleId: responsibleId || undefined,
      documentType: documentType || undefined,
      documentNumber: documentNumber || undefined,
      issueDate: issueDate || undefined,
      cobranca,
      amount: cobrancaHasDinheiro ? amount : undefined,
      discount: parcelado ? undefined : discount,
      surcharge: parcelado ? undefined : surcharge,
      percentual: cobrancaHasPercentual ? percentual : undefined,
      percentualBase: cobrancaHasPercentual ? percentualBase : undefined,
      abaterEntrada: cobranca === "AMBOS" ? abaterEntrada : false,
      dueDate: semVencimento ? undefined : dueDate,
      noDueDate: semVencimento,
      parcelado,
      valorTotalIndicado: parcelado ? valorTotalIndicado : undefined,
      parcelas: parcelado
        ? parcelas.map((p) => ({ dueDate: p.dueDate, amount: p.amount, installmentBoleto: p.installmentBoleto || undefined, pago: p.pago }))
        : undefined,
      recebido,
      pagamento: recebido
        ? { paidDate, paidAmount, bankAccountId: bankAccountId || undefined, documentNumber: paymentDocumentNumber || undefined, paymentMethod }
        : undefined,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(afterSaveHref ?? `/m/processos/${effectiveCaseId}?tab=financeiro`);
  }

  return (
    <form action={handleSubmit} className="space-y-3 pb-4">
      {alreadyReceivedForCase !== undefined && (
        <p className="text-xs text-tx-2 bg-sf-apoio px-3 py-2">
          Já recebido neste processo: <span className="font-semibold tabular-nums text-tx">{formatCurrency(alreadyReceivedForCase)}</span>
        </p>
      )}
      {error && <p className="text-xs text-urgente bg-urgente-bg px-3 py-2">{error}</p>}

      {cases && (
        <div>
          <label className={labelCls}>Processo</label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            required
            className="mobile-input"
          >
            <option value="" disabled>
              Selecione o processo...
            </option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelCls}>Descrição</label>
        <input name="description" required className="mobile-input" placeholder="Ex: Honorários contratuais" />
      </div>

      <MobileSecaoLancamento title="Identificação" tone="palha">
        <div>
          <label className={labelCls}>Natureza</label>
          <div className="mt-1">
            <Segmented<Natureza>
              value={natureza}
              onChange={handleNaturezaChange}
              options={[
                { value: "CONTRATUAL", label: "Contratual" },
                { value: "SUCUMBENCIAL", label: "Sucumbencial" },
                { value: "ACORDO", label: "Acordo" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Pagador</label>
          <select value={payerType} onChange={(e) => setPayerType(e.target.value as PayerType)} className="mobile-input">
            <option value="CLIENTE">Cliente do processo</option>
            <option value="ADVERSA">Parte adversa</option>
            <option value="OUTRO">Outro</option>
          </select>
        </div>
        {payerType === "OUTRO" && (
          <div>
            <label className={labelCls}>Nome do pagador</label>
            <input value={payerName} onChange={(e) => setPayerName(e.target.value)} required className="mobile-input" />
          </div>
        )}
        <div>
          <label className={labelCls}>Cliente</label>
          <select name="clientId" defaultValue={defaultClientId ?? ""} className="mobile-input">
            <option value="">Nenhum</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Centro de custo</label>
          <select name="costCenterId" defaultValue="" className="mobile-input">
            <option value="">Nenhum</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
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
          <label className={labelCls}>Responsável pelo lançamento</label>
          <select name="responsibleId" defaultValue={defaultResponsibleId} className="mobile-input">
            {responsibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </MobileSecaoLancamento>

      <MobileSecaoLancamento title="Documento" tone="azul" defaultOpen={false}>
        <div>
          <label className={labelCls}>Tipo de documento</label>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="mobile-input">
            <option value="">Não informado</option>
            {DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Número do documento</label>
          <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className="mobile-input" />
        </div>
        <div>
          <label className={labelCls}>Data de emissão</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mobile-input" />
        </div>
      </MobileSecaoLancamento>

      <MobileSecaoLancamento title="Forma de lançamento" tone="rosa">
        <Segmented<FormaLancamento>
          value={forma}
          onChange={handleFormaChange}
          options={[
            { value: "UNICO", label: "Único" },
            { value: "PARCELADO", label: "Parcelado" },
            { value: "RECORRENTE", label: "Recorrente até o arquivamento" },
          ]}
        />

        {parcelado && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Valor total indicado (R$)</label>
              <MoneyInput value={valorTotalIndicado} onChange={setValorTotalIndicado} className="mobile-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Parcelas</label>
                <input
                  type="number"
                  min={1}
                  value={installmentCount}
                  onChange={(e) => {
                    setInstallmentCount(e.target.value);
                    regenerate(e.target.value, installmentIntervalDays, valorTotalIndicado);
                  }}
                  className="mobile-input"
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
                  className="mobile-input"
                />
              </div>
            </div>

            {Math.abs(divergencia) > 0.01 && (
              <p className="text-[11px] text-aviso bg-aviso-bg px-3 py-1.5">
                A soma das parcelas ({formatCurrency(parcelasSoma)}) {divergencia > 0 ? "excede" : "é menor que"} o valor total indicado (
                {formatCurrency(totalIndicadoNum)}) em {formatCurrency(Math.abs(divergencia))}.
              </p>
            )}

            <div className="space-y-2.5">
              {parcelas.map((p, i) => (
                <div key={p.key} className=" border border-regua bg-sf-apoio p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-tx-2">
                      Parcela {i + 1}/{parcelas.length}
                    </span>
                    <label className="flex items-center gap-1.5 text-[11px] text-tx-2">
                      <input type="checkbox" checked={p.pago} onChange={(e) => updateParcela(p.key, { pago: e.target.checked })} />
                      Pago
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={p.dueDate}
                      onChange={(e) => updateParcela(p.key, { dueDate: e.target.value, dueDateManual: true })}
                      className="mobile-input"
                    />
                    <MoneyInput
                      value={p.amount}
                      onChange={(v) => updateParcela(p.key, { amount: v })}
                      className="mobile-input"
                    />
                  </div>
                  <input
                    placeholder="Nº do boleto (opcional)"
                    value={p.installmentBoleto}
                    onChange={(e) => updateParcela(p.key, { installmentBoleto: e.target.value })}
                    className="mobile-input"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-tx-2">
              Parcela quitada antes do cadastro se marca em &quot;Pago&quot; na própria linha — único caminho para lançamento retroativo parcelado.
            </p>
          </div>
        )}

        {recorrente && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Valor mensal (R$)</label>
                <MoneyInput value={amountMensal} onChange={setAmountMensal} required={recorrente} className="mobile-input" />
              </div>
              <div>
                <label className={labelCls}>Dia de vencimento</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  required={recorrente}
                  className="mobile-input"
                />
              </div>
            </div>
            <p className="text-[11px] text-tx-2 bg-white/60 dark:bg-white/5 px-3 py-1.5">
              Gera uma conta a receber por mês, sempre no dia escolhido, e para sozinha quando o processo é arquivado.
            </p>
          </div>
        )}
      </MobileSecaoLancamento>

      {!recorrente && (
        <>
          <MobileSecaoLancamento title="Forma de cobrança" tone="ouro">
            <Segmented<Cobranca>
              value={cobranca}
              onChange={setCobranca}
              options={[
                { value: "DINHEIRO", label: "Dinheiro" },
                { value: "PERCENTUAL", label: "Percentual" },
                { value: "AMBOS", label: "Dinheiro + Percentual" },
              ]}
            />
            {cobrancaHasDinheiro && (
              <div>
                <label className={labelCls}>Valor em dinheiro (R$)</label>
                <MoneyInput value={amount} onChange={setAmount} disabled={parcelado} className="mobile-input disabled:opacity-50" />
                {parcelado && <p className="text-[11px] text-tx-2 mt-1">Substituído pela tabela de parcelas, acima.</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Desconto (R$)</label>
                <MoneyInput value={discount} onChange={setDiscount} disabled={parcelado} className="mobile-input disabled:opacity-50" />
              </div>
              <div>
                <label className={labelCls}>Acréscimo (R$)</label>
                <MoneyInput value={surcharge} onChange={setSurcharge} disabled={parcelado} className="mobile-input disabled:opacity-50" />
              </div>
            </div>

            {cobrancaHasPercentual && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Percentual (%)</label>
                  <input type="number" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="mobile-input" />
                </div>
                <div>
                  <label className={labelCls}>Base</label>
                  <select value={percentualBase} onChange={(e) => setPercentualBase(e.target.value)} className="mobile-input">
                    {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {cobranca === "AMBOS" && (
              <label className="flex items-center gap-2 text-xs text-tx-2">
                <input type="checkbox" checked={abaterEntrada} onChange={(e) => setAbaterEntrada(e.target.checked)} />
                Abater do percentual o que já foi pago em dinheiro
              </label>
            )}

            {cobrancaHasPercentual &&
              (baseValue ? (
                <p className="text-[11px] text-tx-2 bg-white/60 dark:bg-white/5 px-3 py-1.5">
                  {percentualNum || 0}% de {formatCurrency(baseValue)}
                  {abaterEntrada && cobranca === "AMBOS" && <> — abatendo {formatCurrency(jaPagoEmDinheiro)} já pago</>} ={" "}
                  <span className="font-semibold tabular-nums text-tx">{formatCurrency(percentualApurado)}</span> líquido
                </p>
              ) : (
                <p className="text-[11px] text-aviso bg-aviso-bg px-3 py-1.5">
                  A base escolhida ainda não tem valor cadastrado neste processo — esta parcela nasce como provisão &quot;A apurar&quot;, fora do
                  fluxo de caixa, até o desfecho do processo.
                </p>
              ))}
          </MobileSecaoLancamento>

          <MobileSecaoLancamento title="Vencimento" tone="azul">
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
                  required={!semVencimento}
                  className="mobile-input"
                />
              </div>
            ) : (
              <p className="text-[11px] text-tx-2">
                Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
              </p>
            )}
          </MobileSecaoLancamento>
        </>
      )}

      {forma === "UNICO" && (
        <MobileSecaoLancamento title="Recebimento" tone="verde" defaultOpen={false}>
          <label className="flex items-center gap-2 text-xs text-tx-2">
            <input type="checkbox" checked={recebido} onChange={(e) => setRecebido(e.target.checked)} />
            Já foi recebido
          </label>
          {recebido && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data do pagamento</label>
                  <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required={recebido} className="mobile-input" />
                </div>
                <div>
                  <label className={labelCls}>Valor pago (R$)</label>
                  <MoneyInput value={paidAmount} onChange={setPaidAmount} required={recebido} className="mobile-input" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Conta bancária</label>
                <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="mobile-input">
                  <option value="">Nenhuma</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Nº do documento de pagamento</label>
                <input value={paymentDocumentNumber} onChange={(e) => setPaymentDocumentNumber(e.target.value)} className="mobile-input" />
              </div>
              <div>
                <label className={labelCls}>Forma de pagamento</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mobile-input">
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </MobileSecaoLancamento>
      )}

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-sf/95 backdrop-blur border-t border-regua flex items-center justify-between gap-3">
        <div>
          {recorrente ? (
            <>
              <span className="block text-[10px] uppercase tracking-wide text-tx-2">Valor mensal</span>
              <span className="text-base font-bold tabular-nums text-acao">
                {formatCurrency(parseFloat(amountMensal || "0") || 0)}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[10px] uppercase tracking-wide text-tx-2">Líquido</span>
              <span className="text-base font-bold tabular-nums text-acao">{formatCurrency(liquido)}</span>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-5 py-2.5 disabled:opacity-50"
        >
          <Send size={14} /> {loading ? "Salvando..." : "Salvar lançamento"}
        </button>
      </div>

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
    </form>
  );
}
