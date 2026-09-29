import Link from "next/link";
import clsx from "clsx";

export type PeriodoDaVisaoGeral = "mes" | "3" | "6" | "12";

export const PERIODOS: { valor: PeriodoDaVisaoGeral; rotulo: string; meses: 1 | 3 | 6 | 12 }[] = [
  { valor: "mes", rotulo: "Este mês", meses: 1 },
  { valor: "3", rotulo: "3 meses", meses: 3 },
  { valor: "6", rotulo: "6 meses", meses: 6 },
  { valor: "12", rotulo: "12 meses", meses: 12 },
];

export function lerPeriodo(v: string | undefined): (typeof PERIODOS)[number] {
  return PERIODOS.find((p) => p.valor === v) ?? PERIODOS[0];
}

// O período é UM controle comum (antes: 3/6/12 no cabeçalho de Relatórios e datas soltas no
// Personalizado). Links e não estado: o período vai na URL, então dá para compartilhar e voltar.
export default function PeriodoSeg({ atual, base }: { atual: PeriodoDaVisaoGeral; base: string }) {
  return (
    <div role="group" aria-label="Período" className="flex items-center gap-1 bg-sf border border-regua p-1">
      {PERIODOS.map((p) => (
        <Link
          key={p.valor}
          href={`${base}?periodo=${p.valor}`}
          aria-current={p.valor === atual ? "true" : undefined}
          className={clsx("text-xs font-semibold px-3 py-1.5 transition-colors", p.valor === atual ? "bg-acao text-acao-tx" : "text-tx-2 hover:bg-sf-apoio")}
        >
          {p.rotulo}
        </Link>
      ))}
    </div>
  );
}
