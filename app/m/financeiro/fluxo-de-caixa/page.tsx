import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, formatCurrency } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Mesma lógica de cálculo da página desktop (`/financeiro/fluxo-de-caixa`): projeção por
// vencimento, -3 a +3 meses a partir do mês atual — só a apresentação muda para lista.
export default async function MobileFluxoDeCaixa() {
  const viewer = await getCurrentUser();
  if (!(viewer?.isAdmin || viewer?.financeAccess)) notFound();

  const now = new Date();
  const [payables, receivables] = await Promise.all([prisma.payable.findMany(), prisma.receivable.findMany()]);

  const months: { key: string; label: string; entradas: number; saidas: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, entradas: 0, saidas: 0 });
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

  let saldoAcumulado = 0;
  const rows = months.map((m) => {
    const saldoMes = m.entradas - m.saidas;
    saldoAcumulado += saldoMes;
    return { ...m, saldoMes, saldoAcumulado };
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Fluxo de Caixa</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Entradas e saídas projetadas por mês (por vencimento)</p>
      </div>

      <Card>
        <CardHeader title="Detalhamento mensal" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {rows.map((m) => (
            <div key={m.key} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-900 dark:text-cream-50">{m.label}</span>
                <span
                  className={`text-sm font-semibold ${
                    m.saldoAcumulado >= 0 ? "text-gold-700 dark:text-gold-400" : "text-red-600 dark:text-bordo-400"
                  }`}
                >
                  Acumulado: {formatCurrency(m.saldoAcumulado)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <span className="text-emerald-600 dark:text-emerald-400">↑ {formatCurrency(m.entradas)}</span>
                <span className="text-red-500 dark:text-bordo-400 text-center">↓ {formatCurrency(m.saidas)}</span>
                <span
                  className={`text-right font-semibold ${
                    m.saldoMes >= 0 ? "text-navy-900 dark:text-cream-50" : "text-red-600 dark:text-bordo-400"
                  }`}
                >
                  {formatCurrency(m.saldoMes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
