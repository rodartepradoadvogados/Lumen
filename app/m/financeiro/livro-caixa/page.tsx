import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";

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

  const now = new Date();
  // Mesma fonte da página desktop (/financeiro/livro-caixa): lê FinancePayment, então recebimento
  // parcial aparece e cada pagamento cai na sua própria data. Ver lib/caixaMovimentos.ts.
  const movimentos = await listarMovimentosCaixa(viewer.officeId, { ate: now });

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

  const mostRecentFirst = [...withBalance].reverse().slice(0, MAX_ROWS);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Livro Caixa</h1>
        <p className="text-sm text-tx-2">
          Extrato cronológico das movimentações efetivadas · mais recentes primeiro
        </p>
      </div>

      <Card>
        {mostRecentFirst.length === 0 ? (
          <EmptyState title="Nenhuma movimentação registrada ainda" subtitle="Dê baixa em contas a pagar/receber para elas aparecerem aqui" />
        ) : (
          <div className="divide-y divide-regua">
            {mostRecentFirst.map((e, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-tx truncate">{e.description}</p>
                    <p className="text-xs text-tx-2 mt-0.5">{formatDate(e.date)}</p>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums shrink-0 ${e.type === "entrada" ? "text-concluido" : "text-urgente"}`}>
                    {e.type === "entrada" ? "+" : ""}
                    {formatCurrency(e.value)}
                  </p>
                </div>
                <p className="text-xs text-tx-2 mt-1 text-right">
                  Saldo acumulado: <span className="font-semibold tabular-nums text-tx">{formatCurrency(e.balance)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
