import { prisma } from "@/lib/prisma";

export type CashFlowEntry = {
  id: string;
  description: string;
  date: Date;
  amount: number;
  categoryId: string | null;
};

export type CategoryGroupNode = {
  id: string;
  code: string;
  name: string;
  total: number;
  children: CategoryGroupNode[];
  entries: CashFlowEntry[];
};

export type CategoryBreakdown = {
  total: number;
  groups: CategoryGroupNode[];
  uncategorized: { total: number; entries: CashFlowEntry[] };
};

// Agrega lançamentos (Payable/Receivable já convertidos em CashFlowEntry) na árvore do plano
// de contas (FinancialCategory, auto-referenciada por parentId, escopada por officeId). Cada
// lançamento sempre está vinculado a uma categoria-folha (ver lib/categories.ts); os totais dos
// nós intermediários e da raiz são somados de baixo para cima a partir dessas folhas.
export async function buildCategoryBreakdown(kind: "RECEITA" | "DESPESA", officeId: string, entries: CashFlowEntry[]): Promise<CategoryBreakdown> {
  const categories = await prisma.financialCategory.findMany({ where: { kind, officeId }, orderBy: { code: "asc" } });

  const childrenOf = new Map<string, typeof categories>();
  const roots: typeof categories = [];
  for (const c of categories) {
    if (c.parentId) {
      if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, []);
      childrenOf.get(c.parentId)!.push(c);
    } else {
      roots.push(c);
    }
  }

  const entriesByCategory = new Map<string, CashFlowEntry[]>();
  const uncategorizedEntries: CashFlowEntry[] = [];
  for (const e of entries) {
    if (!e.categoryId) {
      uncategorizedEntries.push(e);
      continue;
    }
    if (!entriesByCategory.has(e.categoryId)) entriesByCategory.set(e.categoryId, []);
    entriesByCategory.get(e.categoryId)!.push(e);
  }

  function build(cat: (typeof categories)[number]): CategoryGroupNode {
    const childCats = childrenOf.get(cat.id) ?? [];
    const children = childCats.map(build);
    const ownEntries = (entriesByCategory.get(cat.id) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
    const total = children.reduce((s, c) => s + c.total, 0) + ownEntries.reduce((s, e) => s + e.amount, 0);
    return { id: cat.id, code: cat.code, name: cat.name, total, children, entries: ownEntries };
  }

  const groups = roots.map(build);
  const uncategorizedTotal = uncategorizedEntries.reduce((s, e) => s + e.amount, 0);

  return {
    total: groups.reduce((s, g) => s + g.total, 0) + uncategorizedTotal,
    groups,
    uncategorized: { total: uncategorizedTotal, entries: uncategorizedEntries },
  };
}

// "Ocultar categorias vazias" (DRE Gerencial) — remove recursivamente todo nó com total zero,
// inclusive um grupo que só existe porque tem SUBgrupos com lançamento (aí o total não é zero,
// então sobrevive; só os ramos realmente vazios em ponta a ponta somem). Pura, sem tocar em
// `CategoryBreakdown.total`/`.uncategorized` — o botão é só um filtro de exibição da árvore.
export function filtrarGruposVazios(nodes: CategoryGroupNode[]): CategoryGroupNode[] {
  const result: CategoryGroupNode[] = [];
  for (const n of nodes) {
    const children = filtrarGruposVazios(n.children);
    if (n.total === 0 && children.length === 0) continue;
    result.push(children.length === n.children.length ? n : { ...n, children });
  }
  return result;
}
