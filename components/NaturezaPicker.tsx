"use client";

import { Scale, Landmark } from "lucide-react";

// Primeiro passo do cadastro de processo (que "tem número e tramita em órgão", ver
// lib/caseNatureza.ts): decide se é Judicial (Poder Judiciário, cor dourada — mesma cor de
// destaque principal da marca) ou Administrativo (órgão administrativo, cor bordô — cor
// secundária da marca, reaproveitando a mesma associação visual já usada em Assessoria/
// Licitações). Dois cards grandes em vez de um <select> porque essa é A decisão que muda o
// resto do formulário embaixo (tribunal x órgão, esfera/matéria) — precisa ficar óbvia antes de
// qualquer outro campo.
type Props = {
  value: "JUDICIAL" | "ADMINISTRATIVO";
  onChange: (value: "JUDICIAL" | "ADMINISTRATIVO") => void;
};

export default function NaturezaPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onChange("JUDICIAL")}
        aria-pressed={value === "JUDICIAL"}
        className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
          value === "JUDICIAL"
            ? "border-gold-600 bg-gold-500/10 dark:border-gold-400 dark:bg-gold-400/10"
            : "border-navy-800/10 bg-white hover:border-gold-500/40 dark:border-white/10 dark:bg-navy-900 dark:hover:border-gold-400/40"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            value === "JUDICIAL" ? "bg-gold-600 text-white dark:bg-gold-500" : "bg-gold-500/15 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300"
          }`}
        >
          <Scale size={18} />
        </span>
        <span>
          <span className="block font-serif font-bold text-navy-900 dark:text-cream-50">Processo Judicial</span>
          <span className="block text-xs text-navy-800/60 dark:text-cream-50/60">Tramita no Poder Judiciário</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange("ADMINISTRATIVO")}
        aria-pressed={value === "ADMINISTRATIVO"}
        className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
          value === "ADMINISTRATIVO"
            ? "border-bordo-600 bg-bordo-600/10 dark:border-bordo-400 dark:bg-bordo-600/20"
            : "border-navy-800/10 bg-white hover:border-bordo-600/40 dark:border-white/10 dark:bg-navy-900 dark:hover:border-bordo-400/40"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            value === "ADMINISTRATIVO" ? "bg-bordo-700 text-white dark:bg-bordo-600" : "bg-bordo-600/15 text-bordo-700 dark:bg-bordo-400/15 dark:text-bordo-300"
          }`}
        >
          <Landmark size={18} />
        </span>
        <span>
          <span className="block font-serif font-bold text-navy-900 dark:text-cream-50">Processo Administrativo</span>
          <span className="block text-xs text-navy-800/60 dark:text-cream-50/60">Tramita em órgão administrativo</span>
        </span>
      </button>
    </div>
  );
}
