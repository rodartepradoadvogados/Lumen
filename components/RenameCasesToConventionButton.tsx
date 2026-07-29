"use client";

import { useState } from "react";
import Link from "next/link";
import { applyClientOpponentNamingConvention, type CaseNamingResult } from "@/lib/actions/cases";
import { SquarePen } from "lucide-react";

export default function RenameCasesToConventionButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CaseNamingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (
      !window.confirm(
        'Isso vai renomear todos os processos já existentes (que tenham cliente e parte adversa cadastrados) para o padrão "Cliente x Parte Adversa" — inclusive a pasta deles no Drive, se já existir. Continuar?'
      )
    ) {
      return;
    }
    setPending(true);
    setResult(null);
    setError(null);
    const res = await applyClientOpponentNamingConvention();
    if ("error" in res) setError(res.error);
    else setResult(res);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit disabled:opacity-50"
      >
        <SquarePen size={16} /> {pending ? "Aplicando..." : 'Aplicar padrão "Cliente x Parte Adversa" aos processos existentes'}
      </button>
      {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}
      {result && (
        <div className="text-xs text-navy-800/70 dark:text-cream-50/70 bg-cream-50 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg px-3 py-2 space-y-2">
          <p>
            {result.renamed} processo(s) renomeado(s)
            {result.driveRenameErrors > 0 && ` · ${result.driveRenameErrors} pasta(s) no Drive não puderam ser renomeadas (o sync diário vai sinalizar isso na Central de Alertas)`}
          </p>
          {result.withoutClient.length > 0 && (
            <div>
              <p className="font-semibold text-navy-800 dark:text-cream-50">
                {result.withoutClient.length} processo(s) sem cliente cadastrado — não deu pra aplicar o padrão:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {result.withoutClient.map((c) => (
                  <li key={c.id}>
                    <Link href={`/processos/${c.id}`} className="text-gold-700 dark:text-gold-400 hover:underline">
                      {c.title}
                    </Link>
                    {c.processNumber && <span className="text-navy-800/45 dark:text-cream-50/45"> · {c.processNumber}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
