import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { calcularDre, periodoAnterior, variacaoPercentual, type DrePeriodo } from "@/lib/dreCalculo";
import { filtrarGruposVazios, type CategoryBreakdown, type CategoryGroupNode } from "@/lib/cashFlowGroups";
import { formatCurrency } from "@/components/ui";
import ImprimirAoAbrir from "@/components/relatorios/ImprimirAoAbrir";
import { FolhaImprimivelStyle, FolhaCabecalho } from "@/components/relatorios/FolhaImprimivel";

export const dynamic = "force-dynamic";

// Folha imprimível do DRE Gerencial — mesmo caminho rápido ("Imprimir / Salvar como PDF") do
// Relatório Personalizado (ver app/(app)/relatorios/personalizado/imprimir/page.tsx): não existe
// biblioteca de PDF no projeto de propósito, então esta é uma página A4 com folha de estilo de
// impressão, e o "PDF" é o próprio recurso do navegador. Mesmos filtros da tela normal
// (app/(app)/financeiro/dre/page.tsx), passados por query string.
type Linha = { label: string; valor: number; pct: string; anterior?: number; variacao: string; depth: number; bold?: boolean };

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
function pushNodes(linhas: Linha[], nodes: CategoryGroupNode[], depth: number, totalReceitaBase: number, anteriorPorId: Map<string, number>) {
  for (const n of nodes) {
    linhas.push({
      label: n.code ? `${n.code} ${n.name}` : n.name,
      valor: n.total,
      pct: pctLabel(n.total, totalReceitaBase),
      anterior: anteriorPorId.get(n.id),
      variacao: variacaoLabel(n.total, anteriorPorId.get(n.id)),
      depth,
    });
    if (n.children.length > 0) pushNodes(linhas, n.children, depth + 1, totalReceitaBase, anteriorPorId);
  }
}
function montarLinhas(titulo: string, breakdown: CategoryBreakdown, breakdownAnterior: CategoryBreakdown, totalReceitaBase: number): Linha[] {
  const anteriorPorId = new Map<string, number>();
  flattenTotals(breakdownAnterior.groups, anteriorPorId);
  anteriorPorId.set("uncategorized", breakdownAnterior.uncategorized.total);

  const linhas: Linha[] = [
    { label: titulo, valor: breakdown.total, pct: pctLabel(breakdown.total, totalReceitaBase), anterior: breakdownAnterior.total, variacao: variacaoLabel(breakdown.total, breakdownAnterior.total), depth: 0, bold: true },
  ];
  pushNodes(linhas, breakdown.groups, 1, totalReceitaBase, anteriorPorId);
  if (breakdown.uncategorized.entries.length > 0) {
    const anterior = anteriorPorId.get("uncategorized");
    linhas.push({ label: "Sem categoria", valor: breakdown.uncategorized.total, pct: pctLabel(breakdown.uncategorized.total, totalReceitaBase), anterior, variacao: variacaoLabel(breakdown.uncategorized.total, anterior), depth: 1 });
  }
  return linhas;
}

function TabelaLinhas({ linhas }: { linhas: Linha[] }) {
  return (
    <>
      {linhas.map((l, i) => (
        <tr key={i}>
          <td style={{ paddingLeft: 6 + l.depth * 12, fontWeight: l.bold ? 700 : 400 }}>{l.label}</td>
          <td style={{ textAlign: "right", fontWeight: l.bold ? 700 : 400 }}>{formatCurrency(l.valor)}</td>
          <td style={{ textAlign: "right" }}>{l.pct}</td>
          <td style={{ textAlign: "right" }}>{l.anterior === undefined ? "—" : formatCurrency(l.anterior)}</td>
          <td style={{ textAlign: "right" }}>{l.variacao}</td>
        </tr>
      ))}
    </>
  );
}

export default async function ImprimirDrePage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; from?: string; to?: string; costCenterId?: string; ocultarVazias?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const usingCustomRange = !!(searchParams.from && searchParams.to);
  const now = new Date();
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear();
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth();
  const start = usingCustomRange ? new Date(searchParams.from!) : new Date(year, month, 1);
  const end = usingCustomRange ? new Date(`${searchParams.to}T23:59:59`) : new Date(year, month + 1, 1);
  const costCenterId = searchParams.costCenterId || undefined;
  const ocultarVazias = searchParams.ocultarVazias === "1";

  const periodoAtual: DrePeriodo = { de: start, ate: end };
  const periodoAnt = periodoAnterior(periodoAtual);

  const [office, atual, anterior] = await Promise.all([
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { name: true, cnpj: true } }),
    calcularDre(viewer.officeId, periodoAtual, costCenterId),
    calcularDre(viewer.officeId, periodoAnt, costCenterId),
  ]);

  const receitas = ocultarVazias ? { ...atual.receitas, groups: filtrarGruposVazios(atual.receitas.groups) } : atual.receitas;
  const despesas = ocultarVazias ? { ...atual.despesas, groups: filtrarGruposVazios(atual.despesas.groups) } : atual.despesas;
  const linhasReceita = montarLinhas("RECEITA OPERACIONAL BRUTA", receitas, anterior.receitas, atual.totalReceitas);
  const linhasDespesa = montarLinhas("TOTAL DE DESPESAS OPERACIONAIS", despesas, anterior.despesas, atual.totalReceitas);

  return (
    <>
      <FolhaImprimivelStyle />
      <ImprimirAoAbrir />
      <div className="folha">
        <FolhaCabecalho
          officeName={office?.name}
          officeCnpj={office?.cnpj}
          titulo="DRE Gerencial"
          subtitulo={`${start.toLocaleDateString("pt-BR")} a ${new Date(end.getTime() - 1).toLocaleDateString("pt-BR")}`}
          emitidoPor={viewer.name}
        />

        <table>
          <thead>
            <tr>
              <th>Linha</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th style={{ textAlign: "right" }}>% Receita</th>
              <th style={{ textAlign: "right" }}>Período Anterior</th>
              <th style={{ textAlign: "right" }}>Variação</th>
            </tr>
          </thead>
          <tbody>
            <TabelaLinhas linhas={linhasReceita} />
            <TabelaLinhas linhas={linhasDespesa} />
            <tr>
              <td style={{ fontWeight: 700, fontSize: 12, paddingTop: 8 }}>RESULTADO LÍQUIDO DO PERÍODO</td>
              <td style={{ textAlign: "right", fontWeight: 700, fontSize: 12, paddingTop: 8 }}>{formatCurrency(atual.resultado)}</td>
              <td style={{ textAlign: "right", paddingTop: 8 }}>{pctLabel(atual.resultado, atual.totalReceitas)}</td>
              <td style={{ textAlign: "right", paddingTop: 8 }}>{formatCurrency(anterior.resultado)}</td>
              <td style={{ textAlign: "right", paddingTop: 8 }}>{variacaoLabel(atual.resultado, anterior.resultado)}</td>
            </tr>
          </tbody>
        </table>

        {(atual.totalAdiantado > 0 || atual.totalReembolsado > 0) && (
          <p style={{ fontSize: 9.5, color: "#5b646e", marginTop: 14 }}>
            Adiantado a clientes no período (informativo, fora do resultado): {formatCurrency(atual.totalAdiantado)} · Reembolsado: {formatCurrency(atual.totalReembolsado)}
          </p>
        )}
      </div>
    </>
  );
}
