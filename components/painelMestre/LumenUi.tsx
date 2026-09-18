import Link from "next/link";
// Peças visuais próprias do Painel da Empresa Lúmen — deliberadamente distintas dos
// componentes do lado escritório (components/ui.tsx: Card/Badge não são reaproveitados
// aqui). Mais retas e densas: bordas finas (border-regua, nunca a sombra `shadow-pop`
// calorosa do escritório), cantos quase retos (rounded-sm, 2px — mesma exceção documentada do
// Portal Noturno/PWA Noturno), e todo número em `font-mono` + `tabular-nums`.
//
// Área de plataforma, não do escritório: desde esta rodada (".painel-mestre-shell", ver
// app/globals.css e DESIGN.md "Painel da Empresa") o CONTEÚDO retema entre Escuro/Claro como o
// resto do produto — só o Rail e o TopStrip continuam grafite fixo nos dois temas (mesma regra do
// Rail do site e do cabeçalho do PWA). Antes desta rodada o texto usava branco fixo (`text-tx`)
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
      <p className="text-etiqueta font-semibold text-tx-3 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function LumenStatusDot({ tone }: { tone: "ok" | "warn" | "risk" | "slate" }) {
  const cls = { ok: "bg-concluido", warn: "bg-aviso", risk: "bg-urgente", slate: "bg-tx-3" }[tone];
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}

// SELO DE ESTADO do Painel da Empresa.
//
// Criado em 18/09/2026 para destravar a publicação: a tela do Hermes Agent
// (app/painel-mestre/hermes) importava `LumenBadge` deste arquivo, e ele nunca tinha sido
// escrito — o build quebrava no import e a produção parou de atualizar. O recurso em si estava
// inteiro; faltava esta peça de vinte linhas.
//
// Os tons saem do vocabulário de risco da casa (--concluido, --aviso, --urgente), não de cor
// crua do Tailwind: a tela original usava `bg-green-100 text-green-800` e companhia, que não
// retematizam — ficam iguais no tema claro e no escuro. Mesma razão pela qual LumenStatusDot,
// logo acima, usa os mesmos tokens.
export function LumenBadge({
  variant = "default",
  children,
}: {
  variant?: "success" | "warning" | "danger" | "default";
  children: React.ReactNode;
}) {
  const cls = {
    success: "bg-concluido-bg text-concluido border-linha-concluido",
    warning: "bg-aviso-bg text-aviso border-linha-aviso",
    danger: "bg-urgente-bg text-urgente border-linha-urgente",
    default: "bg-sf-apoio text-tx-2 border-regua",
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[2px] border text-etiqueta font-semibold ${cls}`}>
      {children}
    </span>
  );
}

// Abas do Painel da Empresa. Existiam numa tela só — `[officeId]`, escritas ali dentro — e o
// diagnóstico registrou o efeito: "abas reais + layout largo existe em 1 de 10 telas", com o
// Cofre como caso extremo (três tabelas de cinco e seis colunas empilhadas na vertical, sem abas,
// sem divisão, sem uso da largura). O padrão certo já tinha sido escrito uma vez; o trabalho aqui
// é PROPAGAR, não inventar.
//
// Deliberadamente NÃO é a guia chanfrada do lado escritório. O diagnóstico também registrou que
// separar a ferramenta da plataforma da ferramenta do escritório é decisão certa, e que a
// separação deve sobreviver ao redesenho: aqui o filete inferior de 2px é a linguagem da casa,
// mais reta e mais densa, como o resto do LumenUi.
export function LumenAbas({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1 border-b border-regua overflow-x-auto scrollbar-thin">{children}</div>;
}

export function LumenAba({
  href,
  ativa,
  children,
  contagem,
}: {
  href: string;
  ativa: boolean;
  children: React.ReactNode;
  contagem?: number;
}) {
  return (
    <Link
      href={href}
      // `replace`: a aba é estado de visualização, não destino — sem isto cada troca empilha uma
      // entrada no histórico. Mesmo defeito corrigido no portal e no PWA.
      replace
      aria-current={ativa ? "page" : undefined}
      className={`shrink-0 text-corpo font-semibold px-3.5 py-2.5 border-b-2 -mb-px transition-colors ${
        ativa ? "text-tx border-marca-tx" : "text-tx-2 border-transparent hover:text-tx"
      }`}
    >
      {children}
      {contagem !== undefined && (
        <span className="ml-1.5 font-mono tabular-nums text-tx-3">({contagem})</span>
      )}
    </Link>
  );
}
