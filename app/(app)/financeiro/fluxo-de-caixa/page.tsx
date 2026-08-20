import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, formatCurrency } from "@/components/ui";
import { buildCategoryBreakdown } from "@/lib/cashFlowGroups";
import { CategoryBreakdownSection } from "@/components/CategoryBreakdownTree";
import { valorLiquido } from "@/lib/financeCalc";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function FluxoDeCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  // A_APURAR é excluído explicitamente: é só uma ESTIMATIVA de honorário percentual sem valor
  // real ainda (apurado no desfecho do processo) — somar como entrada prevista infla a projeção,
  // o resultado e o imposto sobre dinheiro que talvez nem exista.
  // noDueDate: false também é explícito — "Sem vencimento definido" grava dueDate como um
  // placeholder técnico (1º do mês seguinte ao cadastro, ver lib/actions/financeiro.ts), nunca
  // atualizado; o resto do produto (listagens, Central de Alertas, Inadimplência) sabe disso e
  // ignora essa data, mas o Fluxo de Caixa agregava por ela direto, inflando um mês arbitrário da
  // projeção com um valor que o usuário declarou não ter data (achado A45 da revisão gauntlet).
  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
  ]);

  const months: { key: string; label: string; entradas: number; saidas: number; year: number; monthIdx: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, entradas: 0, saidas: 0, year: d.getFullYear(), monthIdx: d.getMonth() });
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

  const maxVal = Math.max(...months.map((m) => Math.max(m.entradas, m.saidas)), 1);
  let saldoAcumulado = 0;

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
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Entradas e saídas projetadas por mês (com base nos vencimentos) · 3 meses atrás a 3 meses à frente"
        action={
          <div className="flex items-center gap-2">
            <a
              href="/financeiro/fluxo-de-caixa/imprimir"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
            >
              <Download size={13} /> PDF
            </a>
            <a
              href="/api/financeiro/fluxo-de-caixa/export"
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
            >
              <Download size={13} /> Exportar (.xlsx)
            </a>
          </div>
        }
      />

      <Card className="p-6 mb-6">
        <div className="flex items-end gap-4 h-64">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div className="flex items-end gap-1 h-full w-full justify-center">
                <div
                  className="w-6 bg-concluido"
                  style={{ height: `${(m.entradas / maxVal) * 100}%` }}
                  title={`Entradas: ${formatCurrency(m.entradas)}`}
                />
                <div
                  className="w-6 bg-urgente"
                  style={{ height: `${(m.saidas / maxVal) * 100}%` }}
                  title={`Saídas: ${formatCurrency(m.saidas)}`}
                />
              </div>
              <span className="text-xs font-semibold text-tx-2 mt-1">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 justify-center mt-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-concluido" /> Entradas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-urgente" /> Saídas</span>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Detalhamento mensal" />
        <div className="divide-y divide-regua">
          {months.map((m) => {
            saldoAcumulado += m.entradas - m.saidas;
            return (
              <div key={m.key} className="grid grid-cols-5 gap-3 px-5 py-3 text-sm">
                <span className="font-semibold text-tx">{m.label}</span>
                <span className="text-concluido text-right tabular-nums">{formatCurrency(m.entradas)}</span>
                <span className="text-urgente text-right tabular-nums">{formatCurrency(m.saidas)}</span>
                <span className={`text-right font-semibold tabular-nums ${m.entradas - m.saidas >= 0 ? "text-tx" : "text-urgente"}`}>
                  {formatCurrency(m.entradas - m.saidas)}
                </span>
                <span className={`text-right font-semibold tabular-nums ${saldoAcumulado >= 0 ? "text-concluido" : "text-urgente"}`}>
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
