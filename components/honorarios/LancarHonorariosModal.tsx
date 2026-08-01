"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHonorarioLancamento, getCaseBases } from "@/lib/actions/honorarioLancamento";
import { createRecurringFee } from "@/lib/actions/financeiro";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick, createBankAccountQuick } from "@/lib/actions/settings";
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
import { Plus, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";

type Option = { id: string; name: string };
type Natureza = "CONTRATUAL" | "SUCUMBENCIAL";
type PayerType = "CLIENTE" | "ADVERSA" | "OUTRO";
type Cobranca = "DINHEIRO" | "PERCENTUAL" | "AMBOS";
// "Forma de lançamento" (restaurado — Fase 4): ÚNICO e PARCELADO já existiam (como o antigo
// checkbox "Lançamento parcelado"); RECORRENTE é o honorário "até o arquivamento" que morava no
// extinto NewReceivableModal (só aparecia com defaultCaseId) e ficou sem porta de entrada quando
// a Fase 2 trocou aquele modal por este — chama lib/actions/financeiro.ts:createRecurringFee, que
// nunca deixou de existir/funcionar. Precisa de processo vinculado (é o próprio requisito de
// createRecurringFee): entrando pelo Processo (defaultCaseId fixo) sempre disponível, como sempre
// foi; entrando pelo Financeiro (Fase 7 — defaultCaseId ausente) fica desabilitada até o usuário
// escolher um processo no seletor da seção Identificação, ver `hasCase` abaixo.
type FormaLancamento = "UNICO" | "PARCELADO" | "RECORRENTE";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Soma dias a uma data-calendário "YYYY-MM-DD" em UTC-meia-noite — mesma convenção usada em
// lib/prazos.ts, para não "perder" um dia por causa de fuso horário local.
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

// Regenera as N linhas da tabela de parcelamento preservando o que já foi digitado nas linhas
// que continuam existindo (mesmo índice): o vencimento só é recalculado quando o usuário nunca
// editou aquela linha à mão (dueDateManual=false) — assim, mudar a quantidade/intervalo empurra
// as datas "automáticas" para o novo espaçamento, mas nunca pisa numa data que alguém já ajustou
// manualmente (ex.: por causa de um feriado). Linhas novas nascem com valor = total indicado
// dividido igualmente; linhas que somem (quantidade diminuiu) são só descartadas.
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
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  // `disabled` por opção — usado pela "Recorrente até o arquivamento" quando o Lançar Honorários
  // é aberto pelo Financeiro (Fase 7) e nenhum processo foi escolhido ainda (ver `hasCase`).
  options: { value: T; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled || opt.disabled}
          title={opt.disabled ? "Escolha um processo para habilitar" : undefined}
          onClick={() => onChange(opt.value)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            value === opt.value
              ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
              : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const labelCls = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

// Bases zeradas — usadas como fallback enquanto ninguém escolheu processo ainda (entrando pelo
// Financeiro, Fase 7): baseValueFor() devolve null para as quatro, cai no mesmo caminho de "base
// sem valor" que a entrada pelo Processo já tratava, sem precisar duplicar lógica.
const EMPTY_BASES: CaseValueBases = { caseValue: null, economicBenefitValue: null, convictionValue: null, agreementValue: null };

export default function LancarHonorariosModal({
  categories,
  clients,
  costCenters = [],
  responsibles,
  bankAccounts,
  cases,
  defaultCaseId,
  defaultClientId,
  defaultResponsibleId,
  bases,
  alreadyReceivedForCase,
  prefill,
  autoOpen,
}: {
  categories: Option[];
  clients: Option[];
  costCenters?: Option[];
  responsibles: Option[];
  bankAccounts: Option[];
  // Só usado quando defaultCaseId está ausente (entrada pelo Financeiro, Fase 7) — vira as opções
  // do seletor de processo que aparece na seção Identificação. Entrando pelo Processo continua
  // sem seletor nenhum, exatamente como sempre foi.
  cases?: Option[];
  // Opcional a partir da Fase 7: presente = entrada pelo Processo (comportamento de sempre, sem
  // seletor de processo); ausente = entrada pelo Financeiro, com seletor de processo obrigatório
  // na seção Identificação (ver estado `caseId` abaixo).
  defaultCaseId?: string;
  defaultClientId?: string;
  defaultResponsibleId?: string;
  // Também fica opcional a partir da Fase 7: sem defaultCaseId, as bases do processo ainda não são
  // conhecidas no momento em que o modal é montado — só chegam depois que o usuário escolhe o
  // processo no seletor (ver getCaseBases, lib/actions/honorarioLancamento.ts).
  bases?: CaseValueBases;
  alreadyReceivedForCase?: number;
  // Honorário pretendido, vindo da conversão de um Atendimento (Fase 5 — ver
  // convertAttendanceToCase, lib/actions/attendance.ts, e app/(app)/processos/[id]/page.tsx, que
  // monta este objeto a partir da querystring do redirect). SÓ pré-preenche os campos — nunca cria
  // a cobrança sozinho, o advogado sempre confirma clicando em "Salvar lançamento".
  prefill?: { cobranca?: Cobranca; amount?: string; percentual?: string; percentualBase?: string };
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---- Identificação ----
  const [natureza, setNatureza] = useState<Natureza>("CONTRATUAL");
  const [payerType, setPayerType] = useState<PayerType>("CLIENTE");
  const [payerName, setPayerName] = useState("");

  // ---- Processo (Fase 7) ----
  // Com defaultCaseId (entrada pelo Processo) nunca muda depois do mount — é exatamente o
  // comportamento de sempre. Sem defaultCaseId (entrada pelo Financeiro), começa vazio e o
  // seletor de processo da seção Identificação, abaixo, é quem preenche.
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const hasCase = Boolean(caseId);
  const [caseBases, setCaseBases] = useState<CaseValueBases | null>(bases ?? null);
  const [caseClientId, setCaseClientId] = useState<string | undefined>(defaultClientId);
  const [caseAlreadyReceived, setCaseAlreadyReceived] = useState<number | undefined>(alreadyReceivedForCase);
  const [basesLoading, setBasesLoading] = useState(false);

  // Chamado pelo EntityPicker de processo (só existe quando !defaultCaseId) a cada troca de
  // seleção — carrega as quatro bases de cálculo do percentual e pré-seleciona o cliente do
  // processo (sem travar: handleCaseChange só ajusta o default, o usuário continua livre para
  // trocar o campo Cliente manualmente depois). Ver getCaseBases, lib/actions/honorarioLancamento.ts.
  async function handleCaseChange(id: string) {
    setCaseId(id);
    setCaseBases(null);
    setCaseClientId(undefined);
    setCaseAlreadyReceived(undefined);
    if (!id) return;
    setBasesLoading(true);
    const result = await getCaseBases(id);
    setBasesLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCaseBases(result.bases ?? null);
    setCaseClientId(result.clientId ?? undefined);
    setCaseAlreadyReceived(result.alreadyReceivedForCase);
  }

  // ---- Documento ----
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");

  // ---- Forma de cobrança ----
  const [cobranca, setCobranca] = useState<Cobranca>(prefill?.cobranca ?? "DINHEIRO");
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [discount, setDiscount] = useState("0");
  const [surcharge, setSurcharge] = useState("0");
  const [percentual, setPercentual] = useState(prefill?.percentual ?? "");
  const [percentualBase, setPercentualBase] = useState(prefill?.percentualBase ?? "VALOR_CAUSA");
  const [abaterEntrada, setAbaterEntrada] = useState(false);

  // ---- Vencimento ----
  const [dueDate, setDueDate] = useState("");
  const [semVencimento, setSemVencimento] = useState(false);

  // ---- Forma de lançamento (Único / Parcelado / Recorrente até o arquivamento) ----
  const [forma, setForma] = useState<FormaLancamento>("UNICO");
  const parcelado = forma === "PARCELADO";
  const recorrente = forma === "RECORRENTE";
  const [valorTotalIndicado, setValorTotalIndicado] = useState("");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [installmentIntervalDays, setInstallmentIntervalDays] = useState("30");
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([]);

  // ---- Recorrente até o arquivamento (só estes dois campos — ver createRecurringFee) ----
  const [amountMensal, setAmountMensal] = useState("");
  const [dueDay, setDueDay] = useState("10");

  // ---- Recebimento ----
  const [recebido, setRecebido] = useState(false);
  const [paidDate, setPaidDate] = useState(todayStr());
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  const cobrancaHasDinheiro = cobranca !== "PERCENTUAL";
  const cobrancaHasPercentual = cobranca !== "DINHEIRO";

  function handleNaturezaChange(v: Natureza) {
    setNatureza(v);
    // Regra do enunciado: ao escolher Sucumbencial o pagador default vira Parte adversa (o
    // devedor da verba sucumbencial normalmente é a parte contrária, não o cliente).
    setPayerType(v === "SUCUMBENCIAL" ? "ADVERSA" : "CLIENTE");
  }

  function regenerate(count: string, interval: string, total: string) {
    setParcelas((prev) => regenerateParcelas(prev, parseInt(count || "1") || 1, parseInt(interval || "1") || 1, dueDate || todayStr(), total));
  }

  function handleFormaChange(v: FormaLancamento) {
    // Defesa extra: o botão "Recorrente" já nasce desabilitado (disabled do Segmented) sem
    // processo escolhido, mas nunca custa checar de novo aqui antes de trocar o estado.
    if (v === "RECORRENTE" && !hasCase) return;
    setForma(v);
    // "Já foi recebido" só faz sentido em ÚNICO — trocar para Parcelado/Recorrente zera a escolha
    // (a seção nem aparece nesses dois modos, ver JSX abaixo).
    if (v !== "UNICO") setRecebido(false);
    if (v === "PARCELADO" && parcelas.length === 0) regenerate(installmentCount, installmentIntervalDays, valorTotalIndicado);
  }

  function handleRecebidoToggle(checked: boolean) {
    setRecebido(checked);
  }

  function updateParcela(key: string, patch: Partial<ParcelaRow>) {
    setParcelas((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  // ---- Prévia ao vivo (mesma conta que o Server Action faz, ver lib/financeCalc.ts) ----
  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const percentualNum = parseFloat(percentual || "0") || 0;
  const effectiveBases = caseBases ?? EMPTY_BASES;
  const baseValue = baseValueFor(percentualBase, effectiveBases);
  const jaPagoEmDinheiro = parcelado ? parcelas.filter((p) => p.pago).reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0) : amountNum;
  const percentualApurado = cobrancaHasPercentual
    ? estimatePercentualLiquido({ percentual: percentualNum, base: percentualBase, values: effectiveBases, abaterEntrada, jaPagoEmDinheiro })
    : 0;
  const parcelasSoma = parcelas.reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0);
  const bruto = parcelado
    ? parcelasSoma + (cobrancaHasPercentual ? percentualApurado : 0)
    : (cobrancaHasDinheiro ? amountNum : 0) + (cobrancaHasPercentual ? percentualApurado : 0);
  const liquido = valorLiquido(bruto, parcelado ? 0 : discountNum, parcelado ? 0 : surchargeNum);
  const totalIndicadoNum = parseFloat(valorTotalIndicado || "0") || 0;
  const divergencia = parcelado && totalIndicadoNum > 0 ? parcelasSoma - totalIndicadoNum : 0;

  function resetAndClose() {
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> Lançar Honorários
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Lançar Honorários</h3>
              <button onClick={resetAndClose} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                const description = String(formData.get("description") || "");
                const clientId = String(formData.get("clientId") || "");
                const costCenterId = String(formData.get("costCenterId") || "");
                const categoryId = String(formData.get("categoryId") || "");
                const responsibleId = String(formData.get("responsibleId") || "");
                const bankAccountId = String(formData.get("bankAccountId") || "");
                const paymentDocumentNumber = String(formData.get("paymentDocumentNumber") || "");
                // Vem da prop fixa (entrada pelo Processo) ou do seletor da seção Identificação
                // (entrada pelo Financeiro, Fase 7) — de onde quer que venha, createHonorarioLancamento
                // continua exigindo caseId obrigatório, então validamos aqui antes de chamá-lo (a
                // trava de verdade é sempre o Server Action, isto é só para não deixar a tela mandar
                // uma requisição que o próprio usuário já vê que vai falhar).
                const effectiveCaseId = defaultCaseId || String(formData.get("caseId") || "");
                if (!effectiveCaseId) {
                  setLoading(false);
                  setError("Selecione um processo — honorário sem processo não faz sentido.");
                  return;
                }

                // Recorrente até o arquivamento cai fora do fluxo de createHonorarioLancamento —
                // vira um RecurringFee (mesma Server Action de sempre, só sem chamador desde a
                // Fase 2/3), que o cron mantém gerando mês a mês até o processo ser arquivado.
                if (recorrente) {
                  const kind = natureza === "SUCUMBENCIAL" ? "HONORARIOS_SUCUMBENCIAIS" : "HONORARIOS_CONTRATUAIS";
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
                  setOpen(false);
                  router.refresh();
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
                setOpen(false);
                router.refresh();
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {caseAlreadyReceived !== undefined && (
                  <p className="text-xs text-navy-800/50 dark:text-cream-50/50 bg-cream-50 dark:bg-navy-800 rounded-lg px-3 py-2">
                    Já recebido neste processo:{" "}
                    <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(caseAlreadyReceived)}</span>
                  </p>
                )}
                {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

                {prefill && (
                  <p className="text-xs text-gold-800 dark:text-gold-400 bg-gold-500/10 rounded-lg px-3 py-2">
                    Honorário pretendido registrado na triagem deste atendimento — confira os valores abaixo e confirme antes de salvar.
                  </p>
                )}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input
                    name="description"
                    required
                    defaultValue={prefill ? "Honorários contratuais" : undefined}
                    className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                    placeholder="Ex: Honorários contratuais"
                  />
                </div>

                <SecaoLancamento title="Identificação" tone="palha">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {!defaultCaseId && (
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Processo</label>
                        <EntityPicker
                          name="caseId"
                          options={cases ?? []}
                          placeholder="Buscar processo..."
                          emptyLabel="Nenhum"
                          addLabel="Cadastrar novo processo"
                          onQuickAdd={(name) => createCaseQuick(name)}
                          onChange={handleCaseChange}
                        />
                        {!hasCase ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                            Obrigatório — honorário sem processo não faz sentido.
                          </p>
                        ) : basesLoading ? (
                          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Carregando dados do processo...</p>
                        ) : null}
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Natureza</label>
                      <div className="mt-1">
                        <Segmented<Natureza>
                          value={natureza}
                          onChange={handleNaturezaChange}
                          options={[
                            { value: "CONTRATUAL", label: "Contratual" },
                            { value: "SUCUMBENCIAL", label: "Sucumbencial" },
                          ]}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Pagador</label>
                      <select
                        value={payerType}
                        onChange={(e) => setPayerType(e.target.value as PayerType)}
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      >
                        <option value="CLIENTE">Cliente do processo</option>
                        <option value="ADVERSA">Parte adversa</option>
                        <option value="OUTRO">Outro</option>
                      </select>
                    </div>
                    {payerType === "OUTRO" && (
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Nome do pagador</label>
                        <input
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          required
                          className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                        />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Cliente</label>
                      <EntityPicker
                        // key força remount quando o processo muda (entrada pelo Financeiro) —
                        // é assim que o EntityPicker (componente sem estado controlado) adota o
                        // novo cliente-padrão do processo escolhido sem perder a liberdade do
                        // usuário de trocar o campo manualmente entre uma troca de processo e outra.
                        key={defaultCaseId ? "fixed" : caseId || "no-case"}
                        name="clientId"
                        options={clients}
                        defaultValue={defaultCaseId ? defaultClientId : caseClientId}
                        placeholder="Buscar cliente..."
                        emptyLabel="Nenhum"
                        addLabel="Cadastrar novo cliente"
                        onQuickAdd={createClientQuick}
                      />
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
                    <div>
                      <label className={labelCls}>Responsável pelo lançamento</label>
                      <select
                        name="responsibleId"
                        defaultValue={defaultResponsibleId}
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      >
                        {responsibles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Documento" tone="azul">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Tipo de documento</label>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                        className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                      >
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

                <SecaoLancamento title="Forma de lançamento" tone="rosa">
                  <Segmented<FormaLancamento>
                    value={forma}
                    onChange={handleFormaChange}
                    options={[
                      { value: "UNICO", label: "Único" },
                      { value: "PARCELADO", label: "Parcelado" },
                      { value: "RECORRENTE", label: "Recorrente até o arquivamento", disabled: !hasCase },
                    ]}
                  />
                  {!hasCase && (
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                      &quot;Recorrente até o arquivamento&quot; exige um processo — escolha um na seção Identificação, acima, para habilitar.
                    </p>
                  )}

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

                  {recorrente && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Valor mensal (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={amountMensal}
                            onChange={(e) => setAmountMensal(e.target.value)}
                            required={recorrente}
                            className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Dia do mês de vencimento</label>
                          <input
                            type="number"
                            min={1}
                            max={28}
                            value={dueDay}
                            onChange={(e) => setDueDay(e.target.value)}
                            required={recorrente}
                            className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 bg-white/60 dark:bg-white/5 rounded-lg px-3 py-1.5">
                        Gera uma conta a receber por mês, sempre no dia escolhido, e para sozinha quando o processo é arquivado — sem precisar
                        definir quantas parcelas.
                      </p>
                    </div>
                  )}
                </SecaoLancamento>

                {!recorrente && (
                  <>
                    <SecaoLancamento title="Forma de cobrança" tone="ouro">
                      <Segmented<Cobranca>
                        value={cobranca}
                        onChange={setCobranca}
                        options={[
                          { value: "DINHEIRO", label: "Dinheiro" },
                          { value: "PERCENTUAL", label: "Percentual" },
                          { value: "AMBOS", label: "Dinheiro + Percentual" },
                        ]}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {cobrancaHasDinheiro && (
                          <div>
                            <label className={labelCls}>Valor em dinheiro (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              disabled={parcelado}
                              className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 disabled:opacity-50"
                            />
                            {parcelado && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Substituído pela tabela de parcelas, abaixo.</p>}
                          </div>
                        )}
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

                      {cobrancaHasPercentual && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Percentual (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={percentual}
                              onChange={(e) => setPercentual(e.target.value)}
                              className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Base</label>
                            <select
                              value={percentualBase}
                              onChange={(e) => setPercentualBase(e.target.value)}
                              className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50"
                            >
                              {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls}>Valor da base hoje no processo</label>
                            <input
                              readOnly
                              value={
                                !hasCase
                                  ? "Escolha um processo, na seção Identificação, para saber esta base"
                                  : baseValue
                                  ? formatCurrency(baseValue)
                                  : "Ainda não informado no processo"
                              }
                              className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50/70 cursor-not-allowed"
                            />
                          </div>
                        </div>
                      )}

                      {cobranca === "AMBOS" && (
                        <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                          <input type="checkbox" checked={abaterEntrada} onChange={(e) => setAbaterEntrada(e.target.checked)} />
                          Abater do percentual o que já foi pago em dinheiro
                        </label>
                      )}

                      {cobrancaHasPercentual &&
                        (!hasCase ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
                            A base do percentual será conhecida depois de escolher o processo, na seção Identificação, acima.
                          </p>
                        ) : baseValue ? (
                          <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 bg-white/60 dark:bg-white/5 rounded-lg px-3 py-1.5">
                            {percentualNum || 0}% de {formatCurrency(baseValue)} = {formatCurrency((baseValue * (percentualNum || 0)) / 100)}
                            {abaterEntrada && cobranca === "AMBOS" && <> — abatendo {formatCurrency(jaPagoEmDinheiro)} já pago em dinheiro</>}
                            {" "}= <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(percentualApurado)}</span> líquido de honorário
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
                            A base escolhida ainda não tem valor cadastrado neste processo — esta parcela nasce como provisão a apurar (status
                            &quot;A apurar&quot;), fora do fluxo de caixa e do DRE, até alguém registrar o desfecho do processo.
                          </p>
                        ))}
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
                            required={!semVencimento}
                            className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50"
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                          Fica fora da projeção do Fluxo de Caixa e aparece na Central de Alertas até ganhar uma data.
                        </p>
                      )}
                    </SecaoLancamento>
                  </>
                )}

                {/* Não faz sentido nem em Parcelado (quita parcela retroativa direto na tabela)
                    nem em Recorrente (nunca "já recebido" — é gerado mês a mês pelo cron). */}
                {forma === "UNICO" && (
                  <SecaoLancamento title="Recebimento" tone="verde">
                    <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                      <input type="checkbox" checked={recebido} onChange={(e) => handleRecebidoToggle(e.target.checked)} />
                      Já foi recebido
                    </label>

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
                )}
              </div>

              <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-cream-50/60 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  {recorrente ? (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Valor mensal</span>
                      <span className="font-serif text-lg font-bold tabular-nums text-gold-700 dark:text-gold-400">
                        {formatCurrency(parseFloat(amountMensal || "0") || 0)}
                      </span>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="text-sm font-medium px-4 py-2 rounded-lg text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !hasCase}
                    title={!hasCase ? "Selecione um processo, na seção Identificação" : undefined}
                    className="bg-gold-600 hover:bg-gold-700 text-white font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50"
                  >
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
