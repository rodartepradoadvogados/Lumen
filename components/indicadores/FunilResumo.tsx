import Link from "next/link";
import { Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { contar } from "@/lib/plural";
import { stageLabels } from "@/lib/funil";

// Funil comercial na Visão geral: posição atual por estágio, conversão só dos decididos (com o n
// à vista) e propostas paradas. Só aparece para quem vê o Atendimento do escritório inteiro.
// Sem valor em reais: a soma estimada passa pela régua de administrador em lib/valorEstimado.ts e
// vive em Indicadores > Funil comercial.
export default function FunilResumo({
  total,
  porEstagio,
  conversao,
  propostasParadas,
}: {
  total: number;
  porEstagio: { estagio: string; quantidade: number }[];
  conversao: { percentual: number | null; decididos: number };
  propostasParadas: number;
}) {
  const max = Math.max(1, ...porEstagio.map((e) => e.quantidade));
  return (
    <Card>
      <CardHeader title="Funil comercial" subtitle={`${contar(total, "lead")} · posição atual`} />
      <div className="p-5">
        {total === 0 ? (
          <p className="text-sm text-tx-2">Nenhum lead no funil.</p>
        ) : (
          <ul className="space-y-2.5">
            {porEstagio.map((e) => (
              <li key={e.estagio} className="grid grid-cols-[minmax(0,7rem)_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate text-tx-2">{stageLabels[e.estagio] ?? e.estagio}</span>
                <span className="h-2.5 bg-sf-apoio rounded-sm overflow-hidden" aria-hidden="true">
                  <span className={`block h-full rounded-sm ${e.estagio === "PERDIDO" ? "bg-tx-3" : "bg-faixa-ardosia"}`} style={{ width: `${(e.quantidade / max) * 100}%`, minWidth: e.quantidade > 0 ? 3 : 0 }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-tx">{e.quantidade}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-tx-2">
          Conversão dos decididos:{" "}
          {conversao.percentual === null ? (
            <span className="text-tx-3">ainda não há lead fechado nem perdido</span>
          ) : (
            <>
              <b className="text-tx">{conversao.percentual}%</b> <span className="text-tx-3">({conversao.decididos} decididos)</span>
            </>
          )}
        </p>
        {propostasParadas > 0 && (
          <p className="mt-2 flex items-start gap-2 text-sm text-aviso">
            <Clock size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
            <b>{contar(propostasParadas, "proposta parada", "propostas paradas")} há mais de 7 dias.</b>
          </p>
        )}
        <p className="mt-3">
          <Link href="/indicadores/funil" className="text-sm font-semibold text-marca-tx hover:underline">
            Ver o funil comercial
          </Link>
        </p>
      </div>
    </Card>
  );
}
