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
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2 transition-colors"
      >
        <Radar size={15} /> {pending ? "Consultando..." : "Testar conexão com o DJEN (CNJ)"}
      </button>
      {error && <p className="text-sm mt-2 text-vinho">{error}</p>}
      {results && (
        <div className="mt-3 space-y-3">
          {results.map((r) => (
            <div key={r.numeroOab} className={`border-l-4 ${r.ok ? "border-concluido" : "border-vinho"} bg-sf-apoio p-3`}>
              <p className="text-xs font-semibold text-tx">
                {r.label} — OAB {r.numeroOab}/{r.ufOab} {r.ok ? "✅" : "❌"} {r.status ? `(HTTP ${r.status})` : ""}
                {r.cookieObtained !== undefined && ` · cookie de sessão: ${r.cookieObtained ? "obtido" : "não obtido"}`}
              </p>
              {r.error && <p className="text-xs text-vinho mt-1">{r.error}</p>}
              {r.sample !== undefined && (
                // Cor explícita: um <pre> sem text-* herda do ancestral mais próximo que definir
                // color — qualquer card acima na árvore que não tenha migrado pra token deixa este
                // bloco ilegível no Noite sem nenhum aviso. Não depender de herança.
                <pre className="text-[11px] text-tx bg-sf p-2 mt-2 overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
                  {JSON.stringify(r.sample, null, 2)}
                </pre>
              )}
            </div>
          ))}
          <p className="text-[11px] text-tx-2">
            Copie o resultado acima e envie para conferirmos o formato antes de ligar a sincronização automática.
          </p>
        </div>
      )}
    </div>
  );
}
