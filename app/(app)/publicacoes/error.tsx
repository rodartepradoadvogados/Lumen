"use client";

import { TriangleAlert, RefreshCw } from "lucide-react";

// Erro ao montar a fila: aviso com role="alert" e "Tentar de novo". Sem isto a pessoa via a tela de
// erro genérica e não sabia se as publicações que via antes ainda valiam.
export default function ErroPublicacoes({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <div role="alert" className="max-w-xl border border-campo-risco-linha bg-campo-risco px-4 py-3 flex gap-3 items-start">
        <TriangleAlert size={20} className="text-risco-vencido-tx mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-tx">Não foi possível carregar a fila de publicações.</p>
          <p className="text-sm text-tx-2 mt-1">O que você viu antes pode estar desatualizado. Tente de novo; se persistir, confira as conexões.</p>
          <button type="button" onClick={reset} className="mt-3 min-h-11 px-4 inline-flex items-center gap-2 text-sm font-semibold border border-regua-forte bg-sf hover:bg-sf-apoio">
            <RefreshCw size={15} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      </div>
    </div>
  );
}
