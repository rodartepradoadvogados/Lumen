"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ASSUNTOS_CATALOG } from "@/lib/assuntosCatalog";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Dois campos de texto livre (Case.assuntos, guardado como lista mas só 2 posições na tela hoje)
// + pop-up de referência com exemplos por matéria — clicar num exemplo preenche o primeiro campo
// vazio, mas o texto continua 100% livre (o pop-up nunca trava o que pode ser digitado).
export default function AssuntosField({ defaultValue = [], inputClassName }: { defaultValue?: string[]; inputClassName: string }) {
  const [a1, setA1] = useState(defaultValue[0] ?? "");
  const [a2, setA2] = useState(defaultValue[1] ?? "");
  const [open, setOpen] = useState(false);
  useEscapeToClose(open, () => setOpen(false));

  function applyExample(assunto: string) {
    if (!a1) setA1(assunto);
    else if (!a2) setA2(assunto);
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Assuntos</label>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline">
          Ver exemplos
        </button>
      </div>
      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input name="assuntos" value={a1} onChange={(e) => setA1(e.target.value)} placeholder="Assunto 1" className={inputClassName} />
        <input name="assuntos" value={a2} onChange={(e) => setA2(e.target.value)} placeholder="Assunto 2" className={inputClassName} />
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm bg-white dark:bg-navy-950 rounded-xl border border-navy-800/10 dark:border-white/15 shadow-pop overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
              <div>
                <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Assuntos por matéria</h3>
                <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Só um guia — clique num item para preencher</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
              {ASSUNTOS_CATALOG.map((entry) => (
                <div key={entry.materia}>
                  <p className="text-xs font-semibold text-gold-700 dark:text-gold-400 mb-1">{entry.materia}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.assuntos.map((assunto) => (
                      <button
                        key={assunto}
                        type="button"
                        onClick={() => applyExample(assunto)}
                        className="text-xs px-2.5 py-1 rounded-full border border-navy-800/12 dark:border-white/15 text-navy-800/70 dark:text-cream-50/70 hover:bg-cream-100 dark:hover:bg-white/5"
                      >
                        {assunto}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
