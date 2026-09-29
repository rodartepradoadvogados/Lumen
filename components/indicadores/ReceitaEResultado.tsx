import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { Card, CardHeader, formatCurrency } from "@/components/ui";
import type { ResumoDeCaixa } from "@/lib/gestao/receitaEResultado";

// Receita e resultado — regime de caixa, com barras em tinta neutra e ardósia (bordô é ação e
// risco, não gráfico). "Pago" também se distingue por padrão hachurado, não só por cor. O aviso de
// pico existe porque um mês de R$ 245 mil faz o mês seguinte parecer queda quando é só normal.
export default function ReceitaEResultado({ resumo, rotuloDoPeriodo }: { resumo: ResumoDeCaixa; rotuloDoPeriodo: string }) {
  const max = Math.max(1, ...resumo.serie.flatMap((m) => [m.recebido, m.pago]));
  const v = resumo.variacaoDoRecebido;
  return (
    <Card>
      <CardHeader title="Receita e resultado" subtitle={`${rotuloDoPeriodo} · o que entrou e saiu de verdade, por data de baixa`} />
      <div className="p-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-guia font-bold tabular-nums text-tx">{formatCurrency(resumo.periodo.recebido)}</span>
          <span className="text-sm text-tx-2">recebidos</span>
          {v !== null ? (
            <span className={`inline-flex items-center gap-1 text-sm font-semibold ${v < 0 ? "text-urgente" : "text-concluido"}`}>
              {v < 0 ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUp size={14} aria-hidden="true" />}
              {Math.abs(v).toFixed(0)}% {resumo.periodo.meses === 1 ? "sobre o mês anterior" : "sobre o período anterior"}
            </span>
          ) : (
            <span className="text-sm text-tx-3">{resumo.periodo.meses === 12 ? "sem período anterior na base" : "sem base de comparação"}</span>
          )}
        </div>
        <p className="text-sm text-tx-2 mt-1 tabular-nums">
          Pagos {formatCurrency(resumo.periodo.pago)} · resultado{" "}
          <b className={resumo.periodo.resultado < 0 ? "text-urgente" : "text-tx"}>{formatCurrency(resumo.periodo.resultado)}</b>
        </p>

        <div
          role="img"
          aria-label={`Recebido e pago por mês, de ${resumo.serie[0]?.rotulo} a ${resumo.serie[resumo.serie.length - 1]?.rotulo}. ${resumo.serie.map((m) => `${m.rotulo}: recebido ${formatCurrency(m.recebido)}, pago ${formatCurrency(m.pago)}`).join("; ")}.`}
          className="mt-5 flex items-end gap-2 h-36"
        >
          {resumo.serie.map((m) => (
            <div key={m.chave} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center">
              <div className="w-full flex-1 flex items-end justify-center gap-0.5">
                <span className="w-1/2 max-w-3 bg-faixa-ardosia" style={{ height: `${(m.recebido / max) * 100}%`, minHeight: m.recebido > 0 ? 2 : 0 }} />
                <span
                  className="w-1/2 max-w-3 border border-tx-3"
                  style={{
                    height: `${(m.pago / max) * 100}%`,
                    minHeight: m.pago > 0 ? 2 : 0,
                    backgroundImage: "repeating-linear-gradient(135deg, var(--tx-3) 0 2px, transparent 2px 5px)",
                  }}
                />
              </div>
              <small className="text-etiqueta text-tx-2 mt-1 whitespace-nowrap">{resumo.serie.length > 8 ? m.rotulo.slice(0, 3) : m.rotulo}</small>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-etiqueta text-tx-2">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 bg-faixa-ardosia" /> Recebido
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 border border-tx-3" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--tx-3) 0 2px, transparent 2px 4px)" }} /> Pago
          </span>
        </div>
        {resumo.pico && (
          <p className="mt-3 flex items-start gap-2 text-sm text-tx-2">
            <Info size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
            <span>
              {resumo.pico.rotulo} foi um pico ({formatCurrency(resumo.pico.valor)}), por isso o período parece menor. Mediana de 12 meses: {formatCurrency(resumo.medianaDoRecebido12m)}.
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}
