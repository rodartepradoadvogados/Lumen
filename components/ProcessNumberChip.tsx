"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Chip do número do processo, usado dentro de AlertRow (Central de Alertas do Painel e
// página /alertas). Um clique copia o número para a área de transferência — precisa de
// stopPropagation/preventDefault porque o alerta inteiro já é clicável (abre o compromisso),
// e o clique no chip não deve disparar essa navegação.
export default function ProcessNumberChip({ processNumber }: { processNumber: string }) {
  const [copied, setCopied] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(processNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-tip={copied ? "Copiado!" : "Copiar número do processo"}
      className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-navy-800/55 dark:text-cream-50/55 bg-navy-900/5 dark:bg-white/10 hover:bg-navy-900/10 dark:hover:bg-white/15 rounded px-1.5 py-0.5 transition-colors"
    >
      {copied ? <Check size={11} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={11} />}
      {processNumber}
    </button>
  );
}
