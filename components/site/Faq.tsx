"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export type Pergunta = { id: string; pergunta: string; resposta: React.ReactNode };

// Perguntas de quem decide. Botão dentro de <h3>, `aria-expanded`/`aria-controls`, região rotulada
// pelo botão. O conteúdo fechado fica `visibility:hidden` (não focável, não lido) e a abertura
// desliza por `grid-template-rows` (Capa: animação só de feedback; sem `height` animada).
export default function Faq({ itens }: { itens: Pergunta[] }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-8 border-t-2 border-regua-forte max-w-[860px]">
      {itens.map((it) => {
        const aberto = !!abertos[it.id];
        return (
          <div key={it.id} className="border-b border-regua">
            <h3>
              <button
                type="button"
                id={`q-${it.id}`}
                aria-expanded={aberto}
                aria-controls={`r-${it.id}`}
                onClick={() => setAbertos((a) => ({ ...a, [it.id]: !a[it.id] }))}
                className="w-full flex items-center justify-between gap-4 text-left min-h-[64px] py-3.5 bg-transparent text-destaque font-semibold text-tx hover:text-marca-tx transition-colors duration-100 ease-out"
              >
                {it.pergunta}
                <Plus
                  size={22}
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${aberto ? "rotate-45" : ""}`}
                />
              </button>
            </h3>
            <div
              id={`r-${it.id}`}
              role="region"
              aria-labelledby={`q-${it.id}`}
              className={`grid transition-[grid-template-rows,visibility] duration-[250ms] ease-out motion-reduce:transition-none ${aberto ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible"}`}
            >
              <div className="overflow-hidden">
                <div className="pb-5 pr-10 text-capa-corpo text-tx-2 max-w-[64ch]">{it.resposta}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
