import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import NewReceivableModal from "@/components/NewReceivableModal";
import SettleButton from "@/components/SettleButton";
import Link from "next/link";
import { getLeafCategoryOptions } from "@/lib/categories";

export const dynamic = "force-dynamic";

const statusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

const kindLabels: Record<string, string> = {
  HONORARIOS_CONTRATUAIS: "Honorários Contratuais",
  HONORARIOS_SUCUMBENCIAIS: "Honorários Sucumbenciais",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string; costCenterId?: string };
}) {
  const now = new Date();
  const all = await prisma.receivable.findMany({
    where: {
      dueDate: {
        gte: searchParams.from ? new Date(searchParams.from) : undefined,
        lte: searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : undefined,
      },
      costCenterId: searchParams.costCenterId || undefined,
    },
    include: { client: true, case: true, costCenter: true },
    orderBy: { dueDate: "asc" },
  });

  const normalized = all.map((r) => ({
    ...r,
    effectiveStatus: r.status === "PENDENTE" && r.dueDate < now && !r.noDueDate ? "ATRASADO" : r.status,
  }));

  const filtered = searchParams.status ? normalized.filter((r) => r.effectiveStatus === searchParams.status) : normalized;
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const [categories, cases, clients, costCenters] = await Promise.all([
    getLeafCategoryOptions("RECEITA"),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { ...searchParams, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/financeiro/contas-a-receber${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Financeiro
      </Link>
      <PageHeader
        title="Contas a Receber"
        subtitle={`${filtered.length} lançamento(s) · Total ${formatCurrency(total)}`}
        action={<NewReceivableModal categories={categories} cases={cases.map((c) => ({ id: c.id, name: c.title }))} clients={clients} costCenters={costCenters} />}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href={qs({ status: undefined })} active={!searchParams.status} />
        <FilterLink label="Pendente" href={qs({ status: "PENDENTE" })} active={searchParams.status === "PENDENTE"} />
        <FilterLink label="Atrasado" href={qs({ status: "ATRASADO" })} active={searchParams.status === "ATRASADO"} />
        <FilterLink label="Pago" href={qs({ status: "PAGO" })} active={searchParams.status === "PAGO"} />
      </div>

      <Card className="mb-4">
        <form className="p-4 flex flex-wrap items-end gap-3">
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">De</label>
            <input type="date" name="from" defaultValue={searchParams.from} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Até</label>
            <input type="date" name="to" defaultValue={searchParams.to} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Centro de Custo</label>
            <select name="costCenterId" defaultValue={searchParams.costCenterId} className="fp-input">
              <option value="">Todos</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Filtrar
          </button>
          {(searchParams.from || searchParams.to || searchParams.costCenterId) && (
            <Link href={qs({ from: undefined, to: undefined, costCenterId: undefined })} className="text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2">
              Limpar período/centro
            </Link>
          )}
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {filtered.map((r) => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900">{r.description}</p>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {r.client?.name}
                    {r.case && <span> · {r.case.title}</span>}
                    {r.costCenter && <span> · {r.costCenter.name}</span>}
                    {" · "}
                    {kindLabels[r.kind]}
                    {r.isSuccessPortion && <span> · Êxito</span>}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:contents">
                  <div className="text-left sm:text-right shrink-0 sm:w-28">
                    <p className="text-sm font-semibold text-navy-900">{formatCurrency(r.amount)}</p>
                    <p className="text-xs text-navy-800/40">{r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}</p>
                  </div>
                  <div className="shrink-0 sm:w-24">
                    <Badge color={statusColor[r.effectiveStatus]}>{r.effectiveStatus}</Badge>
                  </div>
                </div>
                <div className="shrink-0">
                  <SettleButton id={r.id} kind="receivable" amount={r.paidAmount ?? r.amount} status={r.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <style>{`
        .fp-input { border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; }
        .fp-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
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
