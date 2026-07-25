import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { getFilteredReceivables } from "@/lib/financeQuery";
import { getLeafCategoryOptions } from "@/lib/categories";
import { paymentMethodLabels } from "@/lib/paymentMethods";
import MobileSettleForm from "@/components/mobile/MobileSettleForm";
import MobileNewReceivableForm from "@/components/mobile/MobileNewReceivableForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

const kindLabels: Record<string, string> = {
  HONORARIOS_CONTRATUAIS: "Honorários Contratuais",
  HONORARIOS_SUCUMBENCIAIS: "Honorários Sucumbenciais",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export default async function MobileReceitas({ searchParams }: { searchParams: { tab?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" ? searchParams.tab : "abertas";

  const [receivables, categories, clients, costCenters] = await Promise.all([
    getFilteredReceivables({ tab }, viewer.officeId),
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  const total = receivables.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Receitas</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          {receivables.length} lançamento(s) · Total {formatCurrency(total)}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabLink label="Contas a Receber" href="/m/financeiro/receitas" active={tab === "abertas"} />
        <TabLink label="Recebidas" href="/m/financeiro/receitas?tab=pagas" active={tab === "pagas"} />
        <TabLink label="Todas" href="/m/financeiro/receitas?tab=todas" active={tab === "todas"} />
      </div>

      <MobileNewReceivableForm clients={clients} categories={categories} costCenters={costCenters} />

      <Card>
        {receivables.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {receivables.map((r) => (
              <div key={r.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{r.description}</p>
                    <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                      {r.client && <span>{r.client.name} · </span>}
                      {kindLabels[r.kind] ?? r.kind}
                      {r.category && <span> · {r.category.name}</span>}
                      {r.costCenter && <span> · {r.costCenter.name}</span>}
                      {r.isSuccessPortion && <span> · Êxito</span>}
                    </p>
                    {r.status === "PAGO" && (r.paymentMethod || r.paymentReceiptNumber) && (
                      <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-0.5">
                        {r.paymentMethod && (paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod)}
                        {r.paymentReceiptNumber && ` · Comprovante: ${r.paymentReceiptNumber}`}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(r.amount)}</p>
                    <p className="text-xs text-navy-800/40 dark:text-cream-50/40">
                      {r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge color={statusColor[r.effectiveStatus]}>{r.effectiveStatus}</Badge>
                </div>
                <div className="mt-2">
                  <MobileSettleForm id={r.id} kind="receivable" amount={r.paidAmount ?? r.amount} status={r.status} />
                </div>
              </div>
            ))}
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
