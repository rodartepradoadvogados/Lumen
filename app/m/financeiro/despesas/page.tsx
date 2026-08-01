import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { getFilteredPayables } from "@/lib/financeQuery";
import { getLeafCategoryOptions } from "@/lib/categories";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import MobileNewPayableForm from "@/components/mobile/MobileNewPayableForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", PARCIAL: "amber", CANCELADO: "red" };

export default async function MobileDespesas({ searchParams }: { searchParams: { tab?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" ? searchParams.tab : "abertas";

  const [payables, categories, suppliers, costCenters, bankAccounts] = await Promise.all([
    getFilteredPayables({ tab }, viewer.officeId),
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Líquido (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = payables.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Despesas</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          {payables.length} lançamento(s) · Total {formatCurrency(total)}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabLink label="Contas a Pagar" href="/m/financeiro/despesas" active={tab === "abertas"} />
        <TabLink label="Pagas" href="/m/financeiro/despesas?tab=pagas" active={tab === "pagas"} />
        <TabLink label="Todas" href="/m/financeiro/despesas?tab=todas" active={tab === "todas"} />
      </div>

      <MobileNewPayableForm suppliers={suppliers} categories={categories} costCenters={costCenters} />

      <Card>
        {payables.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {payables.map((p) => {
              const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
              const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, p.paidSum);
              return (
                <div key={p.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{p.description}</p>
                      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                        {p.supplier && <span>{p.supplier} · </span>}
                        {p.category?.name}
                        {p.costCenter && <span> · {p.costCenter.name}</span>}
                      </p>
                      {p.status === "PAGO" && (p.paymentMethod || p.paymentReceiptNumber) && (
                        <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-0.5">
                          {p.paymentMethod && (paymentMethodLabels[p.paymentMethod] ?? p.paymentMethod)}
                          {p.paymentReceiptNumber && ` · Comprovante: ${p.paymentReceiptNumber}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(liquido)}</p>
                      {p.effectiveStatus === "PARCIAL" && (
                        <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">saldo {formatCurrency(saldo)}</p>
                      )}
                      <p className="text-xs text-navy-800/40 dark:text-cream-50/40">
                        {p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Badge color={statusColor[p.effectiveStatus]}>{p.effectiveStatus}</Badge>
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
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-navy-900 text-white dark:bg-white/10 dark:text-cream-50"
          : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10"
      }`}
    >
      {label}
    </Link>
  );
}
