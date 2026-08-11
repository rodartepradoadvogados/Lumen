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
        <label className="text-xs font-medium text-tx-2">Assuntos</label>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-marca-tx hover:underline">
          Ver exemplos
        </button>
      </div>
      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input name="assuntos" value={a1} onChange={(e) => setA1(e.target.value)} placeholder="Assunto 1" className={inputClassName} />
        <input name="assuntos" value={a2} onChange={(e) => setA2(e.target.value)} placeholder="Assunto 2" className={inputClassName} />
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] bg-grafite-900/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm bg-sf rounded-xl border border-regua shadow-pop overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-regua">
              <div>
                <h3 className="font-serif font-bold text-tx text-sm">Assuntos por matéria</h3>
                <p className="text-[11px] text-tx-2">Só um guia — clique num item para preencher</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
              {ASSUNTOS_CATALOG.map((entry) => (
                <div key={entry.materia}>
                  <p className="text-xs font-semibold text-marca-tx mb-1">{entry.materia}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.assuntos.map((assunto) => (
                      <button
                        key={assunto}
                        type="button"
                        onClick={() => applyExample(assunto)}
                        className="text-xs px-2.5 py-1 rounded-full border border-regua text-tx-2 hover:bg-sf-apoio"
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
