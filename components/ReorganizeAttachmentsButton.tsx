"use client";

import { useState } from "react";
import { reorganizeExistingAttachments, type ReorgResult } from "@/lib/actions/driveReorg";
import { FolderTree } from "lucide-react";

export default function ReorganizeAttachmentsButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReorgResult | null>(null);

  async function run() {
    if (
      !window.confirm(
        "Isso vai mover todos os anexos de Processos e Atendimentos já existentes no Drive para pastas organizadas por processo/atendimento e por categoria. Pode levar alguns minutos, dependendo da quantidade. Continuar?"
      )
    ) {
      return;
    }
    setPending(true);
    setResult(null);
    const res = await reorganizeExistingAttachments();
    setResult(res);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit disabled:opacity-50"
      >
        <FolderTree size={16} /> {pending ? "Reorganizando..." : "Reorganizar anexos existentes no Drive"}
      </button>
      {result && (
        <div className="text-xs text-navy-800/70 dark:text-cream-50/70 bg-cream-50 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg px-3 py-2">
          <p>
            {result.moved} arquivo(s) movido(s) · {result.skipped} ignorado(s) (link de outro serviço, sem arquivo no Drive)
            {result.errors.length > 0 && ` · ${result.errors.length} erro(s)`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-bordo-600 dark:text-bordo-400">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {result.errors.length > 10 && <li>...e mais {result.errors.length - 10}.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
