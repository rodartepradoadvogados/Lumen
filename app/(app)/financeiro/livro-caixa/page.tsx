import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { extratoComSaldo } from "@/lib/caixaMovimentos";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

// Teto de linhas renderizadas SEM filtro de data — sem isto, um escritório com anos de uso e
// milhares de baixas registradas faz o Server Component emitir uma <tr> por lançamento desde o
// início dos tempos, crescendo pra sempre (achado A68 da revisão gauntlet). Com filtro de data
// aplicado (o usuário deliberadamente encolheu a janela), mostra tudo dentro dela — MAX_ROWS_ABERTO
// é só uma rede de segurança generosa, não um corte de exibição normal. O saldo acumulado de cada
// linha continua correto porque é calculado sobre o histórico completo, antes do corte — ver
// lib/caixaMovimentos.ts:extratoComSaldo.
const MAX_ROWS_SEM_FILTRO = 300;
const MAX_ROWS_COM_FILTRO = 3000;

export default async function LivroCaixaPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const de = searchParams.from ? new Date(searchParams.from) : undefined;
  const ate = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : new Date();
  const temFiltro = Boolean(de);

  const todas = await extratoComSaldo(viewer.officeId, { de, ate });
  const maxRows = temFiltro ? MAX_ROWS_COM_FILTRO : MAX_ROWS_SEM_FILTRO;
  const visible = todas.slice(-maxRows);

  const exportParams = new URLSearchParams();
  if (searchParams.from) exportParams.set("from", searchParams.from);
  if (searchParams.to) exportParams.set("to", searchParams.to);
  const exportHref = `/api/financeiro/livro-caixa/export?${exportParams.toString()}`;
  const printHref = `/financeiro/livro-caixa/imprimir?${exportParams.toString()}`;

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader title="Livro Caixa" subtitle="Extrato cronológico de todas as movimentações efetivadas" />

      <Card className="mb-5">
        <form className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">De (opcional)</label>
            <input type="date" name="from" defaultValue={searchParams.from} className="lc-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Até</label>
            <input type="date" name="to" defaultValue={searchParams.to} className="lc-input" />
          </div>
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 transition-colors">
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/financeiro/livro-caixa" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx px-2">
              Limpar filtro
            </Link>
          )}
          <a
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
          >
            <Download size={13} /> PDF
          </a>
          <a
            href={exportHref}
            className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua-forte px-3 py-2 transition-colors"
          >
            <Download size={13} /> Exportar (.xlsx)
          </a>
        </form>
      </Card>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            title="Nenhuma movimentação registrada"
            subtitle={temFiltro ? "Nada nesse período — tente ampliar o intervalo." : "Dê baixa em contas a pagar/receber para elas aparecerem aqui"}
          />
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
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2.5 text-tx-2 whitespace-nowrap">{formatDate(e.data)}</td>
                    <td className="px-5 py-2.5 text-tx">{e.descricao}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${e.tipo === "entrada" ? "text-concluido" : "text-urgente"}`}>
                      {e.tipo === "entrada" ? "+" : ""}
                      {formatCurrency(e.valor)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-tx">{formatCurrency(e.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {todas.length > visible.length && (
        <p className="text-xs text-tx-2 text-center mt-3">
          Mostrando as {visible.length} movimentações mais recentes de {todas.length} — estreite o período para ver tudo.
        </p>
      )}
      <style>{`
        .lc-input { border: 1px solid var(--regua-forte); padding: 0.45rem 0.65rem; font-size: 0.8rem; background-color: var(--sf); color: var(--tx); }
        .lc-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px var(--marca-bg); }
      `}</style>
    </div>
  );
}
