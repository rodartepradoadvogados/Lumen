import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, formatCurrency, EmptyState } from "@/components/ui";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { valorLiquido, isAdiantamentoPayable, isReembolsoReceivable } from "@/lib/financeCalc";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function DrePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; from?: string; to?: string; costCenterId?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const usingCustomRange = !!(searchParams.from && searchParams.to);
  const start = usingCustomRange ? new Date(searchParams.from!) : new Date(year, month, 1);
  const end = usingCustomRange ? new Date(`${searchParams.to}T23:59:59`) : new Date(year, month + 1, 1);

  const costCenterId = searchParams.costCenterId || undefined;

  // status "PAGO" (exato, não uma lista/negação) já exclui A_APURAR sozinho — uma provisão
  // percentual nunca é baixada como paga sem antes ser apurada. paidAmount é o valor
  // efetivamente pago/recebido (regime de caixa de verdade); o fallback para amount só cobre
  // registro legado sem paidAmount, e nesse caso ainda passa por valorLiquido (desconto/
  // acréscimo) para não subestimar/superestimar o período.
  const [receivables, payables, costCenters] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end }, costCenterId }, include: { category: true } }),
    prisma.payable.findMany({
      where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end }, costCenterId },
      include: { category: true, reimbursementReceivable: { select: { id: true } } },
    }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  // Adiantamentos a Clientes (Despesas do Processo com reembolso vinculado) são uma transferência,
  // não Receita/Despesa de verdade do escritório — ver comentário de isAdiantamentoPayable/
  // isReembolsoReceivable em lib/financeCalc.ts. Excluídos aqui do resultado normal e somados à
  // parte, numa seção informativa própria (mais abaixo).
  let totalAdiantado = 0;
  let totalReembolsado = 0;

  const receitasPorCategoria: Record<string, number> = {};
  for (const r of receivables) {
    if (isReembolsoReceivable(r)) {
      totalReembolsado += r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge);
      continue;
    }
    const key = r.category?.name ?? "Outras Receitas";
    receitasPorCategoria[key] = (receitasPorCategoria[key] ?? 0) + (r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge));
  }
  const despesasPorCategoria: Record<string, number> = {};
  for (const p of payables) {
    if (isAdiantamentoPayable(p)) {
      totalAdiantado += p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge);
      continue;
    }
    const key = p.category?.name ?? "Outras Despesas";
    despesasPorCategoria[key] = (despesasPorCategoria[key] ?? 0) + (p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge));
  }

  const totalReceitas = Object.values(receitasPorCategoria).reduce((s, v) => s + v, 0);
  const totalDespesas = Object.values(despesasPorCategoria).reduce((s, v) => s + v, 0);
  const resultado = totalReceitas - totalDespesas;
  const saldoAdiantamentos = totalAdiantado - totalReembolsado;

  const carryParams = costCenterId ? `&costCenterId=${costCenterId}` : "";
  const prevHref = `/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}${carryParams}`;
  const nextHref = `/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}${carryParams}`;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader
        title="DRE — Demonstrativo de Resultado"
        subtitle="Baseado em valores efetivamente pagos/recebidos (regime de caixa)"
        action={
          !usingCustomRange ? (
            <div className="flex items-center gap-1">
              <Link href={prevHref} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx-2">
                <ChevronLeft size={18} />
              </Link>
              <span className="text-sm font-semibold text-tx px-2">
                {MONTHS[month]} {year}
              </span>
              <Link href={nextHref} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx-2">
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
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2 transition-colors">
            Filtrar
          </button>
          {usingCustomRange && (
            <Link href={`/financeiro/dre${costCenterId ? `?costCenterId=${costCenterId}` : ""}`} className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx px-2">
              Voltar para visão mensal
            </Link>
          )}
        </form>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Receitas" />
        <div className="divide-y divide-regua">
          {Object.keys(receitasPorCategoria).length === 0 && <EmptyState title="Nenhuma receita no período" />}
          {Object.entries(receitasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-5 py-2.5 text-sm">
              <span className="text-tx">{cat}</span>
              <span className="font-semibold tabular-nums text-concluido">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-5 py-3 text-sm font-bold bg-sf-apoio">
            <span>Total de Receitas</span>
            <span className="tabular-nums text-concluido">{formatCurrency(totalReceitas)}</span>
          </div>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Despesas" />
        <div className="divide-y divide-regua">
          {Object.keys(despesasPorCategoria).length === 0 && <EmptyState title="Nenhuma despesa no período" />}
          {Object.entries(despesasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-5 py-2.5 text-sm">
              <span className="text-tx">{cat}</span>
              <span className="font-semibold tabular-nums text-urgente">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-5 py-3 text-sm font-bold bg-sf-apoio">
            <span>Total de Despesas</span>
            <span className="tabular-nums text-urgente">{formatCurrency(totalDespesas)}</span>
          </div>
        </div>
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

      <Card className={`p-5 flex justify-between items-center ${resultado >= 0 ? "bg-concluido-bg" : "bg-urgente-bg"}`}>
        <span className="font-bold text-tx">Resultado do Período</span>
        <span className={`font-bold text-xl tabular-nums ${resultado >= 0 ? "text-concluido" : "text-urgente"}`}>{formatCurrency(resultado)}</span>
      </Card>
      <style>{`
        .fp-input { border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; background-color: var(--sf); color: var(--tx); }
        .fp-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </div>
  );
}
