"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Botão genérico de copiar-para-área-de-transferência com feedback visual (ícone vira
// check por 1.5s) — mesmo padrão do ProcessNumberChip, só que pra qualquer texto (aqui,
// o conteúdo da publicação/andamento).
export default function CopyButton({
  text,
  label = "Copiar",
  showLabel = true,
  className,
}: {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      data-tip={copied ? "Copiado!" : label}
      className={
        className ??
        "flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 rounded-lg bg-sf-apoio hover:bg-regua"
      }
    >
      {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
      {showLabel && <span>{copied ? "Copiado!" : label}</span>}
    </button>
  );
}
