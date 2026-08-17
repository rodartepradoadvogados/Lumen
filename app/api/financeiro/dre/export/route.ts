import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/currentUser";
import { calcularDre, periodoAnterior, variacaoPercentual, DrePeriodo } from "@/lib/dreCalculo";
import type { CategoryGroupNode, CategoryBreakdown } from "@/lib/cashFlowGroups";

export const dynamic = "force-dynamic";

type Row = { Linha: string; Valor: number | string; "% Receita": string; "Período Anterior": number | string; "Variação": string };

function pctLabel(valor: number, base: number): string {
  return base ? `${((valor / base) * 100).toFixed(1)}%` : "—";
}

function variacaoLabel(atual: number, anterior?: number): string {
  if (anterior === undefined) return "—";
  const v = variacaoPercentual(atual, anterior);
  return v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function flattenTotals(nodes: CategoryGroupNode[], map: Map<string, number>) {
  for (const n of nodes) {
    map.set(n.id, n.total);
    flattenTotals(n.children, map);
  }
}

function pushNodes(rows: Row[], nodes: CategoryGroupNode[], depth: number, totalReceitaBase: number, anteriorPorId: Map<string, number>) {
  for (const n of nodes) {
    const prefixo = depth > 0 ? `${"  ".repeat(depth)}└ ` : "";
    const label = n.code ? `${n.code} ${n.name}` : n.name;
    const valorAnterior = anteriorPorId.get(n.id);
    rows.push({
      Linha: `${prefixo}${label}`,
      Valor: n.total,
      "% Receita": pctLabel(n.total, totalReceitaBase),
      "Período Anterior": valorAnterior === undefined ? "—" : valorAnterior,
      Variação: variacaoLabel(n.total, valorAnterior),
    });
    if (n.children.length > 0) pushNodes(rows, n.children, depth + 1, totalReceitaBase, anteriorPorId);
  }
}

function breakdownRows(titulo: string, breakdown: CategoryBreakdown, breakdownAnterior: CategoryBreakdown, totalReceitaBase: number): Row[] {
  const anteriorPorId = new Map<string, number>();
  flattenTotals(breakdownAnterior.groups, anteriorPorId);
  anteriorPorId.set("uncategorized", breakdownAnterior.uncategorized.total);

  const rows: Row[] = [
    {
      Linha: titulo,
      Valor: breakdown.total,
      "% Receita": pctLabel(breakdown.total, totalReceitaBase),
      "Período Anterior": breakdownAnterior.total,
      Variação: variacaoLabel(breakdown.total, breakdownAnterior.total),
    },
  ];
  pushNodes(rows, breakdown.groups, 1, totalReceitaBase, anteriorPorId);
  if (breakdown.uncategorized.entries.length > 0) {
    const valorAnterior = anteriorPorId.get("uncategorized");
    rows.push({
      Linha: "  └ Sem categoria",
      Valor: breakdown.uncategorized.total,
      "% Receita": pctLabel(breakdown.uncategorized.total, totalReceitaBase),
      "Período Anterior": valorAnterior === undefined ? "—" : valorAnterior,
      Variação: variacaoLabel(breakdown.uncategorized.total, valorAnterior),
    });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.financeAccess) {
    return NextResponse.json({ error: "Você não tem acesso ao módulo Financeiro." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const costCenterId = sp.get("costCenterId") || undefined;

  let periodoAtual: DrePeriodo;
  if (sp.get("from") && sp.get("to")) {
    periodoAtual = { de: new Date(sp.get("from")!), ate: new Date(`${sp.get("to")}T23:59:59`) };
  } else {
    const now = new Date();
    const year = sp.get("year") ? parseInt(sp.get("year")!) : now.getFullYear();
    const month = sp.get("month") ? parseInt(sp.get("month")!) : now.getMonth();
    periodoAtual = { de: new Date(year, month, 1), ate: new Date(year, month + 1, 1) };
  }
  const periodoAnt = periodoAnterior(periodoAtual);

  const [atual, anterior] = await Promise.all([
    calcularDre(user.officeId, periodoAtual, costCenterId),
    calcularDre(user.officeId, periodoAnt, costCenterId),
  ]);

  const rows: Row[] = [
    ...breakdownRows("RECEITA OPERACIONAL BRUTA", atual.receitas, anterior.receitas, atual.totalReceitas),
    { Linha: "", Valor: "", "% Receita": "", "Período Anterior": "", Variação: "" },
    ...breakdownRows("TOTAL DE DESPESAS OPERACIONAIS", atual.despesas, anterior.despesas, atual.totalReceitas),
    { Linha: "", Valor: "", "% Receita": "", "Período Anterior": "", Variação: "" },
    {
      Linha: "RESULTADO LÍQUIDO DO PERÍODO",
      Valor: atual.resultado,
      "% Receita": pctLabel(atual.resultado, atual.totalReceitas),
      "Período Anterior": anterior.resultado,
      Variação: variacaoLabel(atual.resultado, anterior.resultado),
    },
  ];

  if (atual.totalAdiantado > 0 || atual.totalReembolsado > 0) {
    rows.push(
      { Linha: "", Valor: "", "% Receita": "", "Período Anterior": "", Variação: "" },
      { Linha: "Adiantado a Clientes (informativo, fora do Resultado)", Valor: atual.totalAdiantado, "% Receita": "—", "Período Anterior": "—", Variação: "—" },
      { Linha: "Reembolsado por Clientes (informativo, fora do Resultado)", Valor: atual.totalReembolsado, "% Receita": "—", "Período Anterior": "—", Variação: "—" }
    );
  }

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["Linha", "Valor", "% Receita", "Período Anterior", "Variação"] });
  worksheet["!cols"] = [{ wch: 46 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "DRE Gerencial");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dre-gerencial-${stamp}.xlsx"`,
    },
  });
}
