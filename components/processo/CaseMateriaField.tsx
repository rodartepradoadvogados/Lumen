"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MATERIA_OPTIONS } from "@/lib/caseMaterias";

// Matéria do processo — multi-seleção por chips, emitindo um <input type="hidden" name="materias">
// por item escolhido (formData.getAll("materias") no chamador, mesmo padrão de ClientPicker/
// OpposingPartyFields para listas de tamanho variável). Case.area (legado) é derivado do primeiro
// item escolhido no servidor (ver lib/caseMaterias.ts:deriveArea) — este campo não escreve nele.
export default function CaseMateriaField({ defaultValue = [] }: { defaultValue?: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const disponiveis = MATERIA_OPTIONS.filter((m) => !selected.includes(m));

  function add(m: string) {
    if (!m || selected.includes(m)) return;
    setSelected((prev) => [...prev, m]);
  }

  function remove(m: string) {
    setSelected((prev) => prev.filter((x) => x !== m));
  }

  return (
    <div>
      <label className="text-xs font-medium text-tx-2">Matéria</label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {selected.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-marca-bg text-marca-tx"
          >
            {m}
            <input type="hidden" name="materias" value={m} />
            <button type="button" onClick={() => remove(m)} className="hover:text-atencao">
              <X size={11} />
            </button>
          </span>
        ))}
        {disponiveis.length > 0 && (
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            className="text-xs font-medium border border-dashed border-regua rounded-full px-2.5 py-1 bg-transparent text-tx-2"
          >
            <option value="">+ adicionar</option>
            {disponiveis.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
