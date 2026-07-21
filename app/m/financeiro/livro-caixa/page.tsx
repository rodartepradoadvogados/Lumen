import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Máximo de lançamentos exibidos na lista mobile (mais recentes primeiro). O saldo acumulado
// de cada linha continua correto porque é calculado sobre o histórico completo, antes do corte.
const MAX_ROWS = 60;

// Mesma query/lógica da página desktop (`/financeiro/livro-caixa`): todos os lançamentos já
// liquidados, com saldo acumulado calculado em ordem cronológica — só a ordem de exibição
// muda (mais recente primeiro) e a lista é limitada para caber num scroll mobile razoável.
export default async function MobileLivroCaixa() {
  const viewer = await getCurrentUser();
  if (!(viewer?.isAdmin || viewer?.financeAccess)) notFound();

  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({ where: { status: "PAGO" }, include: { client: true } }),
    prisma.payable.findMany({ where: { status: "PAGO" } }),
  ]);

  type Entry = { date: Date; description: string; value: number; type: "entrada" | "saida" };
  const entries: Entry[] = [
    ...receivables.map((r) => ({
      date: r.paidDate!,
      description: `${r.description}${r.client ? ` — ${r.client.name}` : ""}`,
      value: r.paidAmount ?? r.amount,
      type: "entrada" as const,
    })),
    ...payables.map((p) => ({
      date: p.paidDate!,
      description: p.description,
      value: -(p.paidAmount ?? p.amount),
      type: "saida" as const,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const withBalance = entries.map((e) => {
    running += e.value;
    return { ...e, balance: running };
  });

  const mostRecentFirst = [...withBalance].reverse().slice(0, MAX_ROWS);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Livro Caixa</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          Extrato cronológico das movimentações efetivadas · mais recentes primeiro
        </p>
      </div>

      <Card>
        {mostRecentFirst.length === 0 ? (
          <EmptyState title="Nenhuma movimentação registrada ainda" subtitle="Dê baixa em contas a pagar/receber para elas aparecerem aqui" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {mostRecentFirst.map((e, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy-900 dark:text-cream-50 truncate">{e.description}</p>
                    <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">{formatDate(e.date)}</p>
                  </div>
                  <p className={`text-sm font-semibold shrink-0 ${e.type === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-bordo-400"}`}>
                    {e.type === "entrada" ? "+" : ""}
                    {formatCurrency(e.value)}
                  </p>
                </div>
                <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-1 text-right">
                  Saldo acumulado: <span className="font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(e.balance)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
