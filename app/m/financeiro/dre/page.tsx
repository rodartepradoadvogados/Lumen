import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, formatCurrency } from "@/components/ui";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Download } from "lucide-react";
import { calcularDre, periodoAnterior, variacaoPercentual } from "@/lib/dreCalculo";
import { MobileDreCascataTable } from "@/components/financeiro/MobileDreCascataTable";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Mesma camada de cálculo da página desktop (lib/dreCalculo.ts) — cascata com subtotal por grupo,
// % da receita e comparação com o período anterior, só que empilhada (MobileDreCascataTable) em
// vez do grid de 5 colunas que não cabe na largura mobile.
export default async function MobileDre({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const viewer = await getCurrentUser();
  if (!(viewer?.isAdmin || viewer?.financeAccess)) notFound();

  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const periodoAtual = { de: new Date(year, month, 1), ate: new Date(year, month + 1, 1) };
  const periodoAnt = periodoAnterior(periodoAtual);

  const [atual, anterior] = await Promise.all([
    calcularDre(viewer.officeId, periodoAtual),
    calcularDre(viewer.officeId, periodoAnt),
  ]);

  const { receitas, despesas, totalReceitas, resultado, totalAdiantado, totalReembolsado, saldoAdiantamentos } = atual;
  const margemLiquida = totalReceitas ? (resultado / totalReceitas) * 100 : null;
  const variacaoResultado = variacaoPercentual(resultado, anterior.resultado);

  const prevHref = `/m/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}`;
  const nextHref = `/m/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}`;
  const exportHref = `/api/financeiro/dre/export?year=${year}&month=${month}`;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-tx">DRE Gerencial</h1>
          <p className="text-sm text-tx-2">Regime de caixa · comparado ao período anterior</p>
        </div>
        <a
          href={exportHref}
          className="flex items-center gap-1 text-xs font-semibold text-tx-2 border border-regua-forte rounded-lg px-2.5 py-1.5 shrink-0"
        >
          <Download size={12} /> .xlsx
        </a>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={prevHref}
          className="h-9 w-9 rounded-lg bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <p className="font-bold text-tx text-sm text-center flex-1">
          {MONTHS[month]} {year}
        </p>
        <Link
          href={nextHref}
          className="h-9 w-9 rounded-lg bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card>
        <CardHeader title="Receita Operacional" subtitle="Toque para destrinchar" />
        <MobileDreCascataTable title="Receita Operacional Bruta" breakdown={receitas} breakdownAnterior={anterior.receitas} totalReceitaBase={totalReceitas} tone="green" />
      </Card>

      <Card>
        <CardHeader title="Despesas Operacionais" subtitle="Toque para destrinchar" />
        <MobileDreCascataTable title="Total de Despesas Operacionais" breakdown={despesas} breakdownAnterior={anterior.despesas} totalReceitaBase={totalReceitas} tone="red" />
      </Card>

      {(totalAdiantado > 0 || totalReembolsado > 0) && (
        <Card className="border border-dashed border-regua">
          <CardHeader title="Adiantamentos a Clientes" subtitle="Informativo — fora do Resultado" />
          <div className="px-4 py-3 flex items-start gap-2 text-xs text-tx-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <p>Despesas do processo pagas por conta do cliente (com reembolso vinculado) não entram na Receita/Despesa nem no Resultado.</p>
          </div>
          <div className="divide-y divide-regua border-t border-regua">
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Adiantado no período</span>
              <span className="font-semibold tabular-nums text-tx">{formatCurrency(totalAdiantado)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Reembolsado no período</span>
              <span className="font-semibold tabular-nums text-tx">{formatCurrency(totalReembolsado)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Saldo do período</span>
              <span className="font-semibold tabular-nums text-tx">{formatCurrency(saldoAdiantamentos)}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className={`p-4 space-y-1.5 ${resultado >= 0 ? "bg-concluido-bg" : "bg-urgente-bg"}`}>
        <div className="flex justify-between items-center">
          <span className="font-bold text-tx">Resultado Líquido</span>
          <span className={`font-bold text-lg tabular-nums ${resultado >= 0 ? "text-concluido" : "text-urgente"}`}>{formatCurrency(resultado)}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-tx-2">
          <span>Margem líquida</span>
          <span className="tabular-nums font-medium">{margemLiquida === null ? "—" : `${margemLiquida.toFixed(1)}%`}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-tx-2">
          <span>Período anterior</span>
          <span className="tabular-nums">
            {formatCurrency(anterior.resultado)}
            {variacaoResultado !== null && ` (${variacaoResultado >= 0 ? "+" : ""}${variacaoResultado.toFixed(1)}%)`}
          </span>
        </div>
      </Card>
    </div>
  );
}
