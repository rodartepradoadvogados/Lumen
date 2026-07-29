import Link from "next/link";

// Alternância "Meus" / "Do escritório" do Painel, controlada por ?escopo= na URL — mesmo
// padrão de pílulas segmentadas usado nas abas de app/(app)/alertas/page.tsx (Link +
// searchParams, sem estado de cliente). "Meus" é o padrão (ver page.tsx).
export default function PainelEscopoToggle({ escopo }: { escopo: "meus" | "escritorio" }) {
  return (
    <div className="flex gap-2 shrink-0">
      <Link
        href="/painel?escopo=meus"
        className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
          escopo === "meus"
            ? "bg-navy-900 text-white"
            : "bg-white dark:bg-navy-800 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
        }`}
      >
        Meus
      </Link>
      <Link
        href="/painel?escopo=escritorio"
        className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
          escopo === "escritorio"
            ? "bg-navy-900 text-white"
            : "bg-white dark:bg-navy-800 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
        }`}
      >
        Do escritório
      </Link>
    </div>
  );
}
