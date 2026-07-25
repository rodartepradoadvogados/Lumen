import { ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/components/ui";
import type { CategoryBreakdown, CategoryGroupNode } from "@/lib/cashFlowGroups";

// Árvore de categorias aglutinada em uma linha por nó, expansível com um clique
// (<details>/<summary> nativos — sem JS extra) até chegar nos lançamentos individuais.
export function CategoryBreakdownSection({
  title,
  breakdown,
  tone,
  compact,
}: {
  title: string;
  breakdown: CategoryBreakdown;
  tone: "green" | "red";
  compact?: boolean;
}) {
  const toneClass = tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-bordo-400";
  const pad = compact ? 10 : 16;

  return (
    <div className="divide-y divide-navy-800/5 dark:divide-white/10">
      <div className={`flex items-center justify-between ${compact ? "px-4 py-2.5" : "px-5 py-3"}`}>
        <span className="text-sm font-bold text-navy-900 dark:text-cream-50">{title}</span>
        <span className={`text-sm font-bold ${toneClass}`}>{formatCurrency(breakdown.total)}</span>
      </div>
      {breakdown.groups.length === 0 && breakdown.uncategorized.entries.length === 0 ? (
        <p className="px-5 py-3 text-xs text-navy-800/40 dark:text-cream-50/40">Nenhum lançamento no período.</p>
      ) : (
        <>
          {breakdown.groups.map((g) => (
            <GroupRow key={g.id} node={g} depth={0} tone={tone} toneClass={toneClass} pad={pad} />
          ))}
          {breakdown.uncategorized.entries.length > 0 && (
            <GroupRow
              node={{ id: "uncategorized", code: "", name: "Sem categoria", total: breakdown.uncategorized.total, children: [], entries: breakdown.uncategorized.entries }}
              depth={0}
              tone={tone}
              toneClass={toneClass}
              pad={pad}
            />
          )}
        </>
      )}
    </div>
  );
}

function GroupRow({
  node,
  depth,
  tone,
  toneClass,
  pad,
}: {
  node: CategoryGroupNode;
  depth: number;
  tone: "green" | "red";
  toneClass: string;
  pad: number;
}) {
  const hasChildren = node.children.length > 0;
  const hasEntries = node.entries.length > 0;
  const label = node.code ? `${node.code} ${node.name}` : node.name;
  const indent = 20 + depth * pad;

  if (!hasChildren && !hasEntries) {
    return (
      <div className="flex items-center justify-between px-5 py-2 text-sm" style={{ paddingLeft: indent }}>
        <span className="text-navy-800/70 dark:text-cream-50/70">{label}</span>
        <span className="font-medium text-navy-800/50 dark:text-cream-50/50">{formatCurrency(0)}</span>
      </div>
    );
  }

  return (
    <details className="group/row">
      <summary className="flex items-center justify-between px-5 py-2 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-navy-900/[0.02] dark:hover:bg-white/[0.02]" style={{ paddingLeft: indent }}>
        <span className="flex items-center gap-1.5 text-navy-900 dark:text-cream-50 font-medium">
          <ChevronRight size={13} className="text-navy-800/40 dark:text-cream-50/40 transition-transform group-open/row:rotate-90 shrink-0" />
          {label}
        </span>
        <span className={`font-semibold ${toneClass}`}>{formatCurrency(node.total)}</span>
      </summary>
      <div>
        {node.children.map((c) => (
          <GroupRow key={c.id} node={c} depth={depth + 1} tone={tone} toneClass={toneClass} pad={pad} />
        ))}
        {node.entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-5 py-1.5 text-xs" style={{ paddingLeft: indent + 20 }}>
            <span className="text-navy-800/60 dark:text-cream-50/50 truncate pr-3">
              {e.description} <span className="text-navy-800/35 dark:text-cream-50/35">· {formatDate(e.date)}</span>
            </span>
            <span className="text-navy-800/70 dark:text-cream-50/60 shrink-0">{formatCurrency(e.amount)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
