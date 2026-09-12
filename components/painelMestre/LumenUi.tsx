// Peças visuais próprias do Painel da Empresa Lúmen — deliberadamente distintas dos
// componentes do lado escritório (components/ui.tsx: Card/Badge não são reaproveitados
// aqui). Mais retas e densas: bordas finas (border-regua, nunca a sombra `shadow-pop`
// calorosa do escritório), cantos quase retos (rounded-sm, 2px — mesma exceção documentada do
// Portal Noturno/PWA Noturno), e todo número em `font-mono` + `tabular-nums`.
//
// Área de plataforma, não do escritório: desde esta rodada (".painel-mestre-shell", ver
// app/globals.css e DESIGN.md "Painel da Empresa") o CONTEÚDO retema entre Escuro/Claro como o
// resto do produto — só o Rail e o TopStrip continuam grafite fixo nos dois temas (mesma regra do
// Rail do site e do cabeçalho do PWA). Antes desta rodada o texto usava branco fixo (`text-white`)
// porque não havia tema opcional; agora usa `--tx`/`--tx-2`, que retemam sozinhos.
export function LumenPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-sf-superficie border border-regua rounded-sm ${className}`}>{children}</div>;
}

export function LumenPanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-4 border-b border-regua">
      <h3 className="text-tx font-semibold text-base">{title}</h3>
      {subtitle && <p className="text-xs text-tx-2 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function LumenStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "risk" | "ok" }) {
  const toneClass = { default: "text-tx", warn: "text-aviso", risk: "text-urgente", ok: "text-concluido" }[tone];
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold text-tx-3 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function LumenStatusDot({ tone }: { tone: "ok" | "warn" | "risk" | "slate" }) {
  const cls = { ok: "bg-concluido", warn: "bg-aviso", risk: "bg-urgente", slate: "bg-tx-3" }[tone];
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}
