"use client";

import { useState, useTransition } from "react";
import { runDjenConnectionTest } from "@/lib/actions/settings";
import type { DjenTestResult } from "@/lib/djenSync";
import { Radar } from "lucide-react";

export default function TestDjenButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DjenTestResult[] | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await runDjenConnectionTest();
            if (r.error) setError(r.error);
            setResults(r.results ?? null);
          })
        }
        disabled={pending}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Radar size={15} /> {pending ? "Consultando..." : "Testar conexão com o DJEN (CNJ)"}
      </button>
      {error && <p className="text-sm mt-2 text-red-600">{error}</p>}
      {results && (
        <div className="mt-3 space-y-3">
          {results.map((r) => (
            <div key={r.numeroOab} className="border border-navy-800/10 rounded-lg p-3">
              <p className="text-xs font-semibold text-navy-900">
                {r.label} — OAB {r.numeroOab}/{r.ufOab} {r.ok ? "✅" : "❌"} {r.status ? `(HTTP ${r.status})` : ""}
              </p>
              {r.error && <p className="text-xs text-red-600 mt-1">{r.error}</p>}
              {r.sample !== undefined && (
                <pre className="text-[11px] bg-cream-50 rounded-lg p-2 mt-2 overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
                  {JSON.stringify(r.sample, null, 2)}
                </pre>
              )}
            </div>
          ))}
          <p className="text-[11px] text-navy-800/50">
            Copie o resultado acima e envie para conferirmos o formato antes de ligar a sincronização automática.
          </p>
        </div>
      )}
    </div>
  );
}
