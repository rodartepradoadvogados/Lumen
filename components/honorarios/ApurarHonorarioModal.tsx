"use client";

// Janela de apuração do êxito (Fase 4) — transforma uma parcela percentual "A apurar" em receita
// real (ou a encerra sem receita, se o desfecho for sem êxito). Casca padrão de 80% das telas de
// lançamento (LancarHonorariosModal), backdrop sem onClick de fechar (não fecha ao clicar fora).
// Abre pelas três portas: botão "Registrar desfecho" na aba Financeiro do Processo (aqui), o
// alerta automático de publicação com termos de decisão (lib/alerts.ts) e o aviso ao arquivar o
// processo (CaseStatusSelect.tsx) — todos levam para a mesma aba, que é onde este componente vive.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apurarHonorario } from "@/lib/actions/apuracao";
import { addDiasUteis } from "@/lib/prazos";
import { valorPercentualApurado } from "@/lib/financeCalc";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import { formatCurrency, formatCalendarDate } from "@/components/ui";
import { Gavel, X } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

export type PendenteApurar = {
  id: string;
  description: string;
  percentual: number;
  percentualBase: string;
  abaterEntrada: boolean;
  jaPagoEmDinheiro: number;
};

type Desfecho = "SENTENCA_PROCEDENTE" | "ACORDAO" | "ACORDO" | "IMPROCEDENTE";

