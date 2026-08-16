import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate, financeStatusLabel, financeStatusColors } from "@/components/ui";
import { getFilteredPayables, getCurrentMonthRange } from "@/lib/financeQuery";
import { getLeafCategoryOptions } from "@/lib/categories";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import MobileNewPayableForm from "@/components/mobile/MobileNewPayableForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileDespesas({ searchParams }: { searchParams: { tab?: string; from?: string; to?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" ? searchParams.tab : "abertas";
  // Sem De/Até na URL, mostra só o mês corrente (padrão pedido pro app — no site o padrão
  // continua "sem filtro", ver app/(app)/financeiro/despesas/page.tsx) — sem isso a lista do
  // app virava uma rolagem sem fim com todo o histórico de contas.
  const defaultRange = getCurrentMonthRange();
  const from = searchParams.from || defaultRange.from;
  const to = searchParams.to || defaultRange.to;

  const [payables, categories, suppliers, costCenters, bankAccounts, clients] = await Promise.all([
    getFilteredPayables({ tab, from, to }, viewer.officeId),
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // "Pago a" > Cliente (repasse de valor de condenação, devolução de adiantamento etc.) — ver
    // components/mobile/MobileNewPayableForm.tsx.
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Líquido (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = payables.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m/financeiro"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Financeiro
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Despesas</h1>
        <p className="text-sm text-tx-2">
          {payables.length} lançamento(s) · Total {formatCurrency(total)}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabLink label="Contas a Pagar" href={`/m/financeiro/despesas?from=${from}&to=${to}`} active={tab === "abertas"} />
        <TabLink label="Pagas" href={`/m/financeiro/despesas?tab=pagas&from=${from}&to=${to}`} active={tab === "pagas"} />
        <TabLink label="Todas" href={`/m/financeiro/despesas?tab=todas&from=${from}&to=${to}`} active={tab === "todas"} />
      </div>

      <form className="flex items-end gap-2" action="/m/financeiro/despesas">
        {tab !== "abertas" && <input type="hidden" name="tab" value={tab} />}
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium text-tx-2 block mb-1">
            De {tab === "pagas" ? "(pago em)" : "(vencimento)"}
          </label>
          <input type="date" name="from" defaultValue={from} className="mob-fin-input" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium text-tx-2 block mb-1">
            Até {tab === "pagas" ? "(pago em)" : "(vencimento)"}
          </label>
          <input type="date" name="to" defaultValue={to} className="mob-fin-input" />
        </div>
        <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold rounded-lg px-3 py-2 shrink-0 transition-colors">
          Filtrar
        </button>
      </form>

      <MobileNewPayableForm suppliers={suppliers} categories={categories} costCenters={costCenters} clients={clients} />

      <Card>
        {payables.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-regua">
            {payables.map((p) => {
              const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
              const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
              return (
                <div key={p.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-tx">{p.description}</p>
                      <p className="text-xs text-tx-2 mt-0.5">
                        {p.supplier && <span>{p.supplier} · </span>}
                        {p.category?.name}
                        {p.costCenter && <span> · {p.costCenter.name}</span>}
                      </p>
                      {p.status === "PAGO" && (p.paymentMethod || p.paymentReceiptNumber) && (
                        <p className="text-[11px] text-tx-2 mt-0.5">
                          {p.paymentMethod && (paymentMethodLabels[p.paymentMethod] ?? p.paymentMethod)}
                          {p.paymentReceiptNumber && ` · Comprovante: ${p.paymentReceiptNumber}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-tx">{formatCurrency(liquido)}</p>
                      {p.effectiveStatus === "PARCIAL" && (
                        <p className="text-[11px] tabular-nums text-tx-2">saldo {formatCurrency(saldo)}</p>
                      )}
                      <p className="text-xs text-tx-2">
                        {p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Badge color={financeStatusColors[p.effectiveStatus] ?? "slate"}>{financeStatusLabel(p.effectiveStatus)}</Badge>
                  </div>
                  <div className="mt-2">
                    <MobileSettleForm id={p.id} kind="payable" liquido={liquido} alreadyPaid={p.paidSum} status={p.status} bankAccounts={bankAccounts} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <style>{`
        .mob-fin-input { width: 100%; border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.45rem 0.6rem; font-size: 0.8rem; background-color: var(--sf-superficie); color: var(--tx); }
        .mob-fin-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-acao text-acao-tx"
          : "bg-sf text-tx-2 border border-regua"
      }`}
    >
      {label}
    </Link>
  );
}
