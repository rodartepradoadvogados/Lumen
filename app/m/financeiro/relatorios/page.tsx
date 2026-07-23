import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, EmptyState, formatCurrency } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// Só a parte financeira do painel de BI (`/relatorios`) do desktop, com os últimos 6 meses
// fixos (sem seletor de período) e sem produtividade/funil/publicações, que não fazem
// sentido no recorte financeiro mobile.
export default async function MobileRelatoriosFinanceiro() {
  const viewer = await getCurrentUser();
  if (!(viewer?.isAdmin || viewer?.financeAccess)) notFound();

  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [paidReceivables, paidPayables, overdueReceivables, allReceivables] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end } } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false, dueDate: { lt: now } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { not: "CANCELADO" } }, select: { amount: true } }),
  ]);

  const financeMonthly = months.map((m) => {
    const receita = paidReceivables
      .filter((r) => r.paidDate && monthKey(r.paidDate) === m.key)
      .reduce((s, r) => s + (r.paidAmount ?? r.amount), 0);
    const despesa = paidPayables
      .filter((p) => p.paidDate && monthKey(p.paidDate) === m.key)
      .reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);
    return { ...m, receita, despesa, saldo: receita - despesa };
  });

  const totalRecebido = financeMonthly.reduce((s, m) => s + m.receita, 0);
  const totalPago = financeMonthly.reduce((s, m) => s + m.despesa, 0);
  const saldoPeriodo = totalRecebido - totalPago;

  const expenseByCat: Record<string, number> = {};
  for (const p of paidPayables) {
    const key = p.category?.name ?? "Sem categoria";
    expenseByCat[key] = (expenseByCat[key] ?? 0) + (p.paidAmount ?? p.amount);
  }
  const topExpenses = Object.entries(expenseByCat)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const inadimplenciaTotal = overdueReceivables.reduce((s, r) => s + r.amount, 0);
  const inadimplenciaCount = overdueReceivables.length;
  const totalReceivablesAmount = allReceivables.reduce((s, r) => s + r.amount, 0);
  const inadimplenciaRate = totalReceivablesAmount > 0 ? (inadimplenciaTotal / totalReceivablesAmount) * 100 : 0;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Relatórios · Financeiro</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          {months[0].label} a {months[months.length - 1].label}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Recebido (6m)" value={formatCurrency(totalRecebido)} tone="green" />
        <StatBlock label="Pago (6m)" value={formatCurrency(totalPago)} tone="red" />
      </div>
      <StatBlock label="Saldo do período" value={formatCurrency(saldoPeriodo)} tone={saldoPeriodo >= 0 ? "gold" : "red"} />
      <StatBlock
        label="Inadimplência atual"
        value={formatCurrency(inadimplenciaTotal)}
        tone="red"
        hint={`${inadimplenciaCount} conta(s) vencida(s) · ${inadimplenciaRate.toFixed(1)}% do total a receber`}
      />

      <Card>
        <CardHeader title="Recebido x Pago por mês" subtitle="Regime de caixa" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {financeMonthly.map((m) => (
            <div key={m.key} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 w-12 shrink-0 capitalize">{m.label}</span>
              <div className="flex-1 text-right leading-tight">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">+{formatCurrency(m.receita)}</p>
                <p className="text-xs text-red-500 dark:text-bordo-400">-{formatCurrency(m.despesa)}</p>
              </div>
              <span
                className={`text-sm font-semibold w-28 text-right shrink-0 ${
                  m.saldo >= 0 ? "text-navy-900 dark:text-cream-50" : "text-red-600 dark:text-bordo-400"
                }`}
              >
                {formatCurrency(m.saldo)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Top 5 despesas do período" />
        {topExpenses.length === 0 ? (
          <EmptyState title="Nenhuma despesa paga no período" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {topExpenses.map((e) => (
              <div key={e.label} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-navy-800 dark:text-cream-50/85 truncate">{e.label}</span>
                <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{formatCurrency(e.value)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "gold" | "navy";
}) {
  const toneClass = {
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-bordo-400",
    gold: "text-gold-700 dark:text-gold-400",
    navy: "text-navy-900 dark:text-cream-50",
  }[tone];
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-navy-800/55 dark:text-cream-50/55 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-serif font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-1">{hint}</p>}
    </Card>
  );
}