const DESFECHO_OPTIONS: { value: Desfecho; label: string }[] = [
  { value: "SENTENCA_PROCEDENTE", label: "Sentença procedente" },
  { value: "ACORDAO", label: "Acórdão" },
  { value: "ACORDO", label: "Acordo" },
  { value: "IMPROCEDENTE", label: "Improcedente (sem êxito)" },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// "YYYY-MM-DD" -> Date em UTC-meia-noite — mesma convenção de lib/prazos.ts (nunca `new
// Date(str)` puro: em fusos negativos ele lê a meia-noite UTC como o dia anterior).
function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

const inputCls = "fin-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50";
const labelCls = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

export default function ApurarHonorarioModal({
  caseId,
  caseTitle,
  pendentes,
  holidays,
}: {
  caseId: string;
  caseTitle: string;
  pendentes: PendenteApurar[];
  holidays: { date: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bases = useMemo(() => Array.from(new Set(pendentes.map((p) => p.percentualBase))), [pendentes]);
  const [base, setBase] = useState(bases[0] ?? "CONDENACAO");
  const itensDaBase = pendentes.filter((p) => p.percentualBase === base);

  const [desfecho, setDesfecho] = useState<Desfecho>("SENTENCA_PROCEDENTE");
  const [valorApurado, setValorApurado] = useState("");
  const [decisionDate, setDecisionDate] = useState(todayStr());
  const [usarPresuncao, setUsarPresuncao] = useState(true);
  const [transitoManual, setTransitoManual] = useState(todayStr());

  const semExito = desfecho === "IMPROCEDENTE";

  // Prévia ao vivo da data de trânsito presumida: 15 dias úteis após a decisão, pulando fim de
  // semana, feriado nacional, feriado cadastrado pelo escritório (Holiday) e a suspensão forense
  // (20/12-20/01) — mesma função usada em prazos de verdade (lib/prazos.ts:addDiasUteis).
  const decisionDateObj = decisionDate ? toUtcDate(decisionDate) : null;
  const transitoPresumidoStr = decisionDateObj ? addDiasUteis(decisionDateObj, 15, holidays).toISOString().slice(0, 10) : "";
  const transitoDateStr = usarPresuncao ? transitoPresumidoStr : transitoManual;

  const valorApuradoNum = parseFloat(valorApurado || "0") || 0;
  const totalApurado = itensDaBase.reduce(
    (s, p) => s + valorPercentualApurado({ percentual: p.percentual, base: valorApuradoNum, abaterEntrada: p.abaterEntrada, jaPagoEmDinheiro: p.jaPagoEmDinheiro }),
    0
  );

  function resetAndClose() {
    setOpen(false);
    setError("");
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const result = await apurarHonorario({
        caseId,
        percentualBase: base,
        desfecho,
        valorApurado: semExito ? undefined : valorApurado,
        decisionDate,
        transitoDate: semExito ? decisionDate : transitoDateStr,
        transitoPresumido: usarPresuncao,
      });
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Não foi possível registrar a apuração. Tente novamente.");
    }
  }

  useEscapeToClose(open, resetAndClose);

  if (pendentes.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-bordo-700 hover:bg-bordo-800 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Gavel size={16} /> Registrar desfecho
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-[80vw] max-w-[900px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <div>
                <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Registrar desfecho</h3>
                <p className="text-xs text-navy-800/50 dark:text-cream-50/50">{caseTitle}</p>
              </div>
              <button onClick={resetAndClose} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
              {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

              {bases.length > 1 && (
                <div>
                  <label className={labelCls}>Base a apurar</label>
                  <select value={base} onChange={(e) => setBase(e.target.value)} className={inputCls}>
                    {bases.map((b) => (
                      <option key={b} value={b}>
                        {PERCENTUAL_BASE_LABELS[b] ?? b} ({pendentes.filter((p) => p.percentualBase === b).length} parcela(s))
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Desfecho</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DESFECHO_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setDesfecho(o.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        desfecho === o.value
                          ? o.value === "IMPROCEDENTE"
                            ? "bg-bordo-700 text-white border-bordo-700"
                            : "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                          : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Data da decisão</label>
                <input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} className={inputCls} />
              </div>

              {!semExito && (
                <>
                  <div>
                    <label className={labelCls}>{PERCENTUAL_BASE_LABELS[base] ?? "Valor apurado"} (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={valorApurado}
                      onChange={(e) => setValorApurado(e.target.value)}
                      className={inputCls}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-navy-800/70 dark:text-cream-50/70">
                    <input type="checkbox" checked={usarPresuncao} onChange={(e) => setUsarPresuncao(e.target.checked)} />
                    Considerar 15 dias úteis para o trânsito em julgado
                  </label>

                  {usarPresuncao ? (
                    <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 bg-cream-50 dark:bg-navy-800 rounded-lg px-3 py-2">
                      Trânsito em julgado presumido:{" "}
                      <span className="font-semibold text-navy-900 dark:text-cream-50">
                        {transitoPresumidoStr ? formatCalendarDate(transitoPresumidoStr) : "—"}
                      </span>{" "}
                      (15 dias úteis após a decisão, pulando fim de semana, feriados e o recesso forense) — data presumida, não confirmada.
                    </p>
                  ) : (
                    <div>
                      <label className={labelCls}>Data do trânsito em julgado</label>
                      <input type="date" value={transitoManual} onChange={(e) => setTransitoManual(e.target.value)} className={inputCls} />
                    </div>
                  )}

                  <div className="rounded-lg border border-navy-800/10 dark:border-white/10 divide-y divide-navy-800/5 dark:divide-white/10">
                    {itensDaBase.map((p) => {
                      const apurado = valorPercentualApurado({
                        percentual: p.percentual,
                        base: valorApuradoNum,
                        abaterEntrada: p.abaterEntrada,
                        jaPagoEmDinheiro: p.jaPagoEmDinheiro,
                      });
                      return (
                        <div key={p.id} className="px-3 py-2 flex justify-between items-center gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="text-navy-900 dark:text-cream-50 truncate">{p.description}</p>
                            <p className="text-navy-800/45 dark:text-cream-50/45">
                              {p.percentual}% de {formatCurrency(valorApuradoNum)}
                              {p.abaterEntrada && <> — abatendo {formatCurrency(p.jaPagoEmDinheiro)} já pago em dinheiro</>}
                            </p>
                          </div>
                          <p className="font-semibold text-navy-900 dark:text-cream-50 shrink-0">{formatCurrency(apurado)}</p>
                        </div>
                      );
                    })}
                    <div className="px-3 py-2 flex justify-between items-center gap-3 text-xs bg-cream-50 dark:bg-white/5">
                      <span className="font-semibold text-navy-800/60 dark:text-cream-50/60">
                        Vencimento: {transitoDateStr ? formatCalendarDate(transitoDateStr) : "—"}
                      </span>
                      <span className="font-serif text-sm font-bold text-gold-700 dark:text-gold-400">Total {formatCurrency(totalApurado)}</span>
                    </div>
                  </div>
                </>
              )}

              {semExito && (
                <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">
                  Não gera receita. {itensDaBase.length} parcela(s) desta base serão encerradas (status Cancelado) — o registro não é
                  apagado, continua consultável no histórico financeiro do processo.
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex items-center justify-end gap-2 bg-cream-50/60 dark:bg-white/5">
              <button
                type="button"
                onClick={resetAndClose}
                className="text-sm font-medium px-4 py-2 rounded-lg text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || (!semExito && valorApuradoNum <= 0)}
                className={`font-semibold text-sm px-5 py-2 rounded-lg disabled:opacity-50 text-white ${
                  semExito ? "bg-bordo-700 hover:bg-bordo-800" : "bg-bordo-700 hover:bg-bordo-600"
                }`}
              >
                {loading ? "Salvando..." : semExito ? "Confirmar sem êxito" : "Confirmar apuração"}
              </button>
            </div>
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
