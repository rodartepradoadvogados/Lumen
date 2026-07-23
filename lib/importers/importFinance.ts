import { prisma } from "@/lib/prisma";
import { col, parseBrDate, parseBrCurrency, norm, Row } from "@/lib/importers/parse";
import type { ImportResult } from "@/lib/importers/importCore";

async function findOrCreateClient(name: string, cache: Map<string, string>, officeId: string) {
  const key = norm(name);
  if (cache.has(key)) return cache.get(key)!;
  const existing = await prisma.client.findFirst({ where: { officeId, name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.client.create({ data: { officeId, name, type: "PJ" } });
  cache.set(key, created.id);
  return created.id;
}

async function findOrCreateCostCenter(name: string, cache: Map<string, string>, officeId: string) {
  const key = norm(name);
  if (cache.has(key)) return cache.get(key)!;
  const existing = await prisma.costCenter.findFirst({ where: { officeId, name: { equals: name, mode: "insensitive" } } });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await prisma.costCenter.create({ data: { officeId, name } });
  cache.set(key, created.id);
  return created.id;
}

async function findOrCreateCategory(name: string, kind: "RECEITA" | "DESPESA", cache: Map<string, string>, officeId: string) {
  const key = `${kind}:${norm(name)}`;
  if (cache.has(key)) return cache.get(key)!;
  const all = await prisma.financialCategory.findMany({ where: { officeId, kind } });
  const found = all.find((c) => norm(c.name) === norm(name));
  if (found) {
    cache.set(key, found.id);
    return found.id;
  }
  const topCount = await prisma.financialCategory.count({ where: { officeId, parentId: null, kind } });
  const created = await prisma.financialCategory.create({
    data: { officeId, name, kind, code: `${kind === "RECEITA" ? "1" : "2"}.${topCount + 1}` },
  });
  cache.set(key, created.id);
  return created.id;
}

export async function importFinanceCore(rows: Row[], officeId: string): Promise<ImportResult> {
  const cases = await prisma.case.findMany({ where: { officeId }, select: { id: true, title: true } });
  const clientCache = new Map<string, string>();
  const costCenterCache = new Map<string, string>();
  const categoryCache = new Map<string, string>();

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    try {
      const tipo = col(row, "Tipo");
      const dueDate = parseBrDate(col(row, "Data"));
      const rawAmount = parseBrCurrency(col(row, "Valor"));
      if (!dueDate || rawAmount === null) {
        skipped++;
        continue;
      }
      const amount = Math.abs(rawAmount);
      const description = col(row, "Descricao", "Descrição") || "Lançamento";
      const categoriaName = col(row, "Categoria");
      const centroCustoName = col(row, "Centro de custo");
      const status = col(row, "Status");

      const caseTitle = col(row, "Caso");
      let caseId: string | null = null;
      if (caseTitle) {
        const nt = norm(caseTitle);
        const match = cases.find((c) => norm(c.title) === nt) || cases.find((c) => norm(c.title).includes(nt) || nt.includes(norm(c.title)));
        caseId = match?.id ?? null;
      }

      const costCenterId = centroCustoName ? await findOrCreateCostCenter(centroCustoName, costCenterCache, officeId) : null;

      const isReceita = tipo === "Entrada" || tipo === "Fatura";
      const categoryId = categoriaName
        ? await findOrCreateCategory(categoriaName, isReceita ? "RECEITA" : "DESPESA", categoryCache, officeId)
        : null;

      const isSettled = /pago|recebid/i.test(status);

      if (isReceita) {
        const clientName = col(row, "Cliente") || col(row, "Pago para / Recebido de");
        const clientId = clientName ? await findOrCreateClient(clientName, clientCache, officeId) : null;
        await prisma.receivable.create({
          data: {
            officeId,
            description,
            amount,
            dueDate,
            status: isSettled ? "PAGO" : dueDate < new Date() ? "ATRASADO" : "PENDENTE",
            paidDate: isSettled ? dueDate : null,
            paidAmount: isSettled ? amount : null,
            categoryId,
            costCenterId,
            clientId,
            caseId,
            notes: `Responsável: ${col(row, "Responsavel", "Responsável") || "—"} · Importado de Financeiro.xlsx`,
          },
        });
      } else {
        await prisma.payable.create({
          data: {
            officeId,
            description,
            amount,
            dueDate,
            supplier: col(row, "Pago para / Recebido de") || null,
            status: isSettled ? "PAGO" : dueDate < new Date() ? "ATRASADO" : "PENDENTE",
            paidDate: isSettled ? dueDate : null,
            paidAmount: isSettled ? amount : null,
            categoryId,
            costCenterId,
            caseId,
            notes: `Responsável: ${col(row, "Responsavel", "Responsável") || "—"} · Importado de Financeiro.xlsx`,
          },
        });
      }
      created++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      errors.push(`Linha ${i + 2}: ${message}`);
    }
  }

  return { created, skipped, errors };
}
