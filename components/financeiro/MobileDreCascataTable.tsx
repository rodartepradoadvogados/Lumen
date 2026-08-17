import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import type { CategoryBreakdown, CategoryGroupNode } from "@/lib/cashFlowGroups";
import { variacaoPercentual } from "@/lib/dreCalculo";

// Mesmos indicadores do DreCascataTable (desktop) — % da Receita, Período Anterior, Variação —
// só que empilhados numa segunda linha em vez de colunas, porque a tela mobile não tem largura
// pras 5 colunas do grid desktop.
export function MobileDreCascataTable({
  title,
  breakdown,
  breakdownAnterior,
  totalReceitaBase,
  tone,
}: {
  title: string;
  breakdown: CategoryBreakdown;
  breakdownAnterior: CategoryBreakdown | null;
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
      />
      {breakdown.groups.length === 0 && breakdown.uncategorized.entries.length === 0 ? (
        <p className="px-4 py-3 text-xs text-tx-3">Nenhum lançamento no período.</p>
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

function SubLine({ pct, valorAnterior, atual }: { pct: number | null; valorAnterior?: number; atual: number }) {
  const variacao = valorAnterior === undefined ? null : variacaoPercentual(atual, valorAnterior);
  return (
    <div className="flex items-center gap-2 text-[11px] text-tx-3 tabular-nums mt-0.5">
      <span>{pct === null ? "—" : `${pct.toFixed(1)}% da receita`}</span>
      {valorAnterior !== undefined && (
        <>
          <span>·</span>
          <span>ant. {formatCurrency(valorAnterior)}</span>
          {variacao !== null && <span className={variacao >= 0 ? "text-concluido" : "text-urgente"}>({variacao >= 0 ? "+" : ""}{variacao.toFixed(1)}%)</span>}
        </>
      )}
    </div>
  );
}

function HeaderRow({
  label,
  valor,
  valorAnterior,
  pct,
  toneClass,
}: {
  label: string;
  valor: number;
  valorAnterior?: number;
  pct: number | null;
  toneClass: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="text-tx">{label}</span>
        <span className={`tabular-nums ${toneClass}`}>{formatCurrency(valor)}</span>
      </div>
      <SubLine pct={pct} valorAnterior={valorAnterior} atual={valor} />
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
  const indent = 16 + depth * 12;
  const pct = totalReceitaBase ? (node.total / totalReceitaBase) * 100 : null;
  const valorAnterior = anteriorPorId.get(node.id);

  if (!hasChildren) {
    return (
      <div className="px-4 py-2" style={{ paddingLeft: indent }}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-tx-2">{label}</span>
          <span className="tabular-nums font-medium text-tx-2">{formatCurrency(node.total)}</span>
        </div>
        <SubLine pct={pct} valorAnterior={valorAnterior} atual={node.total} />
      </div>
    );
  }

  return (
    <details className="group/row">
      <summary className="px-4 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-sf-apoio" style={{ paddingLeft: indent }}>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-tx font-medium">
            <ChevronRight size={13} className="text-tx-3 transition-transform group-open/row:rotate-90 shrink-0" />
            {label}
          </span>
          <span className={`tabular-nums font-semibold ${toneClass}`}>{formatCurrency(node.total)}</span>
        </div>
        <SubLine pct={pct} valorAnterior={valorAnterior} atual={node.total} />
      </summary>
      <div>
        {node.children.map((c) => (
          <GroupRow key={c.id} node={c} depth={depth + 1} toneClass={toneClass} totalReceitaBase={totalReceitaBase} anteriorPorId={anteriorPorId} />
        ))}
      </div>
    </details>
  );
}
