"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";

// Os três estados que toda página de Gestão precisa ter (o cabeçalho e as guias continuam na tela
// em todos eles — nada colapsa para um spinner de meia altura):
//   vazio      -> <EmptyState> de components/ui.tsx, com a frase certa e a saída
//   carregando -> <EsqueletoDeCartao> (e app/(app)/loading.tsx, que guarda o mesmo desenho)
//   erro       -> <ErroDeBloco>: texto em português, role="alert" e "Tentar de novo"

export function ErroDeBloco({ titulo = "Não foi possível carregar este bloco", detalhe, onTentar }: { titulo?: string; detalhe?: string; onTentar?: () => void }) {
  const router = useRouter();
  return (
    <div role="alert" className="border-t-2 border-urgente bg-urgente-bg p-5 flex items-start gap-3">
      <AlertTriangle size={18} aria-hidden="true" className="text-urgente shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-tx">{titulo}</p>
        {detalhe && <p className="text-sm text-tx-2 mt-1">{detalhe}</p>}
        <button
          type="button"
          onClick={onTentar ?? (() => router.refresh())}
          className="mt-3 inline-flex items-center gap-2 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold px-3 transition-colors"
        >
          <RotateCw size={14} aria-hidden="true" /> Tentar de novo
        </button>
      </div>
    </div>
  );
}

export function EsqueletoDeCartao({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="bg-sf border-t-2 border-regua-forte p-5 space-y-3" aria-hidden="true">
      <div className="h-4 w-40 bg-sf-apoio animate-pulse motion-reduce:animate-none" />
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-3 bg-sf-apoio animate-pulse motion-reduce:animate-none" style={{ width: `${88 - i * 9}%` }} />
      ))}
    </div>
  );
}
