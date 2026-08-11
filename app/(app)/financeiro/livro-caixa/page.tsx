import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { valorLiquido } from "@/lib/financeCalc";

export const dynamic = "force-dynamic";

export default async function LivroCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { lte: now } }, include: { client: true } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { lte: now } } }),
  ]);

  // status "PAGO" já exclui A_APURAR sozinho (provisão percentual nunca é baixada direto como
  // paga). paidAmount é o valor de fato movimentado; o fallback para amount (registro legado sem
  // paidAmount) passa por valorLiquido para respeitar desconto/acréscimo.
  type Entry = { date: Date; description: string; value: number; type: "entrada" | "saida" };
  const entries: Entry[] = [
    ...receivables.map((r) => ({ date: r.paidDate!, description: `${r.description}${r.client ? ` — ${r.client.name}` : ""}`, value: r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge), type: "entrada" as const })),
    ...payables.map((p) => ({ date: p.paidDate!, description: p.description, value: -(p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge)), type: "saida" as const })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const withBalance = entries.map((e) => {
    running += e.value;
    return { ...e, balance: running };
  });

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
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
                <tr className="text-left text-xs text-tx-2 uppercase tracking-wide border-b border-regua">
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Descrição</th>
                  <th className="px-5 py-3 font-semibold text-right">Valor</th>
                  <th className="px-5 py-3 font-semibold text-right">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {withBalance.map((e, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5 text-tx-2 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-2.5 text-tx">{e.description}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${e.type === "entrada" ? "text-concluido" : "text-urgente"}`}>
                      {e.type === "entrada" ? "+" : ""}
                      {formatCurrency(e.value)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-tx">{formatCurrency(e.balance)}</td>
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
