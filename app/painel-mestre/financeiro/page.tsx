import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
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
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const mesFoco = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : competenciaAtual();

  const [offices, accounts, expenses] = await Promise.all([
    listTenantOffices(),
    prisma.platformAccount.findMany({ where: { kind: "DESPESA" }, orderBy: { name: "asc" } }),
    prisma.platformExpense.findMany({ where: { competencia: mesFoco }, include: { account: true }, orderBy: { createdAt: "desc" } }),
  ]);

  // Mesma fórmula de MRR usada no Cockpit (app/painel-mestre/page.tsx) — escritórios-cliente
  // (não internos) com status ATIVA, somando monthlyFee. Não recalcular a partir de
  // Subscription (leitura ainda não migrada, ver comentário em prisma/schema.prisma).
  const clientes = offices.filter((o) => !o.isInternal);
  const ativos = clientes.filter((o) => o.status === "ATIVA");
  const mrr = ativos.reduce((sum, o) => sum + (o.monthlyFee ?? 0), 0);

  const despesasDoMes = expenses.reduce((sum, e) => sum + e.amount, 0);
  const margem = mrr - despesasDoMes;

  const prevHref = `/painel-mestre/financeiro?mes=${shiftCompetencia(mesFoco, -1)}`;
  const nextHref = `/painel-mestre/financeiro?mes=${shiftCompetencia(mesFoco, 1)}`;

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, group: a.group }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Financeiro Lúmen</h1>
        <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">Receita (MRR) e despesas da própria empresa Lúmen</p>
      </div>

      <LumenPanel>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <LumenStat label="MRR" value={formatCurrency(mrr)} />
          <LumenStat label="Despesas do mês" value={formatCurrency(despesasDoMes)} />
          <LumenStat label="Margem estimada" value={formatCurrency(margem)} tone={margem >= 0 ? "ok" : "risk"} />
        </div>
      </LumenPanel>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Link href={prevHref} className="p-1.5 rounded-lg hover:bg-white/5 text-cream-50/70">
            <ChevronLeft size={18} />
          </Link>
          <span className="text-sm font-semibold text-cream-50 px-2 min-w-[9rem] text-center">{labelCompetencia(mesFoco)}</span>
          <Link href={nextHref} className="p-1.5 rounded-lg hover:bg-white/5 text-cream-50/70">
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
              <tr className="text-left text-[10px] font-semibold text-cream-50/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Conta</th>
                <th className="px-3 py-2.5 font-semibold">Descrição</th>
                <th className="px-3 py-2.5 font-semibold">Fornecedor</th>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Pago em</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3">
                    <span className="text-cream-50 font-medium">{e.account.name}</span>
                    {e.account.group && <span className="block text-[11px] text-cream-50/40">{e.account.group}</span>}
                  </td>
                  <td className="px-3 py-3 text-cream-50/80">{e.description}</td>
                  <td className="px-3 py-3 text-cream-50/70">{e.supplier || "—"}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-cream-50">{formatCurrency(e.amount)}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-cream-50/70">{e.paidAt ? formatDate(e.paidAt) : "—"}</td>
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
                  <td colSpan={6} className="px-5 py-8 text-center text-cream-50/40 text-sm">
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
