import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LivroCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO" }, include: { client: true } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: "PAGO" } }),
  ]);

  type Entry = { date: Date; description: string; value: number; type: "entrada" | "saida" };
  const entries: Entry[] = [
    ...receivables.map((r) => ({ date: r.paidDate!, description: `${r.description}${r.client ? ` — ${r.client.name}` : ""}`, value: r.paidAmount ?? r.amount, type: "entrada" as const })),
    ...payables.map((p) => ({ date: p.paidDate!, description: p.description, value: -(p.paidAmount ?? p.amount), type: "saida" as const })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const withBalance = entries.map((e) => {
    running += e.value;
    return { ...e, balance: running };
  });

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
        ← Financeiro
      </Link>
      <PageHeader title="Livro Caixa" subtitle="Extrato cronológico de todas as movimentações efetivadas" />

      <Card>
        {withBalance.length === 0 ? (
          <EmptyState title="Nenhuma movimentação registrada ainda" subtitle="Dê baixa em contas a pagar/receber para elas aparecerem aqui" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide border-b border-navy-800/8 dark:border-white/10">
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Descrição</th>
                  <th className="px-5 py-3 font-semibold text-right">Valor</th>
                  <th className="px-5 py-3 font-semibold text-right">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
                {withBalance.map((e, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5 text-navy-800/60 dark:text-cream-50/60 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-2.5 text-navy-900 dark:text-cream-50">{e.description}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${e.type === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-bordo-400"}`}>
                      {e.type === "entrada" ? "+" : ""}
                      {formatCurrency(e.value)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
