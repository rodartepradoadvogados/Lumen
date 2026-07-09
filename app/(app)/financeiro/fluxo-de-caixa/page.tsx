import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, formatCurrency } from "@/components/ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function FluxoDeCaixaPage() {
  const now = new Date();
  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany(),
    prisma.receivable.findMany(),
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

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader title="Fluxo de Caixa" subtitle="Entradas e saídas projetadas por mês (com base nos vencimentos)" />

      <Card className="p-6 mb-6">
        <div className="flex items-end gap-4 h-64">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="flex items-end gap-1 h-full w-full justify-center">
                <div
                  className="w-6 rounded-t bg-emerald-500"
                  style={{ height: `${(m.entradas / maxVal) * 100}%` }}
                  title={`Entradas: ${formatCurrency(m.entradas)}`}
                />
                <div
                  className="w-6 rounded-t bg-red-400"
                  style={{ height: `${(m.saidas / maxVal) * 100}%` }}
                  title={`Saídas: ${formatCurrency(m.saidas)}`}
                />
              </div>
              <span className="text-xs font-semibold text-navy-800/60 mt-1">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 justify-center mt-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Entradas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Saídas</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="Detalhamento mensal" />
        <div className="divide-y divide-navy-800/5">
          {months.map((m) => {
            saldoAcumulado += m.entradas - m.saidas;
            return (
              <div key={m.key} className="grid grid-cols-5 gap-3 px-5 py-3 text-sm">
                <span className="font-semibold text-navy-900">{m.label}</span>
                <span className="text-emerald-600 text-right">{formatCurrency(m.entradas)}</span>
                <span className="text-red-500 text-right">{formatCurrency(m.saidas)}</span>
                <span className={`text-right font-semibold ${m.entradas - m.saidas >= 0 ? "text-navy-900" : "text-red-600"}`}>
                  {formatCurrency(m.entradas - m.saidas)}
                </span>
                <span className={`text-right font-semibold ${saldoAcumulado >= 0 ? "text-gold-700" : "text-red-600"}`}>
                  {formatCurrency(saldoAcumulado)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
