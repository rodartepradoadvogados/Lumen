import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";

export const dynamic = "force-dynamic";

// Teto de linhas renderizadas — sem isto, um escritório com anos de uso e milhares de baixas
// registradas faz o Server Component emitir uma <tr> por lançamento desde o início dos tempos,
// crescendo pra sempre (achado A68 da revisão gauntlet). O saldo acumulado de cada linha
// continua correto porque é calculado sobre o histórico completo, antes do corte — só a
// RENDERIZAÇÃO é limitada às mais recentes, mesmo padrão já usado no Livro Caixa mobile
// (app/m/financeiro/livro-caixa/page.tsx, MAX_ROWS = 60).
const MAX_ROWS = 300;

export default async function LivroCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  // Cada FinancePayment vira uma linha própria, na data em que o dinheiro de fato se moveu — é o
  // que faz o recebimento parcial aparecer aqui (antes esta tela filtrava status "PAGO" e a baixa
  // parcial sumia inteira) e o que põe cada parcela de uma quitação no mês certo. Lançamentos
  // legados, baixados antes de FinancePayment existir, entram pela segunda fonte da função.
  // Ver lib/caixaMovimentos.ts.
  const movimentos = await listarMovimentosCaixa(viewer.officeId, { ate: now });

  // O Livro Caixa é extrato puro de movimentação: mostra TUDO que entrou e saiu, inclusive
  // adiantamento a cliente e o reembolso dele (que o DRE separa por não serem resultado) — o
  // dinheiro passou pela conta do escritório, então tem de constar aqui.
  type Entry = { date: Date; description: string; value: number; type: "entrada" | "saida" };
  const entries: Entry[] = movimentos.map((m) => ({
    date: m.data,
    description: `${m.descricao}${m.clienteNome ? ` — ${m.clienteNome}` : ""}`,
    value: m.tipo === "ENTRADA" ? m.valor : -m.valor,
    type: m.tipo === "ENTRADA" ? ("entrada" as const) : ("saida" as const),
  }));

  let running = 0;
  const withBalance = entries.map((e) => {
    running += e.value;
    return { ...e, balance: running };
  });

  const totalCount = withBalance.length;
  const visible = withBalance.slice(-MAX_ROWS);

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
                {visible.map((e, i) => (
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

      {totalCount > visible.length && (
        <p className="text-xs text-tx-2 text-center mt-3">
          Mostrando as {visible.length} movimentações mais recentes de {totalCount}
        </p>
      )}
    </div>
  );
}
