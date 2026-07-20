import { prisma } from "@/lib/prisma";
import { PageHeader, Card, formatCurrency } from "@/components/ui";
import NewReceivableModal from "@/components/NewReceivableModal";
import ReceivablesList from "@/components/ReceivablesList";
import Link from "next/link";
import { Download } from "lucide-react";
import { getLeafCategoryOptions } from "@/lib/categories";
import { getFilteredReceivables } from "@/lib/financeQuery";

export const dynamic = "force-dynamic";

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string; costCenterId?: string; q?: string; categoryId?: string };
}) {
  const filtered = await getFilteredReceivables(searchParams);
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const [categories, cases, clients, costCenters] = await Promise.all([
    getLeafCategoryOptions("RECEITA"),
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
  ]);

  const exportHref = (() => {
    const params = new URLSearchParams();
    Object.entries({ ...searchParams, tipo: "receber" }).forEach(([k, v]) => v && params.set(k, v));
    return `/api/financeiro/export?${params.toString()}`;
  })();

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
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Buscar</label>
            <input type="text" name="q" defaultValue={searchParams.q} placeholder="Descrição ou cliente" className="fp-input w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Categoria</label>
            <select name="categoryId" defaultValue={searchParams.categoryId} className="fp-input">
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
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
          <a
            href={exportHref}
            className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5"
          >
            <Download size={15} /> Exportar .xlsx
          </a>
          {(searchParams.from || searchParams.to || searchParams.costCenterId || searchParams.q || searchParams.categoryId) && (
            <Link href={qs({ from: undefined, to: undefined, costCenterId: undefined, q: undefined, categoryId: undefined })} className="text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2">
              Limpar filtros
            </Link>
          )}
        </form>
      </Card>

      <Card>
        <ReceivablesList
          receivables={filtered.map((r) => ({
            id: r.id,
            description: r.description,
            amount: r.amount,
            dueDate: r.dueDate.toISOString(),
            noDueDate: r.noDueDate,
            status: r.status,
            effectiveStatus: r.effectiveStatus,
            paidAmount: r.paidAmount,
            paymentReceiptNumber: r.paymentReceiptNumber,
            paymentMethod: r.paymentMethod,
            kind: r.kind,
            isSuccessPortion: r.isSuccessPortion,
            categoryId: r.categoryId,
            costCenterId: r.costCenterId,
            clientId: r.clientId,
            caseId: r.caseId,
            category: r.category ? { name: r.category.name } : null,
            costCenter: r.costCenter ? { name: r.costCenter.name } : null,
            case: r.case ? { title: r.case.title } : null,
            client: r.client ? { name: r.client.name } : null,
          }))}
          categories={categories}
          cases={cases.map((c) => ({ id: c.id, name: c.title }))}
          clients={clients}
          costCenters={costCenters}
        />
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
