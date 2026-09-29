// Micro-gráficos (só divs/CSS) compartilhados por Relatórios e Produtividade. Saíram de
// app/(app)/relatorios/page.tsx quando a Produtividade passou a ter uma casa só.

export function HBar({ label, display, value, max, color }: { label: string; display: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
        <span className="text-tx-2 truncate">{label}</span>
        <span className="font-semibold text-tx shrink-0">{display}</span>
      </div>
      <div className="h-2.5 rounded-sm bg-sf-apoio overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, minWidth: value > 0 ? 4 : 0, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function VBars({ items, color }: { items: { label: string; display: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {items.map((it, i) => (
        <div key={i} className="flex-1 min-w-[38px] flex flex-col items-center">
          <span className="text-etiqueta font-semibold text-tx-2 mb-1">{it.display}</span>
          <div className="w-full h-32 flex items-end">
            <div
              className="w-full "
              style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value > 0 ? 4 : 0, backgroundColor: color }}
            />
          </div>
          <span className="text-etiqueta text-tx-2 mt-1.5 whitespace-nowrap">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

