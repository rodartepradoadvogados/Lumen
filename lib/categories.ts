import { prisma } from "@/lib/prisma";

export async function getLeafCategoryOptions(kind: "RECEITA" | "DESPESA", officeId: string) {
  const all = await prisma.financialCategory.findMany({ where: { kind, officeId }, orderBy: { code: "asc" } });
  return all
    .filter((c) => !all.some((child) => child.parentId === c.id))
    .map((c) => ({ id: c.id, name: `${c.code} ${c.name}` }));
}
