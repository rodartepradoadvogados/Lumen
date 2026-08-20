import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { buildCategoryBreakdown, type CategoryBreakdown, type CategoryGroupNode } from "@/lib/cashFlowGroups";
import { valorLiquido } from "@/lib/financeCalc";
import { formatCurrency } from "@/components/ui";
import ImprimirAoAbrir from "@/components/relatorios/ImprimirAoAbrir";
import { FolhaImprimivelStyle, FolhaCabecalho } from "@/components/relatorios/FolhaImprimivel";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Folha imprimível do Fluxo de Caixa — mesma janela e lógica da tela normal
// (app/(app)/financeiro/fluxo-de-caixa/page.tsx): -3 a +3 meses a partir do mês atual, projeção
// por vencimento. Ver comentário de app/(app)/financeiro/dre/imprimir/page.tsx sobre o caminho de
// impressão (sem biblioteca de PDF no projeto, de propósito).
type LinhaCategoria = { label: string; valor: number; depth: number; bold?: boolean };

function flattenBreakdown(breakdown: CategoryBreakdown): LinhaCategoria[] {
  const linhas: LinhaCategoria[] = [{ label: "TOTAL", valor: breakdown.total, depth: 0, bold: true }];
  const walk = (nodes: CategoryGroupNode[], depth: number) => {
    for (const n of nodes) {
      linhas.push({ label: n.code ? `${n.code} ${n.name}` : n.name, valor: n.total, depth });
      if (n.children.length > 0) walk(n.children, depth + 1);
    }
  };
  walk(breakdown.groups, 1);
  if (breakdown.uncategorized.entries.length > 0) linhas.push({ label: "Sem categoria", valor: breakdown.uncategorized.total, depth: 1 });
  return linhas;
}

function TabelaCategoria({ linhas }: { linhas: LinhaCategoria[] }) {
  return (
    <table style={{ marginBottom: 18 }}>
      <thead>
        <tr>
          <th>Categoria</th>
          <th style={{ textAlign: "right" }}>Valor</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i}>
            <td style={{ paddingLeft: 6 + l.depth * 12, fontWeight: l.bold ? 700 : 400 }}>{l.label}</td>
            <td style={{ textAlign: "right", fontWeight: l.bold ? 700 : 400 }}>{formatCurrency(l.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ImprimirFluxoDeCaixaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  const [office, payables, receivables] = await Promise.all([
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { name: true, cnpj: true } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { notIn: ["CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { gte: windowStart, lte: windowEnd } } }),
  ]);

  const months: { key: string; label: string; entradas: number; saidas: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]}/${d.getFullYear()}`, entradas: 0, saidas: 0 });
  }
  for (const r of receivables) {
    const m = months.find((mo) => mo.key === `${r.dueDate.getFullYear()}-${r.dueDate.getMonth()}`);
    if (m) m.entradas += valorLiquido(r.amount, r.discount, r.surcharge);
  }
  for (const p of payables) {
    const m = months.find((mo) => mo.key === `${p.dueDate.getFullYear()}-${p.dueDate.getMonth()}`);
    if (m) m.saidas += valorLiquido(p.amount, p.discount, p.surcharge);
  }

  let saldoAcumulado = 0;
  const mensal = months.map((m) => {
    saldoAcumulado += m.entradas - m.saidas;
    return { ...m, saldoMes: m.entradas - m.saidas, saldoAcumulado };
  });

  const [receitasBreakdown, despesasBreakdown] = await Promise.all([
    buildCategoryBreakdown("RECEITA", viewer.officeId, receivables.map((r) => ({ id: r.id, description: r.description, date: r.dueDate, amount: valorLiquido(r.amount, r.discount, r.surcharge), categoryId: r.categoryId }))),
    buildCategoryBreakdown("DESPESA", viewer.officeId, payables.map((p) => ({ id: p.id, description: p.description, date: p.dueDate, amount: valorLiquido(p.amount, p.discount, p.surcharge), categoryId: p.categoryId }))),
  ]);

  return (
    <>
      <FolhaImprimivelStyle />
      <ImprimirAoAbrir />
      <div className="folha">
        <FolhaCabecalho
          officeName={office?.name}
          officeCnpj={office?.cnpj}
          titulo="Fluxo de Caixa"
          subtitulo={`${months[0].label} a ${months[months.length - 1].label} · projeção por vencimento`}
          emitidoPor={viewer.name}
        />

        <table style={{ marginBottom: 18 }}>
          <thead>
            <tr>
              <th>Mês</th>
              <th style={{ textAlign: "right" }}>Entradas</th>
              <th style={{ textAlign: "right" }}>Saídas</th>
              <th style={{ textAlign: "right" }}>Saldo do Mês</th>
              <th style={{ textAlign: "right" }}>Saldo Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {mensal.map((m) => (
              <tr key={m.key}>
                <td style={{ fontWeight: 700 }}>{m.label}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(m.entradas)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(m.saidas)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(m.saldoMes)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(m.saldoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#5b646e", marginBottom: 6 }}>Receitas por categoria</h2>
            <TabelaCategoria linhas={flattenBreakdown(receitasBreakdown)} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "#5b646e", marginBottom: 6 }}>Despesas por categoria</h2>
            <TabelaCategoria linhas={flattenBreakdown(despesasBreakdown)} />
          </div>
        </div>
      </div>
    </>
  );
}
