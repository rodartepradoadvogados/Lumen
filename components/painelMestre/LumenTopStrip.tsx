import Link from "next/link";
import PainelMestreThemeToggle from "@/components/painelMestre/PainelMestreThemeToggle";

// Server component — barra fina no topo do Painel da Empresa. Só mostra quem está logado, o
// alternador de tema (Escuro/Claro, ver PainelMestreThemeToggle.tsx) e um link de volta ao painel
// normal do escritório; nada de busca/atalhos (essa área não herda o que a TopBar do escritório
// tem, de propósito — ver spec).
export default function LumenTopStrip({ memberName }: { memberName: string }) {
  return (
    <header className="h-14 shrink-0 bg-gaveta border-b border-gaveta-linha flex items-center justify-between gap-3 pl-16 pr-4 md:px-5">
      <Link
        href="/painel"
        className="text-xs font-semibold text-gaveta-tinta-2 hover:text-gaveta-tinta truncate"
      >
        ← Voltar ao escritório
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline text-sm text-gaveta-tinta">{memberName}</span>
        {/* Hardcoded por ora — o PlatformRole de verdade por pessoa é assunto da Equipe Lúmen (Fase 2).
            P0-5: bg-marca-bg/text-marca sobre este header (grafite-800 fixo) reprovava WCAG AA —
            trocado pelo par bg-rail-marca-bg/text-rail-marca que o NavRail já usa para exatamente
            este caso (bordô como badge/texto sobre superfície fixa escura). */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-etiqueta font-semibold uppercase tracking-wide bg-rail-marca-bg text-rail-marca">
          Sócio
        </span>
        <PainelMestreThemeToggle />
      </div>
    </header>
  );
}
