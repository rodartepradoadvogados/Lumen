import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, EmptyState, formatCurrency } from "@/components/ui";
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { valorLiquido, isAdiantamentoPayable, isReembolsoReceivable } from "@/lib/financeCalc";

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
    prisma.payable.findMany({
      where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: start, lt: end } },
      include: { category: true, reimbursementReceivable: { select: { id: true } } },
    }),
  ]);

  // status "PAGO" (exato) já exclui A_APURAR sozinho — ver comentário equivalente na página
  // desktop (/financeiro/dre). Adiantamentos a Clientes (despesa CLIENTE com reembolso vinculado)
  // também seguem a mesma lógica de exclusão do resultado normal — ver isAdiantamentoPayable/
  // isReembolsoReceivable em lib/financeCalc.ts.
  let totalAdiantado = 0;
  let totalReembolsado = 0;

  const receitasPorCategoria: Record<string, number> = {};
  for (const r of receivables) {
    if (isReembolsoReceivable(r)) {
      totalReembolsado += r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge);
      continue;
    }
    const key = r.category?.name ?? "Outras Receitas";
    receitasPorCategoria[key] = (receitasPorCategoria[key] ?? 0) + (r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge));
  }
  const despesasPorCategoria: Record<string, number> = {};
  for (const p of payables) {
    if (isAdiantamentoPayable(p)) {
      totalAdiantado += p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge);
      continue;
    }
    const key = p.category?.name ?? "Outras Despesas";
    despesasPorCategoria[key] = (despesasPorCategoria[key] ?? 0) + (p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge));
  }

  const totalReceitas = Object.values(receitasPorCategoria).reduce((s, v) => s + v, 0);
  const totalDespesas = Object.values(despesasPorCategoria).reduce((s, v) => s + v, 0);
  const resultado = totalReceitas - totalDespesas;
  const saldoAdiantamentos = totalAdiantado - totalReembolsado;

  const prevHref = `/m/financeiro/dre?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}`;
  const nextHref = `/m/financeiro/dre?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}`;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-tx">DRE</h1>
        <p className="text-sm text-tx-2">Regime de caixa (pago/recebido)</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={prevHref}
          className="h-9 w-9 rounded-lg bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <p className="font-serif font-bold text-tx text-sm text-center flex-1">
          {MONTHS[month]} {year}
        </p>
        <Link
          href={nextHref}
          className="h-9 w-9 rounded-lg bg-sf border border-regua flex items-center justify-center text-tx-2"
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card>
        <CardHeader title="Receitas" />
        <div className="divide-y divide-regua">
          {Object.keys(receitasPorCategoria).length === 0 && <EmptyState title="Nenhuma receita no período" />}
          {Object.entries(receitasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-4 py-2.5 text-sm gap-3">
              <span className="text-tx-2 truncate">{cat}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 text-sm font-bold bg-sf-apoio">
            <span className="text-tx">Total de Receitas</span>
            <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(totalReceitas)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Despesas" />
        <div className="divide-y divide-regua">
          {Object.keys(despesasPorCategoria).length === 0 && <EmptyState title="Nenhuma despesa no período" />}
          {Object.entries(despesasPorCategoria).map(([cat, val]) => (
            <div key={cat} className="flex justify-between px-4 py-2.5 text-sm gap-3">
              <span className="text-tx-2 truncate">{cat}</span>
              <span className="font-semibold text-urgente shrink-0">{formatCurrency(val)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 text-sm font-bold bg-sf-apoio">
            <span className="text-tx">Total de Despesas</span>
            <span className="text-urgente">{formatCurrency(totalDespesas)}</span>
          </div>
        </div>
      </Card>

      {(totalAdiantado > 0 || totalReembolsado > 0) && (
        <Card className="border border-dashed border-regua">
          <CardHeader title="Adiantamentos a Clientes" subtitle="Informativo — fora do Resultado" />
          <div className="px-4 py-3 flex items-start gap-2 text-xs text-tx-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <p>Despesas do processo pagas por conta do cliente (com reembolso vinculado) não entram na Receita/Despesa nem no Resultado.</p>
          </div>
          <div className="divide-y divide-regua border-t border-regua">
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Adiantado no período</span>
              <span className="font-semibold text-tx">{formatCurrency(totalAdiantado)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Reembolsado no período</span>
              <span className="font-semibold text-tx">{formatCurrency(totalReembolsado)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-tx-2">Saldo do período</span>
              <span className="font-semibold text-tx">{formatCurrency(saldoAdiantamentos)}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 flex justify-between items-center">
        <span className="font-serif font-bold text-tx">Resultado do Período</span>
        <span className={`font-serif font-bold text-xl ${resultado >= 0 ? "text-concluido" : "text-urgente"}`}>
          {formatCurrency(resultado)}
        </span>
      </Card>
    </div>
  );
}
