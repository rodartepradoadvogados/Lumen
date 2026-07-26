import Link from "next/link";

// Server component — barra fina no topo do Painel da Empresa. Só mostra quem está logado e
// um link de volta ao painel normal do escritório; nada de busca/atalhos/tema (essa área não
// herda o que a TopBar do escritório tem, de propósito — ver spec).
export default function LumenTopStrip({ memberName }: { memberName: string }) {
  return (
    <header className="h-14 shrink-0 bg-navy-900 dark:bg-navy-900 border-b border-white/10 flex items-center justify-between gap-3 pl-16 pr-4 md:px-5">
      <Link
        href="/painel"
        className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 truncate"
      >
        ← Voltar ao escritório
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline text-sm text-navy-900 dark:text-cream-50">{memberName}</span>
        {/* Hardcoded por ora — o PlatformRole de verdade por pessoa é assunto da Equipe Lúmen (Fase 2). */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gold-500/15 text-gold-700 dark:bg-gold-400/15 dark:text-gold-400">
          Sócio
        </span>
      </div>
    </header>
  );
}
