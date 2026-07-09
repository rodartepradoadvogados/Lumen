"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runJusbrasilSync } from "@/lib/actions/settings";
import type { SyncResult } from "@/lib/jusbrasilEmailSync";
import { RefreshCw } from "lucide-react";

export default function SyncJusbrasilButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await runJusbrasilSync();
            setResult(r);
            router.refresh();
          })
        }
        disabled={pending}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <RefreshCw size={15} className={pending ? "animate-spin" : ""} /> {pending ? "Sincronizando..." : "Sincronizar Jusbrasil agora"}
      </button>
      {result && (
        <div className="text-sm mt-2 space-y-1">
          <p className="text-navy-800">
            {result.accountsScanned} caixa(s) verificada(s), {result.found} e-mail(s) encontrado(s), {result.created} publicação(ões) criada(s), {result.skipped} já existente(s)
          </p>
          {result.errors.length > 0 && (
            <ul className="text-red-600 list-disc list-inside">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
