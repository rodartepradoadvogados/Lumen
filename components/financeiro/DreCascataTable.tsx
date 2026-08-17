import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import type { CategoryBreakdown, CategoryGroupNode } from "@/lib/cashFlowGroups";
import { variacaoPercentual } from "@/lib/dreCalculo";

// Tabela em cascata da DRE Gerencial — mesma árvore de grupos que components/CategoryBreakdownTree.tsx
// (Fluxo de Caixa) já usa, com três colunas a mais que o pedido explícito trouxe: % da Receita
// (análise vertical — toda linha, de receita OU despesa, dividida pela Receita Total do período,
// convenção padrão de DRE gerencial), Período Anterior e Variação %. Componente novo (não uma
// versão genérica do CategoryBreakdownTree) pra não arriscar a tela de Fluxo de Caixa, que já
// funciona, por causa de colunas que só fazem sentido aqui.
export function DreCascataTable({
  title,
  breakdown,
  breakdownAnterior,
  totalReceitaBase,
  tone,
}: {
  title: string;
  breakdown: CategoryBreakdown;
  breakdownAnterior: CategoryBreakdown | null;
  // Denominador da coluna "% da Receita" — sempre a Receita Total do período (convenção de
  // análise vertical: até as linhas de despesa mostram que fatia da receita elas consomem).
  totalReceitaBase: number;
  tone: "green" | "red";
}) {
  const toneClass = tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-urgente";
  const anteriorPorId = new Map<string, number>();
  if (breakdownAnterior) flattenTotals(breakdownAnterior.groups, anteriorPorId);
  if (breakdownAnterior) anteriorPorId.set("uncategorized", breakdownAnterior.uncategorized.total);

  return (
    <div className="divide-y divide-regua">
      <HeaderRow
        label={title}
        valor={breakdown.total}
        valorAnterior={breakdownAnterior?.total}
        pct={totalReceitaBase ? (breakdown.total / totalReceitaBase) * 100 : null}
        toneClass={toneClass}
        bold
      />
      {breakdown.groups.length === 0 && breakdown.uncategorized.entries.length === 0 ? (
        <p className="px-5 py-3 text-xs text-tx-3">Nenhum lançamento no período.</p>
      ) : (
        <>
          {breakdown.groups.map((g) => (
            <GroupRow key={g.id} node={g} depth={0} toneClass={toneClass} totalReceitaBase={totalReceitaBase} anteriorPorId={anteriorPorId} />
          ))}
          {breakdown.uncategorized.entries.length > 0 && (
            <GroupRow
              node={{ id: "uncategorized", code: "", name: "Sem categoria", total: breakdown.uncategorized.total, children: [], entries: [] }}
              depth={0}
              toneClass={toneClass}
              totalReceitaBase={totalReceitaBase}
              anteriorPorId={anteriorPorId}
            />
          )}
        </>
      )}
    </div>
  );
}

function flattenTotals(nodes: CategoryGroupNode[], map: Map<string, number>) {
  for (const n of nodes) {
    map.set(n.id, n.total);
    flattenTotals(n.children, map);
  }
}

const gridCols = "grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3";

function VariacaoCell({ atual, anterior }: { atual: number; anterior?: number }) {
  if (anterior === undefined) return <span className="text-xs text-tx-3 text-right">—</span>;
  const variacao = variacaoPercentual(atual, anterior);
  return (
    <span className={`text-xs text-right tabular-nums ${variacao === null ? "text-tx-3" : variacao >= 0 ? "text-concluido" : "text-urgente"}`}>
      {variacao === null ? "—" : `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1)}%`}
    </span>
  );
}

function HeaderRow({
  label,
  valor,
  valorAnterior,
  pct,
  toneClass,
  bold,
}: {
  label: string;
  valor: number;
  valorAnterior?: number;
  pct: number | null;
  toneClass: string;
  bold?: boolean;
}) {
  return (
    <div className={`${gridCols} px-5 py-3 text-sm ${bold ? "font-bold" : ""}`}>
      <span className="text-tx">{label}</span>
      <span className={`text-right tabular-nums ${toneClass}`}>{formatCurrency(valor)}</span>
      <span className="text-xs text-tx-3 text-right tabular-nums w-14">{pct === null ? "—" : `${pct.toFixed(1)}%`}</span>
      <span className="text-xs text-tx-3 text-right tabular-nums">{valorAnterior === undefined ? "—" : formatCurrency(valorAnterior)}</span>
      <VariacaoCell atual={valor} anterior={valorAnterior} />
    </div>
  );
}

function GroupRow({
  node,
  depth,
  toneClass,
  totalReceitaBase,
  anteriorPorId,
}: {
  node: CategoryGroupNode;
  depth: number;
  toneClass: string;
  totalReceitaBase: number;
  anteriorPorId: Map<string, number>;
}) {
  const hasChildren = node.children.length > 0;
  const label = node.code ? `${node.code} ${node.name}` : node.name;
  const indent = 20 + depth * 16;
  const pct = totalReceitaBase ? (node.total / totalReceitaBase) * 100 : null;
  const valorAnterior = anteriorPorId.get(node.id);

  if (!hasChildren) {
    return (
      <div className={`${gridCols} px-5 py-2 text-sm`} style={{ paddingLeft: indent }}>
        <span className="text-tx-2">{label}</span>
        <span className="text-right tabular-nums font-medium text-tx-2">{formatCurrency(node.total)}</span>
        <span className="text-xs text-tx-3 text-right tabular-nums w-14">{pct === null ? "—" : `${pct.toFixed(1)}%`}</span>
        <span className="text-xs text-tx-3 text-right tabular-nums">{valorAnterior === undefined ? "—" : formatCurrency(valorAnterior)}</span>
        <VariacaoCell atual={node.total} anterior={valorAnterior} />
      </div>
    );
  }

  return (
    <details className="group/row">
      <summary
        className={`${gridCols} px-5 py-2 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-sf-apoio`}
        style={{ paddingLeft: indent }}
      >
        <span className="flex items-center gap-1.5 text-tx font-medium">
          <ChevronRight size={13} className="text-tx-3 transition-transform group-open/row:rotate-90 shrink-0" />
          {label}
        </span>
        <span className={`text-right tabular-nums font-semibold ${toneClass}`}>{formatCurrency(node.total)}</span>
        <span className="text-xs text-tx-3 text-right tabular-nums w-14">{pct === null ? "—" : `${pct.toFixed(1)}%`}</span>
        <span className="text-xs text-tx-3 text-right tabular-nums">{valorAnterior === undefined ? "—" : formatCurrency(valorAnterior)}</span>
        <VariacaoCell atual={node.total} anterior={valorAnterior} />
      </summary>
      <div>
        {node.children.map((c) => (
          <GroupRow key={c.id} node={c} depth={depth + 1} toneClass={toneClass} totalReceitaBase={totalReceitaBase} anteriorPorId={anteriorPorId} />
        ))}
      </div>
    </details>
  );
}
