import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, EmptyState, formatCurrency } from "@/components/ui";
import { valorLiquido } from "@/lib/financeCalc";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";
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

  const [movimentos, overdueReceivables, allReceivables] = await Promise.all([
    // Regime de caixa via FinancePayment — antes filtrava `status: "PAGO"`, o que descartava a
    // baixa PARCIAL e jogava a quitação inteira no mês do último pagamento. Ver
    // lib/caixaMovimentos.ts.
    listarMovimentosCaixa(viewer.officeId, { de: start, ate: end, ateExclusivo: true }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false, dueDate: { lt: now } } }),
    // A_APURAR fora do denominador de inadimplência — é provisão sem valor real ainda (Fase 1),
    // não "a receber" de verdade (nem CANCELADO, que já estava de fora).
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] } }, select: { amount: true, discount: true, surcharge: true } }),
  ]);

  // Adiantamento a Cliente e seu reembolso ficam de fora de Receita/Despesa — são transferência,
  // não resultado. O desktop (/relatorios?secao=financeiro e /financeiro/dre) já excluía; aqui não
  // excluía, e os mesmos 6 meses davam Recebido/Pago diferentes nas duas telas.
  const doResultado = movimentos.filter((m) => !m.ehAdiantamento && !m.ehReembolso);

  const financeMonthly = months.map((m) => {
    const doMes = doResultado.filter((mov) => monthKey(mov.data) === m.key);
    const receita = doMes.filter((mov) => mov.tipo === "ENTRADA").reduce((s, mov) => s + mov.valor, 0);
    const despesa = doMes.filter((mov) => mov.tipo === "SAIDA").reduce((s, mov) => s + mov.valor, 0);
    return { ...m, receita, despesa, saldo: receita - despesa };
  });

  const totalRecebido = financeMonthly.reduce((s, m) => s + m.receita, 0);
  const totalPago = financeMonthly.reduce((s, m) => s + m.despesa, 0);
  const saldoPeriodo = totalRecebido - totalPago;

  const expenseByCat: Record<string, number> = {};
  for (const mov of doResultado) {
    if (mov.tipo !== "SAIDA") continue;
    const key = mov.categoriaNome ?? "Sem categoria";
    expenseByCat[key] = (expenseByCat[key] ?? 0) + mov.valor;
  }
  const topExpenses = Object.entries(expenseByCat)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const inadimplenciaTotal = overdueReceivables.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  const inadimplenciaCount = overdueReceivables.length;
  const totalReceivablesAmount = allReceivables.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  const inadimplenciaRate = totalReceivablesAmount > 0 ? (inadimplenciaTotal / totalReceivablesAmount) * 100 : 0;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Relatórios · Financeiro</h1>
        <p className="text-sm text-tx-2">
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
        <div className="divide-y divide-regua">
          {financeMonthly.map((m) => (
            <div key={m.key} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-tx w-12 shrink-0 capitalize">{m.label}</span>
              <div className="flex-1 text-right leading-tight">
                <p className="text-xs tabular-nums text-concluido">+{formatCurrency(m.receita)}</p>
                <p className="text-xs tabular-nums text-urgente">-{formatCurrency(m.despesa)}</p>
              </div>
              <span
                className={`text-sm font-semibold tabular-nums w-28 text-right shrink-0 ${
                  m.saldo >= 0 ? "text-tx" : "text-urgente"
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
          <div className="divide-y divide-regua">
            {topExpenses.map((e) => (
              <div key={e.label} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm text-tx-2 truncate">{e.label}</span>
                <span className="text-sm font-semibold tabular-nums text-tx shrink-0">{formatCurrency(e.value)}</span>
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
    green: "text-concluido",
    red: "text-urgente",
    gold: "text-concluido",
    navy: "text-tx",
  }[tone];
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-tx-2 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-tx-2 mt-1">{hint}</p>}
    </Card>
  );
}
