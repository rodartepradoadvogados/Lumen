import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, formatCurrency, EmptyState } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function DrePage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({ where: { status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
    prisma.payable.findMany({ where: { status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
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

  const prevHref = `/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}`;
  const nextHref = `/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}`;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader
        title="DRE — Demonstrativo de Resultado"
        subtitle="Baseado em valores efetivamente pagos/recebidos (regime de caixa)"
        action={
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
        }
      />

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
    </div>
  );
}
