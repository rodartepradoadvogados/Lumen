import { prisma } from "@/lib/prisma";

export type FinanceSearchParams = {
  status?: string;
  from?: string;
  to?: string;
  costCenterId?: string;
  q?: string;
  categoryId?: string;
};

function effective(status: string, dueDate: Date, noDueDate: boolean, now: Date) {
  return status === "PENDENTE" && dueDate < now && !noDueDate ? "ATRASADO" : status;
}

export async function getFilteredPayables(sp: FinanceSearchParams) {
  const now = new Date();
  const all = await prisma.payable.findMany({
    where: {
      dueDate: {
        gte: sp.from ? new Date(sp.from) : undefined,
        lte: sp.to ? new Date(`${sp.to}T23:59:59`) : undefined,
      },
      costCenterId: sp.costCenterId || undefined,
      categoryId: sp.categoryId || undefined,
    },
    include: { category: true, case: true, costCenter: true },
    orderBy: { dueDate: "asc" },
  });
  const q = (sp.q || "").trim().toLowerCase();
  return all
    .map((p) => ({ ...p, effectiveStatus: effective(p.status, p.dueDate, p.noDueDate, now) }))
    .filter((p) => !sp.status || p.effectiveStatus === sp.status)
    .filter((p) => !q || p.description.toLowerCase().includes(q) || (p.supplier || "").toLowerCase().includes(q));
}

export async function getFilteredReceivables(sp: FinanceSearchParams) {
  const now = new Date();
  const all = await prisma.receivable.findMany({
    where: {
      dueDate: {
        gte: sp.from ? new Date(sp.from) : undefined,
        lte: sp.to ? new Date(`${sp.to}T23:59:59`) : undefined,
      },
      costCenterId: sp.costCenterId || undefined,
      categoryId: sp.categoryId || undefined,
    },
    include: { client: true, case: true, costCenter: true, category: true },
    orderBy: { dueDate: "asc" },
  });
  const q = (sp.q || "").trim().toLowerCase();
  return all
    .map((r) => ({ ...r, effectiveStatus: effective(r.status, r.dueDate, r.noDueDate, now) }))
    .filter((r) => !sp.status || r.effectiveStatus === sp.status)
    .filter((r) => !q || r.description.toLowerCase().includes(q) || (r.client?.name || "").toLowerCase().includes(q));
}
