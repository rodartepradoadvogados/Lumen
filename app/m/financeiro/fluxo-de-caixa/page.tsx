import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, formatCurrency } from "@/components/ui";
import { buildCategoryBreakdown } from "@/lib/cashFlowGroups";
import { CategoryBreakdownSection } from "@/components/CategoryBreakdownTree";
import { valorLiquido } from "@/lib/financeCalc";
import { ArrowLeft, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Mesma lógica de cálculo da página desktop (`/financeiro/fluxo-de-caixa`): projeção por
// vencimento, -3 a +3 meses a partir do mês atual, excluindo lançamentos cancelados e provisões
// A_APURAR (estimativa de honorário percentual sem valor real ainda) — só a apresentação muda
// para lista.
export default async function MobileFluxoDeCaixa() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  // noDueDate: false — "Sem vencimento definido" grava dueDate como placeholder técnico (1º do
  // mês seguinte ao cadastro, nunca atualizado); mesma correção do desktop (achado A45 da
  // revisão gauntlet), ver app/(app)/financeiro/fluxo-de-caixa/page.tsx.
  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
  ]);

  const months: { key: string; label: string; entradas: number; saidas: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, entradas: 0, saidas: 0 });
  }

  for (const r of receivables) {
    const key = `${r.dueDate.getFullYear()}-${r.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.entradas += valorLiquido(r.amount, r.discount, r.surcharge);
  }
  for (const p of payables) {
    const key = `${p.dueDate.getFullYear()}-${p.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.saidas += valorLiquido(p.amount, p.discount, p.surcharge);
  }

  let saldoAcumulado = 0;
  const rows = months.map((m) => {
    const saldoMes = m.entradas - m.saidas;
    saldoAcumulado += saldoMes;
    return { ...m, saldoMes, saldoAcumulado };
  });

  const [receitasBreakdown, despesasBreakdown] = await Promise.all([
    buildCategoryBreakdown(
      "RECEITA",
      viewer.officeId,
      receivables.map((r) => ({ id: r.id, description: r.description, date: r.dueDate, amount: valorLiquido(r.amount, r.discount, r.surcharge), categoryId: r.categoryId }))
    ),
    buildCategoryBreakdown(
      "DESPESA",
      viewer.officeId,
      payables.map((p) => ({ id: p.id, description: p.description, date: p.dueDate, amount: valorLiquido(p.amount, p.discount, p.surcharge), categoryId: p.categoryId }))
    ),
  ]);

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
          <h1 className="text-xl font-bold text-tx">Fluxo de Caixa</h1>
          <p className="text-sm text-tx-2">Entradas e saídas projetadas por mês (por vencimento)</p>
        </div>
        <a
          href="/api/financeiro/fluxo-de-caixa/export"
          className="flex items-center gap-1 text-xs font-semibold text-tx-2 border border-regua-forte px-2.5 py-1.5 shrink-0"
        >
          <Download size={12} /> .xlsx
        </a>
      </div>

      <Card>
        <CardHeader title="Detalhamento mensal" />
        <div className="divide-y divide-regua">
          {rows.map((m) => (
            <div key={m.key} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-tx">{m.label}</span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    m.saldoAcumulado >= 0 ? "text-concluido" : "text-urgente"
                  }`}
                >
                  Acumulado: {formatCurrency(m.saldoAcumulado)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <span className="tabular-nums text-concluido">↑ {formatCurrency(m.entradas)}</span>
                <span className="tabular-nums text-urgente text-center">↓ {formatCurrency(m.saidas)}</span>
                <span
                  className={`text-right font-semibold tabular-nums ${
                    m.saldoMes >= 0 ? "text-tx" : "text-urgente"
                  }`}
                >
                  {formatCurrency(m.saldoMes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Receitas por grupo" subtitle="Toque para destrinchar" />
        <CategoryBreakdownSection title="Receitas" breakdown={receitasBreakdown} tone="green" compact />
      </Card>

      <Card>
        <CardHeader title="Despesas por grupo" subtitle="Toque para destrinchar" />
        <CategoryBreakdownSection title="Despesas" breakdown={despesasBreakdown} tone="red" compact />
      </Card>
    </div>
  );
}
