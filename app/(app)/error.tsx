"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

// Error boundary do App Router para a área de conteúdo do site (mesmo alcance de
// app/(app)/loading.tsx: envolve o page.tsx de cada rota, não a Sidebar/TopBar do layout, que
// seguem de pé mesmo se a página quebrar). Sem isto, qualquer exceção não tratada numa página
// (erro de banco, bug de renderização etc.) derrubava a tela inteira num erro genérico do
// Next.js — agora mostra uma mensagem compreensível com opção de tentar de novo ou voltar ao Painel.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-atencao/10 flex items-center justify-center">
          <AlertTriangle size={22} className="text-atencao" />
        </div>
        <h1 className="font-serif text-xl font-bold text-tx">Algo deu errado</h1>
        <p className="text-sm text-tx-2">
          Não foi possível carregar esta página. Tente novamente ou volte para o Painel.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            <RotateCw size={15} /> Tentar novamente
          </button>
          <Link
            href="/painel"
            className="inline-flex items-center gap-2 text-sm font-semibold text-tx-2 hover:text-tx px-4 py-2.5 rounded-lg hover:bg-sf-apoio"
          >
            Voltar ao Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
