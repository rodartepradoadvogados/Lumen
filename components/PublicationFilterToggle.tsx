"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

// No celular os filtros ficam recolhidos atrás de "Filtros (n)": sem isso, cinco selects empilhavam
// a fila para depois da dobra (primeira publicação em y 517 de 780). No computador aparecem sempre.
export default function PublicationFilterToggle({ ativos, children }: { ativos: number; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="pub-filtros-campos"
        onClick={() => setAberto((v) => !v)}
        className="md:hidden min-h-11 px-3 inline-flex items-center gap-1.5 text-sm font-semibold border border-regua-forte bg-sf text-tx"
      >
        <SlidersHorizontal size={15} aria-hidden="true" /> {ativos > 0 ? `Filtros (${ativos})` : "Filtros"}
      </button>
      <div id="pub-filtros-campos" className={`${aberto ? "flex" : "hidden"} md:contents flex-wrap gap-2 basis-full md:basis-auto`}>
        {children}
      </div>
    </>
  );
}
