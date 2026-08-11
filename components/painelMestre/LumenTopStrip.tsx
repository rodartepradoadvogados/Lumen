import Link from "next/link";

// Server component — barra fina no topo do Painel da Empresa. Só mostra quem está logado e
// um link de volta ao painel normal do escritório; nada de busca/atalhos/tema (essa área não
// herda o que a TopBar do escritório tem, de propósito — ver spec).
export default function LumenTopStrip({ memberName }: { memberName: string }) {
  return (
    <header className="h-14 shrink-0 bg-grafite-800 border-b border-white/10 flex items-center justify-between gap-3 pl-16 pr-4 md:px-5">
      <Link
        href="/painel"
        className="text-xs font-semibold text-white/60 hover:text-white truncate"
      >
        ← Voltar ao escritório
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline text-sm text-white">{memberName}</span>
        {/* Hardcoded por ora — o PlatformRole de verdade por pessoa é assunto da Equipe Lúmen (Fase 2). */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-marca-bg text-marca">
          Sócio
        </span>
      </div>
    </header>
  );
}
