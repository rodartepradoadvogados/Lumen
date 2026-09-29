import Link from "next/link";
import { Card, CardHeader, formatCurrency } from "@/components/ui";
import { contar } from "@/lib/plural";
import type { DevedorAgrupado } from "@/lib/gestao/inadimplencia";

// Inadimplência por cliente — só para quem tem acesso ao Financeiro (a página decide). O total é o
// mesmo de Relatórios > Financeiro (saldo em aberto das contas vencidas). NÃO há botão "Cobrar" que
// dispare mensagem: isso seria um comportamento novo com consequência para o cliente do escritório
// e depende de decisão do dono; o caminho hoje é abrir o Financeiro na lista de contas em aberto.
export default function Inadimplencia({ total, contas, devedores }: { total: number; contas: number; devedores: DevedorAgrupado[] }) {
  const maiores = devedores.slice(0, 5);
  return (
    <Card>
      <CardHeader title="Inadimplência" subtitle={contas === 0 ? "Nada vencido e não pago" : `${contar(contas, "conta vencida", "contas vencidas")} e não paga${contas === 1 ? "" : "s"}`} />
      <div className="p-5">
        <p className={`text-guia font-bold tabular-nums ${total > 0 ? "text-urgente" : "text-tx"}`}>{formatCurrency(total)}</p>
        <p className="text-sm text-tx-2">saldo em aberto das contas com vencimento anterior a hoje</p>
        {maiores.length > 0 && (
          <ul className="mt-4 divide-y divide-regua">
            {maiores.map((d) => (
              <li key={d.chave} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tx truncate">{d.nome}</p>
                  <p className="text-sm text-tx-2 tabular-nums">
                    {contar(d.contas, "conta")} · <span className="font-semibold text-urgente">{contar(d.diasDeAtraso, "dia")} de atraso</span>
                  </p>
                </div>
                <b className="text-sm tabular-nums text-tx shrink-0">{formatCurrency(d.saldo)}</b>
              </li>
            ))}
          </ul>
        )}
        {devedores.length > maiores.length && <p className="mt-2 text-sm text-tx-2">e mais {devedores.length - maiores.length} com contas vencidas</p>}
        <p className="mt-3">
          <Link href="/financeiro/receitas" className="text-sm font-semibold text-marca-tx hover:underline">
            {contas > 0 ? `Ver as ${contas} contas no Financeiro` : "Abrir o Financeiro"}
          </Link>
        </p>
      </div>
    </Card>
  );
}
