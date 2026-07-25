import { prisma } from "@/lib/prisma";

export type FinanceTab = "abertas" | "pagas" | "todas";

export type FinanceSearchParams = {
  tab?: string;
  from?: string;
  to?: string;
  costCenterId?: string;
  q?: string;
  categoryId?: string;
};

function effective(status: string, dueDate: Date, noDueDate: boolean, now: Date) {
  return status === "PENDENTE" && dueDate < now && !noDueDate ? "ATRASADO" : status;
}

// "abertas" (padrão) = só pendentes/atrasadas — contas a pagar/receber nunca devem se
// confundir com contas já pagas/recebidas. "pagas" isola o que já foi liquidado. "todas"
// não filtra por status (inclui também CANCELADO).
function matchesTab(effectiveStatus: string, tab: FinanceTab) {
  if (tab === "todas") return true;
  if (tab === "pagas") return effectiveStatus === "PAGO";
  return effectiveStatus === "PENDENTE" || effectiveStatus === "ATRASADO";
}

function resolveTab(tab?: string): FinanceTab {
  return tab === "pagas" || tab === "todas" ? tab : "abertas";
}

export async function getFilteredPayables(sp: FinanceSearchParams, officeId: string) {
  const now = new Date();
  const tab = resolveTab(sp.tab);
  const all = await prisma.payable.findMany({
    where: {
      officeId,
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
    .filter((p) => matchesTab(p.effectiveStatus, tab))
    .filter((p) => !q || p.description.toLowerCase().includes(q) || (p.supplier || "").toLowerCase().includes(q));
}

export async function getFilteredReceivables(sp: FinanceSearchParams, officeId: string) {
  const now = new Date();
  const tab = resolveTab(sp.tab);
  const all = await prisma.receivable.findMany({
    where: {
      officeId,
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
    .filter((r) => matchesTab(r.effectiveStatus, tab))
    .filter((r) => !q || r.description.toLowerCase().includes(q) || (r.client?.name || "").toLowerCase().includes(q));
}
