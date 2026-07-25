import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, formatCurrency } from "@/components/ui";
import { buildCategoryBreakdown } from "@/lib/cashFlowGroups";
import { CategoryBreakdownSection } from "@/components/CategoryBreakdownTree";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function FluxoDeCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { not: "CANCELADO" }, dueDate: { gte: windowStart, lte: windowEnd } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { not: "CANCELADO" }, dueDate: { gte: windowStart, lte: windowEnd } } }),
  ]);

  const months: { key: string; label: string; entradas: number; saidas: number; year: number; monthIdx: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, entradas: 0, saidas: 0, year: d.getFullYear(), monthIdx: d.getMonth() });
  }

  for (const r of receivables) {
    const key = `${r.dueDate.getFullYear()}-${r.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.entradas += r.amount;
  }
  for (const p of payables) {
    const key = `${p.dueDate.getFullYear()}-${p.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.saidas += p.amount;
  }

  const maxVal = Math.max(...months.map((m) => Math.max(m.entradas, m.saidas)), 1);
  let saldoAcumulado = 0;

  const [receitasBreakdown, despesasBreakdown] = await Promise.all([
    buildCategoryBreakdown(
      "RECEITA",
      viewer.officeId,
      receivables.map((r) => ({ id: r.id, description: r.description, date: r.dueDate, amount: r.amount, categoryId: r.categoryId }))
    ),
    buildCategoryBreakdown(
      "DESPESA",
      viewer.officeId,
      payables.map((p) => ({ id: p.id, description: p.description, date: p.dueDate, amount: p.amount, categoryId: p.categoryId }))
    ),
  ]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
        ← Financeiro
      </Link>
      <PageHeader title="Fluxo de Caixa" subtitle="Entradas e saídas projetadas por mês (com base nos vencimentos) · 3 meses atrás a 3 meses à frente" />

      <Card className="p-6 mb-6">
        <div className="flex items-end gap-4 h-64">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="flex items-end gap-1 h-full w-full justify-center">
                <div
                  className="w-6 rounded-t bg-emerald-500 dark:bg-emerald-400"
                  style={{ height: `${(m.entradas / maxVal) * 100}%` }}
                  title={`Entradas: ${formatCurrency(m.entradas)}`}
                />
                <div
                  className="w-6 rounded-t bg-red-400 dark:bg-bordo-400"
                  style={{ height: `${(m.saidas / maxVal) * 100}%` }}
                  title={`Saídas: ${formatCurrency(m.saidas)}`}
                />
              </div>
              <span className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 mt-1">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 justify-center mt-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> Entradas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400 dark:bg-bordo-400" /> Saídas</span>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Detalhamento mensal" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {months.map((m) => {
            saldoAcumulado += m.entradas - m.saidas;
            return (
              <div key={m.key} className="grid grid-cols-5 gap-3 px-5 py-3 text-sm">
                <span className="font-semibold text-navy-900 dark:text-cream-50">{m.label}</span>
                <span className="text-emerald-600 dark:text-emerald-400 text-right">{formatCurrency(m.entradas)}</span>
                <span className="text-red-500 dark:text-bordo-400 text-right">{formatCurrency(m.saidas)}</span>
                <span className={`text-right font-semibold ${m.entradas - m.saidas >= 0 ? "text-navy-900 dark:text-cream-50" : "text-red-600 dark:text-bordo-400"}`}>
                  {formatCurrency(m.entradas - m.saidas)}
                </span>
                <span className={`text-right font-semibold ${saldoAcumulado >= 0 ? "text-gold-700 dark:text-gold-400" : "text-red-600 dark:text-bordo-400"}`}>
                  {formatCurrency(saldoAcumulado)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Receitas por grupo" subtitle="Clique numa linha para destrinchar os grupos e ver os lançamentos · mesmo período dos 7 meses acima" />
        <CategoryBreakdownSection title="Receitas" breakdown={receitasBreakdown} tone="green" />
      </Card>

      <Card>
        <CardHeader title="Despesas por grupo" subtitle="Clique numa linha para destrinchar os grupos e ver os lançamentos · mesmo período dos 7 meses acima" />
        <CategoryBreakdownSection title="Despesas" breakdown={despesasBreakdown} tone="red" />
      </Card>
    </div>
  );
}
