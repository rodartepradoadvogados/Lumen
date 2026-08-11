"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Chip do número do processo, usado dentro de AlertRow (Central de Alertas do Painel e
// página /alertas). Um clique copia o número para a área de transferência — precisa de
// stopPropagation/preventDefault porque o alerta inteiro já é clicável (abre o compromisso),
// e o clique no chip não deve disparar essa navegação.
//
// É um <span role="button">, não um <button>: AlertRow envolve o alerta inteiro num <button>
// (contas e prazos) ou num <a> (menções e follow-ups), e o HTML proíbe conteúdo interativo
// aninhado — o React acusava erro de hidratação sempre que um alerta trazia número de processo.
export default function ProcessNumberChip({ processNumber }: { processNumber: string }) {
  const [copied, setCopied] = useState(false);

  function copy(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(processNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") copy(e);
      }}
      data-tip={copied ? "Copiado!" : "Copiar número do processo"}
      className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-tx-2 bg-sf-apoio hover:bg-regua rounded px-1.5 py-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acao"
    >
      {copied ? <Check size={11} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={11} />}
      {processNumber}
    </span>
  );
}
