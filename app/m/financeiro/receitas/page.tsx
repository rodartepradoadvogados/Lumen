import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate, financeStatusLabel, financeStatusColors } from "@/components/ui";
import { getFilteredReceivables } from "@/lib/financeQuery";
import { getLeafCategoryOptions } from "@/lib/categories";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { PERCENTUAL_BASE_LABELS, RECEIVABLE_KIND_LABELS } from "@/lib/honorarioLancamento";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import MobileNewReceivableForm from "@/components/mobile/MobileNewReceivableForm";
import { ArrowLeft, HandCoins } from "lucide-react";

export const dynamic = "force-dynamic";

const kindLabels = RECEIVABLE_KIND_LABELS;

export default async function MobileReceitas({ searchParams }: { searchParams: { tab?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" || searchParams.tab === "apurar" ? searchParams.tab : "abertas";

  const [receivables, categories, clients, costCenters, bankAccounts] = await Promise.all([
    getFilteredReceivables({ tab }, viewer.officeId),
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Líquido (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = receivables.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-tx">Receitas</h1>
        <p className="text-sm text-tx-2">
          {receivables.length} lançamento(s) · Total {formatCurrency(total)}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabLink label="Contas a Receber" href="/m/financeiro/receitas" active={tab === "abertas"} />
        <TabLink label="Recebidas" href="/m/financeiro/receitas?tab=pagas" active={tab === "pagas"} />
        <TabLink label="A apurar" href="/m/financeiro/receitas?tab=apurar" active={tab === "apurar"} />
        <TabLink label="Todas" href="/m/financeiro/receitas?tab=todas" active={tab === "todas"} />
      </div>

      {/* Mesmo pedido central da Fase 8: lançar honorários (natureza, forma de cobrança,
          parcelamento/recorrência, recebimento) sem precisar do computador — aqui fora de um
          processo específico, por isso pede pra escolher um (ver
          app/m/financeiro/receitas/honorarios/page.tsx). */}
      <Link
        href="/m/financeiro/receitas/honorarios"
        className="w-full flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <HandCoins size={16} /> Lançar Honorários
      </Link>

      <MobileNewReceivableForm clients={clients} categories={categories} costCenters={costCenters} />

      <Card>
        {receivables.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-regua">
            {receivables.map((r) => {
              const isApurar = r.effectiveStatus === "A_APURAR";
              const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
              const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, r.paidSum);
              return (
                <div key={r.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-tx">{r.description}</p>
                      <p className="text-xs text-tx-2 mt-0.5">
                        {r.client && <span>{r.client.name} · </span>}
                        {kindLabels[r.kind] ?? r.kind}
                        {r.category && <span> · {r.category.name}</span>}
                        {r.costCenter && <span> · {r.costCenter.name}</span>}
                        {r.isSuccessPortion && <span> · Êxito</span>}
                      </p>
                      {isApurar && (
                        <p className="text-[11px] text-tx-2 mt-0.5">
                          {r.percentual}% de {PERCENTUAL_BASE_LABELS[r.percentualBase ?? ""] ?? "base não definida"} — a apurar no desfecho
                        </p>
                      )}
                      {r.status === "PAGO" && (r.paymentMethod || r.paymentReceiptNumber) && (
                        <p className="text-[11px] text-tx-2 mt-0.5">
                          {r.paymentMethod && (paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod)}
                          {r.paymentReceiptNumber && ` · Comprovante: ${r.paymentReceiptNumber}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-tx">{isApurar ? "—" : formatCurrency(liquido)}</p>
                      {r.effectiveStatus === "PARCIAL" && (
                        <p className="text-[11px] text-tx-2">saldo {formatCurrency(saldo)}</p>
                      )}
                      <p className="text-xs text-tx-2">
                        {r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Badge color={financeStatusColors[r.effectiveStatus] ?? "slate"}>{financeStatusLabel(r.effectiveStatus)}</Badge>
                  </div>
                  {!isApurar && (
                    <div className="mt-2">
                      <MobileSettleForm id={r.id} kind="receivable" liquido={liquido} alreadyPaid={r.paidSum} status={r.status} bankAccounts={bankAccounts} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
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
