import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import NewPayableModal from "@/components/NewPayableModal";
import SettleButton from "@/components/SettleButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

export default async function ContasAPagarPage({ searchParams }: { searchParams: { status?: string } }) {
  const now = new Date();
  const all = await prisma.payable.findMany({ include: { category: true, case: true }, orderBy: { dueDate: "asc" } });

  const normalized = all.map((p) => ({
    ...p,
    effectiveStatus: p.status === "PENDENTE" && p.dueDate < now ? "ATRASADO" : p.status,
  }));

  const filtered = searchParams.status ? normalized.filter((p) => p.effectiveStatus === searchParams.status) : normalized;
  const total = filtered.reduce((s, p) => s + p.amount, 0);

  const [categories, cases] = await Promise.all([
    prisma.financialCategory.findMany({ where: { kind: "DESPESA" } }),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader
        title="Contas a Pagar"
        subtitle={`${filtered.length} lançamento(s) · Total ${formatCurrency(total)}`}
        action={<NewPayableModal categories={categories} cases={cases.map((c) => ({ id: c.id, name: c.title }))} />}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href="/financeiro/contas-a-pagar" active={!searchParams.status} />
        <FilterLink label="Pendente" href="/financeiro/contas-a-pagar?status=PENDENTE" active={searchParams.status === "PENDENTE"} />
        <FilterLink label="Atrasado" href="/financeiro/contas-a-pagar?status=ATRASADO" active={searchParams.status === "ATRASADO"} />
        <FilterLink label="Pago" href="/financeiro/contas-a-pagar?status=PAGO" active={searchParams.status === "PAGO"} />
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900">{p.description}</p>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {p.supplier && <span>{p.supplier} · </span>}
                    {p.category?.name}
                    {p.case && <span> · {p.case.title}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0 w-28">
                  <p className="text-sm font-semibold text-navy-900">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-navy-800/40">{formatDate(p.dueDate)}</p>
                </div>
                <div className="shrink-0 w-24">
                  <Badge color={statusColor[p.effectiveStatus]}>{p.effectiveStatus}</Badge>
                </div>
                <div className="shrink-0">
                  <SettleButton id={p.id} kind="payable" amount={p.paidAmount ?? p.amount} status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      {label}
    </Link>
  );
}
