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
import MoneyInput from "@/components/MoneyInput";

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

const inputCls = "fin-input";
const labelCls = "text-xs font-medium text-tx-2";

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
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-medium px-3.5 py-2 transition-colors"
      >
        <Gavel size={16} /> Registrar desfecho
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-[80vw] max-w-[900px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <div>
                <h3 className="font-bold text-tx">Registrar desfecho</h3>
                <p className="text-xs text-tx-2">{caseTitle}</p>
              </div>
              <button onClick={resetAndClose} className="text-tx-3 hover:text-tx dark:hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
              {error && <p className="text-xs text-urgente bg-urgente-bg px-3 py-2">{error}</p>}

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
                      className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${
                        desfecho === o.value
                          ? o.value === "IMPROCEDENTE"
                            ? "bg-urgente-bg text-urgente border-regua-forte"
                            : "bg-acao text-acao-tx border-acao"
                          : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
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
                    <MoneyInput value={valorApurado} onChange={setValorApurado} className={inputCls} />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-tx-2">
                    <input type="checkbox" checked={usarPresuncao} onChange={(e) => setUsarPresuncao(e.target.checked)} />
                    Considerar 15 dias úteis para o trânsito em julgado
                  </label>

                  {usarPresuncao ? (
                    <p className="text-[11px] text-tx-2 bg-sf-apoio px-3 py-2">
                      Trânsito em julgado presumido:{" "}
                      <span className="font-semibold text-tx">
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

                  <div className=" border border-regua divide-y divide-regua">
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
                            <p className="text-tx truncate">{p.description}</p>
                            <p className="text-tx-2">
                              {p.percentual}% de {formatCurrency(valorApuradoNum)}
                              {p.abaterEntrada && <> — abatendo {formatCurrency(p.jaPagoEmDinheiro)} já pago em dinheiro</>}
                            </p>
                          </div>
                          <p className="font-semibold text-tx shrink-0">{formatCurrency(apurado)}</p>
                        </div>
                      );
                    })}
                    <div className="px-3 py-2 flex justify-between items-center gap-3 text-xs bg-sf-apoio">
                      <span className="font-semibold text-tx-2">
                        Vencimento: {transitoDateStr ? formatCalendarDate(transitoDateStr) : "—"}
                      </span>
                      <span className="text-sm font-bold text-marca-tx">Total {formatCurrency(totalApurado)}</span>
                    </div>
                  </div>
                </>
              )}

              {semExito && (
                <p className="text-[11px] text-urgente bg-urgente-bg px-3 py-2">
                  Não gera receita. {itensDaBase.length} parcela(s) desta base serão encerradas (status Cancelado) — o registro não é
                  apagado, continua consultável no histórico financeiro do processo.
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-regua px-5 py-3 flex items-center justify-end gap-2 bg-sf-apoio">
              <button
                type="button"
                onClick={resetAndClose}
                className="text-sm font-medium px-4 py-2 text-tx-2 hover:bg-sf"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || (!semExito && valorApuradoNum <= 0)}
                className="font-semibold text-sm px-5 py-2 disabled:opacity-50 bg-acao hover:bg-acao-hover text-acao-tx transition-colors"
              >
                {loading ? "Salvando..." : semExito ? "Confirmar sem êxito" : "Confirmar apuração"}
              </button>
            </div>
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
