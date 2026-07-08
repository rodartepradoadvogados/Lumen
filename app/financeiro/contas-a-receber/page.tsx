import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import NewReceivableModal from "@/components/NewReceivableModal";
import SettleButton from "@/components/SettleButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

const kindLabels: Record<string, string> = {
  HONORARIOS_CONTRATUAIS: "Honorários Contratuais",
  HONORARIOS_SUCUMBENCIAIS: "Honorários Sucumbenciais",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export default async function ContasAReceberPage({ searchParams }: { searchParams: { status?: string } }) {
  const now = new Date();
  const all = await prisma.receivable.findMany({ include: { client: true, case: true }, orderBy: { dueDate: "asc" } });

  const normalized = all.map((r) => ({
    ...r,
    effectiveStatus: r.status === "PENDENTE" && r.dueDate < now ? "ATRASADO" : r.status,
  }));

  const filtered = searchParams.status ? normalized.filter((r) => r.effectiveStatus === searchParams.status) : normalized;
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const [categories, cases, clients] = await Promise.all([
    prisma.financialCategory.findMany({ where: { kind: "RECEITA" } }),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true } }),
    prisma.client.findMany({ select: { id: true, name: true } }),
  ]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader
        title="Contas a Receber"
        subtitle={`${filtered.length} lançamento(s) · Total ${formatCurrency(total)}`}
        action={<NewReceivableModal categories={categories} cases={cases.map((c) => ({ id: c.id, name: c.title }))} clients={clients} />}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href="/financeiro/contas-a-receber" active={!searchParams.status} />
        <FilterLink label="Pendente" href="/financeiro/contas-a-receber?status=PENDENTE" active={searchParams.status === "PENDENTE"} />
        <FilterLink label="Atrasado" href="/financeiro/contas-a-receber?status=ATRASADO" active={searchParams.status === "ATRASADO"} />
        <FilterLink label="Pago" href="/financeiro/contas-a-receber?status=PAGO" active={searchParams.status === "PAGO"} />
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900">{r.description}</p>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {r.client?.name}
                    {r.case && <span> · {r.case.title}</span>}
                    {" · "}
                    {kindLabels[r.kind]}
                  </p>
                </div>
                <div className="text-right shrink-0 w-28">
                  <p className="text-sm font-semibold text-navy-900">{formatCurrency(r.amount)}</p>
                  <p className="text-xs text-navy-800/40">{formatDate(r.dueDate)}</p>
                </div>
                <div className="shrink-0 w-24">
                  <Badge color={statusColor[r.effectiveStatus]}>{r.effectiveStatus}</Badge>
                </div>
                <div className="shrink-0">
                  <SettleButton id={r.id} kind="receivable" amount={r.paidAmount ?? r.amount} status={r.status} />
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
