"use client";

import { Scale, Landmark } from "lucide-react";

// Primeiro passo do cadastro de processo (que "tem número e tramita em órgão", ver
// lib/caseNatureza.ts): decide se é Judicial (Poder Judiciário) ou Administrativo (órgão
// administrativo). Os dois cards usam o mesmo tratamento de seleção (azul-tinta de ação) —
// ouro e vinho não podem virar fundo de botão/card selecionável (DESIGN-SYSTEM.md §16), então
// a distinção visual entre as duas opções fica só no ícone (Scale x Landmark) e no rótulo.
// Dois cards grandes em vez de um <select> porque essa é A decisão que muda o resto do
// formulário embaixo (tribunal x órgão, esfera/matéria) — precisa ficar óbvia antes de
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
        className={`flex items-start gap-3 border-2 p-4 text-left transition-colors ${
          value === "JUDICIAL" ? "border-acao bg-acao-bg" : "border-regua bg-sf hover:border-acao/40"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center ${
            value === "JUDICIAL" ? "bg-acao text-acao-tx" : "bg-acao-bg text-acao"
          }`}
        >
          <Scale size={18} />
        </span>
        <span>
          <span className="block font-bold text-tx">Processo Judicial</span>
          <span className="block text-xs text-tx-2">Tramita no Poder Judiciário</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange("ADMINISTRATIVO")}
        aria-pressed={value === "ADMINISTRATIVO"}
        className={`flex items-start gap-3 border-2 p-4 text-left transition-colors ${
          value === "ADMINISTRATIVO" ? "border-acao bg-acao-bg" : "border-regua bg-sf hover:border-acao/40"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center ${
            value === "ADMINISTRATIVO" ? "bg-acao text-acao-tx" : "bg-acao-bg text-acao"
          }`}
        >
          <Landmark size={18} />
        </span>
        <span>
          <span className="block font-bold text-tx">Processo Administrativo</span>
          <span className="block text-xs text-tx-2">Tramita em órgão administrativo</span>
        </span>
      </button>
    </div>
  );
}
