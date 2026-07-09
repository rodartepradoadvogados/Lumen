import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, formatCurrency, EmptyState } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function DrePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; from?: string; to?: string; costCenterId?: string };
}) {
  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const usingCustomRange = !!(searchParams.from && searchParams.to);
  const start = usingCustomRange ? new Date(searchParams.from!) : new Date(year, month, 1);
  const end = usingCustomRange ? new Date(`${searchParams.to}T23:59:59`) : new Date(year, month + 1, 1);

  const costCenterId = searchParams.costCenterId || undefined;

  const [receivables, payables, costCenters] = await Promise.all([
    prisma.receivable.findMany({ where: { status: "PAGO", paidDate: { gte: start, lt: end }, costCenterId }, include: { category: true } }),
    prisma.payable.findMany({ where: { status: "PAGO", paidDate: { gte: start, lt: end }, costCenterId }, include: { category: true } }),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
  ]);

  const receitasPorCategoria: Record<string, number> = {};
  for (const r of receivables) {
    const key = r.category?.name ?? "Outras Receitas";
    receitasPorCategoria[key] = (receitasPorCategoria[key] ?? 0) + (r.paidAmount ?? r.amount);
  }
  const despesasPorCategoria: Record<string, number> = {};
  for (const p of payables) {
    const key = p.category?.name ?? "Outras Despesas";
    despesasPorCategoria[key] = (despesasPorCategoria[key] ?? 0) + (p.paidAmount ?? p.amount);
  }

  const totalReceitas = Object.values(receitasPorCategoria).reduce((s, v) => s + v, 0);
  const totalDespesas = Object.values(despesasPorCategoria).reduce((s, v) => s + v, 0);
  const resultado = totalReceitas - totalDespesas;

  const carryParams = costCenterId ? `&costCenterId=${costCenterId}` : "";
  const prevHref = `/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}${carryParams}`;
  const nextHref = `/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}${carryParams}`;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader
        title="DRE — Demonstrativo de Resultado"
        subtitle="Baseado em valores efetivamente pagos/recebidos (regime de caixa)"
        action={
          !usingCustomRange ? (
            <div className="flex items-center gap-1">
              <Link href={prevHref} className="p-1.5 rounded-lg hover:bg-cream-100 text-navy-800">
                <ChevronLeft size={18} />
              </Link>
              <span className="text-sm font-semibold text-navy-900 px-2">
                {MONTHS[month]} {year}
              </span>
              <Link href={nextHref} className="p-1.5 rounded-lg hover:bg-cream-100 text-navy-800">
                <ChevronRight size={18} />
              </Link>
            </div>
          ) : (
            <span className="text-sm font-semibold text-navy-900">
              {start.toLocaleDateString("pt-BR")} — {end.toLocaleDateString("pt-BR")}
            </span>
          )
        }
      />

      <Card className="mb-5">
        <form className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">De (opcional, substitui o mês)</label>
            <input type="date" name="from" defaultValue={searchParams.from} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Até</label>
            <input type="date" name="to" defaultValue={searchParams.to} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Centro de Custo</label>
            <select name="costCenterId" defaultValue={searchParams.costCenterId} className="fp-input">
              <option value="">Todos</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Filtrar
          </button>
          {usingCustomRange && (
            <Link href={`/financeiro/dre${costCenterId ? `?costCenterId=${costCenterId}` : ""}`} className="text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2">
              Voltar para visão mensal
            </Link>
          )}
        </form>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Receitas" />
        <div className="divide-y divide-navy-800/5">
          {Object.keys(receitasPorCategoria).length === 0 && <EmptyState title="Nenhuma receita no período" />}
          {Object.entries(receitasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-5 py-2.5 text-sm">
              <span className="text-navy-800">{cat}</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-5 py-3 text-sm font-bold bg-cream-50">
            <span>Total de Receitas</span>
            <span className="text-emerald-700">{formatCurrency(totalReceitas)}</span>
          </div>
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Despesas" />
        <div className="divide-y divide-navy-800/5">
          {Object.keys(despesasPorCategoria).length === 0 && <EmptyState title="Nenhuma despesa no período" />}
          {Object.entries(despesasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-5 py-2.5 text-sm">
              <span className="text-navy-800">{cat}</span>
              <span className="font-semibold text-red-500">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-5 py-3 text-sm font-bold bg-cream-50">
            <span>Total de Despesas</span>
            <span className="text-red-600">{formatCurrency(totalDespesas)}</span>
          </div>
        </div>
      </Card>

      <Card className={`p-5 flex justify-between items-center ${resultado >= 0 ? "bg-gold-500/10" : "bg-red-50"}`}>
        <span className="font-serif font-bold text-navy-900">Resultado do Período</span>
        <span className={`font-serif font-bold text-xl ${resultado >= 0 ? "text-gold-800" : "text-red-600"}`}>{formatCurrency(resultado)}</span>
      </Card>
      <style>{`
        .fp-input { border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; }
        .fp-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </div>
  );
}
