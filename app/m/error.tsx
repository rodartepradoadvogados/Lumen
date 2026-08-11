"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

// Mesma ideia de app/(app)/error.tsx (ver comentário lá), versão mobile.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-4 flex items-center justify-center min-h-[40vh]">
      <div className="max-w-xs text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full bg-urgente-bg flex items-center justify-center">
          <AlertTriangle size={18} className="text-urgente" />
        </div>
        <h1 className="text-base font-bold text-tx">Algo deu errado</h1>
        <p className="text-xs text-tx-2">
          Não foi possível carregar esta página. Tente novamente ou volte para o Início.
        </p>
        <div className="flex flex-col items-stretch gap-2 pt-1">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 bg-acao text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            <RotateCw size={14} /> Tentar novamente
          </button>
          <Link
            href="/m"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-tx-2 px-4 py-2.5 rounded-lg hover:bg-sf-apoio"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}
