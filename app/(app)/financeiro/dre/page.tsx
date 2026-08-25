import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, formatCurrency } from "@/components/ui";
import { ChevronLeft, ChevronRight, Info, Download } from "lucide-react";
import { calcularDre, periodoAnterior, variacaoPercentual } from "@/lib/dreCalculo";
import { filtrarGruposVazios } from "@/lib/cashFlowGroups";
import { DreCascataTable } from "@/components/financeiro/DreCascataTable";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// DRE Gerencial: cascata Receita Operacional -> Despesas Operacionais -> Resultado Líquido, com
// análise vertical (% da Receita, convenção padrão de DRE gerencial: até as despesas mostram que
// fatia da receita consomem) e comparação com o período anterior de mesma duração — pedido
// explícito ("apresentar as linhas todas, completas, com os indicadores da DRE normal"). A
// estrutura em árvore (grupo -> subgrupo, com subtotal em cada nível) é a mesma do plano de
// contas que o Fluxo de Caixa já usa (lib/cashFlowGroups.ts) — sem inventar categorias novas
// (Deduções/Financeiro) que o plano de contas de hoje não sustenta com dado real.
export default async function DrePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; from?: string; to?: string; costCenterId?: string; ocultarVazias?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const ocultarVazias = searchParams.ocultarVazias === "1";

  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const usingCustomRange = !!(searchParams.from && searchParams.to);
  const start = usingCustomRange ? new Date(searchParams.from!) : new Date(year, month, 1);
  const end = usingCustomRange ? new Date(`${searchParams.to}T23:59:59`) : new Date(year, month + 1, 1);

  const costCenterId = searchParams.costCenterId || undefined;
  const periodoAtual = { de: start, ate: end };
  const periodoAnt = periodoAnterior(periodoAtual);

  const [atual, anterior, costCenters] = await Promise.all([
    calcularDre(viewer.officeId, periodoAtual, costCenterId),
    calcularDre(viewer.officeId, periodoAnt, costCenterId),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  const { receitas, despesas, totalReceitas, resultado, totalAdiantado, totalReembolsado, saldoAdiantamentos } = atual;
  const margemLiquida = totalReceitas ? (resultado / totalReceitas) * 100 : null;
  const variacaoResultado = variacaoPercentual(resultado, anterior.resultado);

  const carryParams = costCenterId ? `&costCenterId=${costCenterId}` : "";
  const prevHref = `/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}${carryParams}`;
  const nextHref = `/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}${carryParams}`;

  const exportParams = new URLSearchParams();
  if (usingCustomRange) {
    exportParams.set("from", searchParams.from!);
    exportParams.set("to", searchParams.to!);
  } else {
    exportParams.set("year", String(year));
    exportParams.set("month", String(month));
  }
  if (costCenterId) exportParams.set("costCenterId", costCenterId);
  const exportHref = `/api/financeiro/dre/export?${exportParams.toString()}`;
  const printParams = new URLSearchParams(exportParams);
  if (ocultarVazias) printParams.set("ocultarVazias", "1");
  const printHref = `/financeiro/dre/imprimir?${printParams.toString()}`;

  const receitasExibidas = ocultarVazias ? { ...receitas, groups: filtrarGruposVazios(receitas.groups) } : receitas;
  const despesasExibidas = ocultarVazias ? { ...despesas, groups: filtrarGruposVazios(despesas.groups) } : despesas;

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader
        title="DRE Gerencial"
        subtitle="Regime de caixa (pago/recebido) — comparado ao período anterior de mesma duração"
        action={
          !usingCustomRange ? (
            <div className="flex items-center gap-1">
              <Link href={prevHref} className="p-1.5 hover:bg-sf-apoio text-tx-2 rounded-md">
                <ChevronLeft size={18} />
              </Link>
              <span className="text-sm font-semibold text-tx px-2">
                {MONTHS[month]} {year}
              </span>
              <Link href={nextHref} className="p-1.5 hover:bg-sf-apoio text-tx-2 rounded-md">
                <ChevronRight size={18} />
              </Link>
            </div>
          ) : (
            <span className="text-sm font-semibold text-tx">
              {start.toLocaleDateString("pt-BR")} — {end.toLocaleDateString("pt-BR")}
            </span>
          )
        }
      />

      <Card className="mb-5">
        <form className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">De (opcional, substitui o mês)</label>
            <input type="date" name="from" defaultValue={searchParams.from} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Até</label>
            <input type="date" name="to" defaultValue={searchParams.to} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Centro de Custo</label>
            <select name="costCenterId" defaultValue={searchParams.costCenterId} className="fp-input">
              <option value="">Todos</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-tx-2 pb-2.5">
            <input type="checkbox" name="ocultarVazias" value="1" defaultChecked={ocultarVazias} className="h-3.5 w-3.5" />
            Ocultar categorias vazias
          </label>
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 transition-colors">
            Filtrar
          </button>
          {usingCustomRange && (
            <Link href={`/financeiro/dre${costCenterId ? `?costCenterId=${costCenterId}` : ""}`} className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx px-2">
              Voltar para visão mensal
            </Link>
          )}
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
          >
            <Download size={13} /> PDF
          </a>
          <a
            href={exportHref}
            className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
          >
            <Download size={13} /> Exportar (.xlsx)
          </a>
        </form>
      </Card>

      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-5 py-1.5 text-[10px] font-semibold text-tx-3 uppercase tracking-wide">
        <span>Linha</span>
        <span className="text-right">Valor</span>
        <span className="text-right w-14">% Receita</span>
        <span className="text-right">Período Anterior</span>
        <span className="text-right">Variação</span>
      </div>

      <Card className="mb-5">
        <CardHeader title="Receita Operacional" subtitle="Por categoria — clique numa linha com subgrupos para destrinchar" />
        <DreCascataTable title="Receita Operacional Bruta" breakdown={receitasExibidas} breakdownAnterior={anterior.receitas} totalReceitaBase={totalReceitas} tone="green" />
      </Card>

      <Card className="mb-5">
        <CardHeader title="Despesas Operacionais" subtitle="Por categoria — clique numa linha com subgrupos para destrinchar" />
        <DreCascataTable title="Total de Despesas Operacionais" breakdown={despesasExibidas} breakdownAnterior={anterior.despesas} totalReceitaBase={totalReceitas} tone="red" />
      </Card>

      {(totalAdiantado > 0 || totalReembolsado > 0) && (
        <Card className="mb-5 border border-dashed border-regua-forte">
          <CardHeader title="Adiantamentos a Clientes" subtitle="Informativo — não entra na Receita, na Despesa nem no Resultado do Período" />
          <div className="px-5 py-4 flex items-start gap-2 text-xs text-tx-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>
              Despesas do processo pagas pelo escritório por conta do cliente (com reembolso vinculado) não são custo nem receita da
              atividade do escritório — são um adiantamento que volta. Por isso ficam de fora do resultado acima e aparecem só aqui.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-regua border-t border-regua">
            <div className="px-5 py-3.5">
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Adiantado no período</p>
              <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(totalAdiantado)}</p>
            </div>
            <div className="px-5 py-3.5">
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Reembolsado no período</p>
              <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(totalReembolsado)}</p>
            </div>
            <div className="px-5 py-3.5">
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Saldo do período (adiantado − reembolsado)</p>
              <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(saldoAdiantamentos)}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className={resultado >= 0 ? "bg-concluido-bg" : "bg-urgente-bg"}>
        <div className="p-5 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-bold text-tx">Resultado Líquido do Período</span>
            <span className={`font-bold text-xl tabular-nums ${resultado >= 0 ? "text-concluido" : "text-urgente"}`}>{formatCurrency(resultado)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-tx-2">
            <span>Margem líquida (Resultado / Receita)</span>
            <span className="tabular-nums font-medium">{margemLiquida === null ? "—" : `${margemLiquida.toFixed(1)}%`}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-tx-2">
            <span>Período anterior</span>
            <span className="tabular-nums">
              {formatCurrency(anterior.resultado)}
              {variacaoResultado !== null && ` (${variacaoResultado >= 0 ? "+" : ""}${variacaoResultado.toFixed(1)}%)`}
            </span>
          </div>
        </div>
      </Card>
      <style>{`
        .fp-input { border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; background-color: var(--sf); color: var(--tx); }
        .fp-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </div>
  );
}
