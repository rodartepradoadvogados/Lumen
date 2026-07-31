"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateReceivable } from "@/lib/actions/financeiro";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { createCostCenterQuick } from "@/lib/actions/settings";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/honorarioLancamento";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido } from "@/lib/financeCalc";
import { formatCurrency, formatDate } from "@/components/ui";
import { Pencil, X } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";

type Option = { id: string; name: string };

const labelCls = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

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

  const amountNum = parseFloat(amount || "0") || 0;
  const discountNum = parseFloat(discount || "0") || 0;
  const surchargeNum = parseFloat(surcharge || "0") || 0;
  const liquido = valorLiquido(amountNum, discountNum, surchargeNum);
  const isApurar = receivable.status === "A_APURAR";

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Editar Conta a Receber</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
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
                setOpen(false);
                router.refresh();
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}
                {isApurar && (
                  <p className="text-xs text-navy-800/50 dark:text-cream-50/50 bg-cream-50 dark:bg-navy-800 rounded-lg px-3 py-2">
                    Esta parcela é uma provisão &quot;A apurar&quot; (percentual sobre o desfecho do processo) — os campos de valor abaixo não
                    representam dinheiro real ainda; a apuração do êxito é feita na aba Financeiro do processo.
                  </p>
                )}

                <div>
                  <label className={labelCls}>Descrição</label>
                  <input name="description" defaultValue={receivable.description} required className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
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
                      <select name="kind" defaultValue={receivable.kind} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
                        <option value="HONORARIOS_CONTRATUAIS">Honorários Contratuais</option>
                        <option value="HONORARIOS_SUCUMBENCIAIS">Honorários Sucumbenciais</option>
                        <option value="OUTROS">Outros</option>
                        <option value="REEMBOLSO">Reembolso</option>
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
                      <select name="responsibleId" defaultValue={receivable.responsibleId ?? ""} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
                        <option value="">Não informado</option>
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
                      <select name="documentType" defaultValue={receivable.documentType ?? ""} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
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
                      <input name="documentNumber" defaultValue={receivable.documentNumber ?? ""} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                    </div>
                    <div>
                      <label className={labelCls}>Data de emissão</label>
                      <input name="issueDate" type="date" defaultValue={receivable.issueDate?.slice(0, 10) ?? ""} className="fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
                    </div>
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Valores" tone="ouro">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                    </div>
                    <div>
                      <label className={labelCls}>Desconto (R$)</label>
                      <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                    </div>
                    <div>
                      <label className={labelCls}>Acréscimo (R$)</label>
                      <input type="number" step="0.01" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
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
                        name="dueDate"
                        type="date"
                        defaultValue={receivable.dueDate.slice(0, 10)}
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

                <SecaoLancamento title="Parcelamento" tone="rosa">
                  {receivable.installmentTotal ? (
                    <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 bg-white/60 dark:bg-white/5 rounded-lg px-3 py-1.5">
                      Parcela {receivable.installmentNumber}/{receivable.installmentTotal} de um lançamento parcelado — para mudar quantidade/intervalo,
                      lance um novo parcelamento.
                    </p>
                  ) : (
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Lançamento único, não parcelado.</p>
                  )}
                  <div>
                    <label className={labelCls}>Nº do boleto desta parcela</label>
                    <input name="installmentBoleto" defaultValue={receivable.installmentBoleto ?? ""} className="fin-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Recebimento" tone="verde">
                  {receivable.status === "PAGO" || receivable.status === "PARCIAL" ? (
                    <p className="text-xs text-navy-800/70 dark:text-cream-50/70">
                      {receivable.status === "PARCIAL" ? "Parcialmente recebido" : "Recebido"}: {formatCurrency(receivable.paidAmount ?? 0)}
                      {receivable.paidDate && <> em {formatDate(receivable.paidDate)}</>}
                      {receivable.paymentMethod && <> · {paymentMethodLabels[receivable.paymentMethod] ?? receivable.paymentMethod}</>}
                      {receivable.paymentReceiptNumber && <> · comprovante {receivable.paymentReceiptNumber}</>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Ainda não há nenhuma baixa lançada nesta conta.</p>
                  )}
                  <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40">
                    Para dar baixa (parcial ou integral) ou reabrir, use os botões na listagem — esta tela edita só o cadastro.
                  </p>
                </SecaoLancamento>
              </div>

              <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-cream-50/60 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Bruto</span>
                    <span className="text-sm font-semibold tabular-nums text-navy-900 dark:text-cream-50">{formatCurrency(amountNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Desconto</span>
                    <span className="text-sm font-semibold tabular-nums text-bordo-600 dark:text-bordo-400">-{formatCurrency(discountNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Acréscimo</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{formatCurrency(surchargeNum)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Líquido</span>
                    <span className="font-serif text-lg font-bold tabular-nums text-gold-700 dark:text-gold-400">{formatCurrency(liquido)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium px-4 py-2 rounded-lg text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-gold-600 hover:bg-gold-700 text-white font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50">
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
