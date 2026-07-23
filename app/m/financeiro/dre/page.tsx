import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, EmptyState, formatCurrency } from "@/components/ui";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// DRE simplificado: mesma lógica de cálculo da página desktop (`/financeiro/dre`) — total
// por categoria com base em valores efetivamente pagos/recebidos (regime de caixa) — só o
// mês corrente com navegação anterior/próximo, sem intervalo customizado nem filtro de
// centro de custo (fora do essencial para o recorte mobile).
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
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
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

  const prevHref = `/m/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}`;
  const nextHref = `/m/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}`;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">DRE</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Regime de caixa (pago/recebido)</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={prevHref}
          className="h-9 w-9 rounded-lg bg-white dark:bg-navy-900 border border-navy-800/10 dark:border-white/10 flex items-center justify-center text-navy-800/60 dark:text-cream-50/60"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <p className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm text-center flex-1">
          {MONTHS[month]} {year}
        </p>
        <Link
          href={nextHref}
          className="h-9 w-9 rounded-lg bg-white dark:bg-navy-900 border border-navy-800/10 dark:border-white/10 flex items-center justify-center text-navy-800/60 dark:text-cream-50/60"
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card>
        <CardHeader title="Receitas" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {Object.keys(receitasPorCategoria).length === 0 && <EmptyState title="Nenhuma receita no período" />}
          {Object.entries(receitasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-4 py-2.5 text-sm gap-3">
              <span className="text-navy-800 dark:text-cream-50/85 truncate">{cat}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 text-sm font-bold bg-cream-50 dark:bg-white/5">
            <span className="text-navy-900 dark:text-cream-50">Total de Receitas</span>
            <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(totalReceitas)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Despesas" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {Object.keys(despesasPorCategoria).length === 0 && <EmptyState title="Nenhuma despesa no período" />}
          {Object.entries(despesasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-4 py-2.5 text-sm gap-3">
              <span className="text-navy-800 dark:text-cream-50/85 truncate">{cat}</span>
              <span className="font-semibold text-red-500 dark:text-bordo-400 shrink-0">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 text-sm font-bold bg-cream-50 dark:bg-white/5">
            <span className="text-navy-900 dark:text-cream-50">Total de Despesas</span>
            <span className="text-red-600 dark:text-bordo-400">{formatCurrency(totalDespesas)}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5 flex justify-between items-center">
        <span className="font-serif font-bold text-navy-900 dark:text-cream-50">Resultado do Período</span>
        <span className={`font-serif font-bold text-xl ${resultado >= 0 ? "text-gold-700 dark:text-gold-400" : "text-red-600 dark:text-bordo-400"}`}>
          {formatCurrency(resultado)}
        </span>
      </Card>
    </div>
  );
}
