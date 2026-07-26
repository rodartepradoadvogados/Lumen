// Peças visuais próprias do Painel da Empresa Lúmen — deliberadamente distintas dos
// componentes do lado escritório (components/ui.tsx: Card/Badge não são reaproveitados
// aqui). Mais retas e densas: bordas finas (border-white/10, nunca a sombra `shadow-pop`
// calorosa do escritório), cantos `rounded-lg` (não o `rounded-xl` largo do lado escritório),
// e todo número em `font-mono` + `tabular-nums`.

export function LumenPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-navy-900 dark:bg-navy-900 border border-white/10 rounded-lg ${className}`}>{children}</div>;
}

export function LumenPanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-4 border-b border-white/10">
      <h3 className="font-serif text-cream-50 font-semibold text-base">{title}</h3>
      {subtitle && <p className="text-xs text-cream-50/50 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function LumenStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "risk" | "ok" }) {
  const toneClass = { default: "text-cream-50", warn: "text-gold-400", risk: "text-bordo-400", ok: "text-emerald-400" }[tone];
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold text-cream-50/40 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function LumenStatusDot({ tone }: { tone: "ok" | "warn" | "risk" | "slate" }) {
  const cls = { ok: "bg-emerald-400", warn: "bg-gold-400", risk: "bg-bordo-400", slate: "bg-cream-50/30" }[tone];
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}
