import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePlatformAccess } from "@/lib/platformMember";
import { listTenantOffices } from "@/lib/actions/painelMestre";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/components/ui";
import { LumenPanel, LumenPanelHeader, LumenStat } from "@/components/painelMestre/LumenUi";
import PlatformExpenseModal, { DeletePlatformExpenseButton } from "@/components/painelMestre/PlatformExpenseModal";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function competenciaAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseCompetencia(mes: string): { year: number; month: number } {
  const [y, m] = mes.split("-").map((v) => parseInt(v, 10));
  return { year: y, month: m - 1 };
}

function shiftCompetencia(mes: string, deltaMonths: number): string {
  const { year, month } = parseCompetencia(mes);
  const d = new Date(year, month + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelCompetencia(mes: string): string {
  const { year, month } = parseCompetencia(mes);
  return `${MONTHS[month] ?? mes} ${year}`;
}

export default async function FinanceiroLumenPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  await requirePlatformAccess();

  const mesFoco = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : competenciaAtual();
  const mesAnterior = shiftCompetencia(mesFoco, -1);

  const [offices, accounts, expenses, expensesMesAnterior] = await Promise.all([
    listTenantOffices(),
    prisma.platformAccount.findMany({ where: { kind: "DESPESA" }, orderBy: { name: "asc" } }),
    prisma.platformExpense.findMany({ where: { competencia: mesFoco }, include: { account: true }, orderBy: { createdAt: "desc" } }),
    // Só a soma do mês anterior, pra dar sentido de tendência ao MRR/margem (pedido da reforma:
    // "cards mais fortes, talvez um gráfico de tendência" — decisão do dono do projeto foi só
    // polimento visual, sem sub-relatório novo tipo DRE/Fluxo de Caixa, então a comparação fica
    // aqui mesmo, sem virar página própria).
    prisma.platformExpense.aggregate({ where: { competencia: mesAnterior }, _sum: { amount: true } }),
  ]);

  // Mesma fórmula de MRR usada no Cockpit (app/painel-mestre/page.tsx) — escritórios-cliente
  // (não internos) com status ATIVA, somando monthlyFee. Não recalcular a partir de
  // Subscription (leitura ainda não migrada, ver comentário em prisma/schema.prisma).
  const clientes = offices.filter((o) => !o.isInternal);
  const ativos = clientes.filter((o) => o.status === "ATIVA");
  const mrr = ativos.reduce((sum, o) => sum + (o.monthlyFee ?? 0), 0);

  const despesasDoMes = expenses.reduce((sum, e) => sum + e.amount, 0);
  const margem = mrr - despesasDoMes;

  // MRR não tem histórico por mês (Office.monthlyFee é o valor ATUAL, não um snapshot) — a
  // tendência de margem usa o MRR de hoje contra a despesa de cada mês, então ela reflete a
  // variação de DESPESA, não uma mudança real de receita passada. "Margem estimada" já avisa que
  // é aproximação; a variação segue a mesma lógica.
  const despesasMesAnterior = expensesMesAnterior._sum.amount ?? 0;
  const margemMesAnterior = mrr - despesasMesAnterior;
  const margemVariacao = margemMesAnterior !== 0 ? ((margem - margemMesAnterior) / Math.abs(margemMesAnterior)) * 100 : null;

  const prevHref = `/painel-mestre/financeiro?mes=${mesAnterior}`;
  const nextHref = `/painel-mestre/financeiro?mes=${shiftCompetencia(mesFoco, 1)}`;

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, group: a.group }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-tx">Financeiro Lúmen</h1>
        <p className="text-sm text-tx-2 mt-1">Receita (MRR) e despesas da própria empresa Lúmen</p>
      </div>

      <LumenPanel>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-regua">
          <LumenStat label="MRR" value={formatCurrency(mrr)} />
          <LumenStat label="Despesas do mês" value={formatCurrency(despesasDoMes)} />
          <div className="p-4">
            <p className="text-[10px] font-semibold text-tx-3 uppercase tracking-wide mb-1">Margem estimada</p>
            <p className={`font-mono text-2xl font-semibold tabular-nums ${margem >= 0 ? "text-concluido" : "text-urgente"}`}>
              {formatCurrency(margem)}
            </p>
            {margemVariacao !== null && (
              <p className={`text-[11px] font-semibold mt-1 ${margemVariacao >= 0 ? "text-concluido" : "text-urgente"}`}>
                {margemVariacao >= 0 ? "↑" : "↓"} {Math.abs(margemVariacao).toFixed(0)}% vs. {labelCompetencia(mesAnterior)}
              </p>
            )}
          </div>
        </div>
      </LumenPanel>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Link href={prevHref} className="p-1.5 hover:bg-sf-apoio text-tx-2 rounded-sm">
            <ChevronLeft size={18} />
          </Link>
          <span className="text-sm font-semibold text-tx px-2 min-w-[9rem] text-center">{labelCompetencia(mesFoco)}</span>
          <Link href={nextHref} className="p-1.5 hover:bg-sf-apoio text-tx-2 rounded-sm">
            <ChevronRight size={18} />
          </Link>
        </div>
        <PlatformExpenseModal mode="create" accounts={accountOptions} competenciaFoco={mesFoco} />
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Despesas do mês" subtitle={`${expenses.length} lançamento(s) em ${labelCompetencia(mesFoco)}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-tx-3 uppercase tracking-wide border-b border-regua">
                <th className="px-5 py-2.5 font-semibold">Conta</th>
                <th className="px-3 py-2.5 font-semibold">Descrição</th>
                <th className="px-3 py-2.5 font-semibold">Fornecedor</th>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Pago em</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3">
                    <span className="text-tx font-medium">{e.account.name}</span>
                    {e.account.group && <span className="block text-[11px] text-tx-3">{e.account.group}</span>}
                  </td>
                  <td className="px-3 py-3 text-tx-2">{e.description}</td>
                  <td className="px-3 py-3 text-tx-2">{e.supplier || "—"}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-tx">{formatCurrency(e.amount)}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-tx-2">{e.paidAt ? formatDate(e.paidAt) : "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <PlatformExpenseModal
                        mode="edit"
                        accounts={accountOptions}
                        expense={{
                          id: e.id,
                          accountId: e.accountId,
                          description: e.description,
                          amount: e.amount,
                          competencia: e.competencia,
                          paidAt: e.paidAt ? e.paidAt.toISOString().slice(0, 10) : null,
                          supplier: e.supplier,
                          notes: e.notes,
                        }}
                      />
                      <DeletePlatformExpenseButton id={e.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-tx-3 text-sm">
                    Nenhuma despesa lançada em {labelCompetencia(mesFoco)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
    </div>
  );
}
