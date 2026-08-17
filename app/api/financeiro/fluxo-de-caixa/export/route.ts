import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { buildCategoryBreakdown, CategoryGroupNode, CategoryBreakdown } from "@/lib/cashFlowGroups";
import { valorLiquido } from "@/lib/financeCalc";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type CategoriaRow = { Categoria: string; Valor: number };

function flattenBreakdown(breakdown: CategoryBreakdown): CategoriaRow[] {
  const rows: CategoriaRow[] = [{ Categoria: "TOTAL", Valor: breakdown.total }];
  const walk = (nodes: CategoryGroupNode[], depth: number) => {
    for (const n of nodes) {
      const prefixo = depth > 0 ? `${"  ".repeat(depth)}└ ` : "";
      rows.push({ Categoria: `${prefixo}${n.code ? `${n.code} ${n.name}` : n.name}`, Valor: n.total });
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  };
  walk(breakdown.groups, 1);
  if (breakdown.uncategorized.entries.length > 0) rows.push({ Categoria: "  └ Sem categoria", Valor: breakdown.uncategorized.total });
  return rows;
}

// Mesma janela e mesma lógica da tela (app/(app)/financeiro/fluxo-de-caixa/page.tsx): projeção por
// vencimento, -3 a +3 meses a partir do mês atual.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.financeAccess) {
    return NextResponse.json({ error: "Você não tem acesso ao módulo Financeiro." }, { status: 403 });
  }

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: user.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, dueDate: { gte: windowStart, lte: windowEnd } } }),
    prisma.receivable.findMany({ where: { officeId: user.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, dueDate: { gte: windowStart, lte: windowEnd } } }),
  ]);

  const months: { key: string; label: string; entradas: number; saidas: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${d.getFullYear()}`, entradas: 0, saidas: 0 });
  }
  for (const r of receivables) {
    const key = `${r.dueDate.getFullYear()}-${r.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.entradas += valorLiquido(r.amount, r.discount, r.surcharge);
  }
  for (const p of payables) {
    const key = `${p.dueDate.getFullYear()}-${p.dueDate.getMonth()}`;
    const m = months.find((mo) => mo.key === key);
    if (m) m.saidas += valorLiquido(p.amount, p.discount, p.surcharge);
  }

  let saldoAcumulado = 0;
  const mensalRows = months.map((m) => {
    const saldoMes = m.entradas - m.saidas;
    saldoAcumulado += saldoMes;
    return { Mês: m.label, Entradas: m.entradas, Saídas: m.saidas, "Saldo do Mês": saldoMes, "Saldo Acumulado": saldoAcumulado };
  });

  const [receitasBreakdown, despesasBreakdown] = await Promise.all([
    buildCategoryBreakdown(
      "RECEITA",
      user.officeId,
      receivables.map((r) => ({ id: r.id, description: r.description, date: r.dueDate, amount: valorLiquido(r.amount, r.discount, r.surcharge), categoryId: r.categoryId }))
    ),
    buildCategoryBreakdown(
      "DESPESA",
      user.officeId,
      payables.map((p) => ({ id: p.id, description: p.description, date: p.dueDate, amount: valorLiquido(p.amount, p.discount, p.surcharge), categoryId: p.categoryId }))
    ),
  ]);

  const workbook = XLSX.utils.book_new();

  const mensalSheet = XLSX.utils.json_to_sheet(mensalRows, { header: ["Mês", "Entradas", "Saídas", "Saldo do Mês", "Saldo Acumulado"] });
  mensalSheet["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, mensalSheet, "Detalhamento Mensal");

  const receitasSheet = XLSX.utils.json_to_sheet(flattenBreakdown(receitasBreakdown), { header: ["Categoria", "Valor"] });
  receitasSheet["!cols"] = [{ wch: 46 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, receitasSheet, "Receitas por Categoria");

  const despesasSheet = XLSX.utils.json_to_sheet(flattenBreakdown(despesasBreakdown), { header: ["Categoria", "Valor"] });
  despesasSheet["!cols"] = [{ wch: 46 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, despesasSheet, "Despesas por Categoria");

  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fluxo-de-caixa-${stamp}.xlsx"`,
    },
  });
}
