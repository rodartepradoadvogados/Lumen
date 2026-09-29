import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { contar } from "@/lib/plural";

// A PRIMEIRA COISA que a Visão geral diz: o que exige ação hoje. Faixa ASSIMÉTRICA (um número de
// 40px e dois de 22px), e não quatro cartões iguais — a tarja de risco é uma por tela (DESIGN.md
// §1 recusa a grade de KPIs iguais). O risco leva ícone E palavra: nunca só cor.
// Sem `divide-y` de propósito: a regra mobile global `.divide-y > div > a` (app/globals.css) empilha e
// recua qualquer link dentro de uma célula. Os filetes são de cada célula.
export default function FaixaDeRisco({
  atrasadas,
  vencemEm7,
  semTriagem,
  diasDaMaisAntiga,
}: {
  atrasadas: number;
  vencemEm7: number;
  semTriagem: number;
  diasDaMaisAntiga: number | null;
}) {
  return (
    <section aria-label="O que exige ação hoje" className="bg-sf border-t-2 border-regua-forte grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr]">
      <div className="p-5 border-b md:border-b-0 md:border-r border-regua last:border-0">
        <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-2">Prazos em risco</p>
        <p className={`mt-2 flex items-center gap-2 text-tarja font-bold tabular-nums ${atrasadas > 0 ? "text-urgente" : "text-tx"}`}>
          {atrasadas > 0 && <AlertTriangle size={32} aria-hidden="true" />}
          {atrasadas}
        </p>
        <p className="text-sm text-tx-2 mt-1">{atrasadas === 0 ? "nenhuma tarefa ou prazo atrasado" : atrasadas === 1 ? "tarefa ou prazo atrasado" : "tarefas e prazos atrasados"}</p>
        <Link href="/agenda" className="mt-2 inline-flex items-center max-md:min-h-11 text-sm font-semibold text-marca-tx hover:underline">
          Abrir a Agenda
        </Link>
      </div>
      <div className="p-5 border-b md:border-b-0 md:border-r border-regua last:border-0">
        <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-2">Próximos 7 dias</p>
        <p className="mt-2 flex items-center gap-2 text-guia font-bold tabular-nums text-tx">
          <Clock size={22} aria-hidden="true" className="text-tx-3" />
          {vencemEm7}
        </p>
        <p className="text-sm text-tx-2 mt-1">{vencemEm7 === 1 ? "vence" : "vencem"} até daqui a uma semana</p>
        <Link href="/agenda" className="mt-2 inline-flex items-center max-md:min-h-11 text-sm font-semibold text-marca-tx hover:underline">
          Ver na Agenda
        </Link>
      </div>
      <div className="p-5 border-b md:border-b-0 md:border-r border-regua last:border-0">
        <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-2">Publicações sem triagem</p>
        <p className="mt-2 text-guia font-bold tabular-nums text-tx">{semTriagem}</p>
        <p className="text-sm text-tx-2 mt-1">
          {semTriagem === 0 ? "tudo triado" : diasDaMaisAntiga !== null ? `a mais antiga tem ${contar(diasDaMaisAntiga, "dia")}` : "aguardando triagem"}
        </p>
        <Link href="/publicacoes" className="mt-2 inline-flex items-center max-md:min-h-11 text-sm font-semibold text-marca-tx hover:underline">
          Ver as publicações
        </Link>
      </div>
    </section>
  );
}
