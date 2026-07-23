import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { getFilteredPayables } from "@/lib/financeQuery";
import { getLeafCategoryOptions } from "@/lib/categories";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import MobileNewPayableForm from "@/components/mobile/MobileNewPayableForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

export default async function MobileContasAPagar() {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Mesma query base da página desktop (getFilteredPayables), sem paginação: trazemos
  // todos os pendentes/atrasados + os pagos dos últimos 30 dias, para caber num scroll único.
  const [all, categories, suppliers, costCenters] = await Promise.all([
    getFilteredPayables({}, viewer.officeId),
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  const payables = all.filter(
    (p) => p.effectiveStatus !== "PAGO" || (p.paidDate && p.paidDate >= thirtyDaysAgo)
  );
  const totalPendente = payables
    .filter((p) => p.effectiveStatus !== "PAGO")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Contas a Pagar</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          {payables.length} lançamento(s) · Pendente {formatCurrency(totalPendente)}
        </p>
      </div>

      <MobileNewPayableForm suppliers={suppliers} categories={categories} costCenters={costCenters} />

      <Card>
        {payables.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {payables.map((p) => (
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
                    <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-navy-800/40 dark:text-cream-50/40">
                      {p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge color={statusColor[p.effectiveStatus]}>{p.effectiveStatus}</Badge>
                </div>
                <div className="mt-2">
                  <MobileSettleForm id={p.id} kind="payable" amount={p.paidAmount ?? p.amount} status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
