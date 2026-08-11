// Peças visuais próprias do Painel da Empresa Lúmen — deliberadamente distintas dos
// componentes do lado escritório (components/ui.tsx: Card/Badge não são reaproveitados
// aqui). Mais retas e densas: bordas finas (border-white/10, nunca a sombra `shadow-pop`
// calorosa do escritório), cantos `rounded-lg` (não o `rounded-xl` largo do lado escritório),
// e todo número em `font-mono` + `tabular-nums`.
//
// Área de plataforma, não do escritório: o painel é grafite escuro nos DOIS temas (Manhã e
// Noite), igual ao Rail (DESIGN-SYSTEM.md §3) — por isso o texto usa branco fixo (`text-white`,
// nunca `--tx`, que viraria escuro-sobre-escuro no tema Manhã) e os acentos usam os tokens
// semânticos (`--marca`/`--aviso`/`--urgente`/`--concluido`) exatamente como o Rail já faz sobre
// o mesmo fundo fixo — o tom de cada um já foi escolhido para funcionar sobre grafite escuro.
export function LumenPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-grafite-800 border border-white/10 rounded-lg ${className}`}>{children}</div>;
}

export function LumenPanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-4 border-b border-white/10">
      <h3 className="text-white font-semibold text-base">{title}</h3>
      {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function LumenStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "risk" | "ok" }) {
  const toneClass = { default: "text-white", warn: "text-aviso", risk: "text-urgente", ok: "text-concluido" }[tone];
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function LumenStatusDot({ tone }: { tone: "ok" | "warn" | "risk" | "slate" }) {
  const cls = { ok: "bg-concluido", warn: "bg-aviso", risk: "bg-urgente", slate: "bg-white/30" }[tone];
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}
