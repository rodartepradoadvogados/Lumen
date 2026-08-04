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
        <div className="mx-auto h-12 w-12 rounded-full bg-bordo-700/10 dark:bg-bordo-400/15 flex items-center justify-center">
          <AlertTriangle size={22} className="text-bordo-700 dark:text-bordo-400" />
        </div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Algo deu errado</h1>
        <p className="text-sm text-navy-800/60 dark:text-cream-50/60">
          Não foi possível carregar esta página. Tente novamente ou volte para o Painel.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            <RotateCw size={15} /> Tentar novamente
          </button>
          <Link
            href="/painel"
            className="inline-flex items-center gap-2 text-sm font-semibold text-navy-800/70 dark:text-cream-50/70 hover:text-navy-900 dark:hover:text-cream-50 px-4 py-2.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10"
          >
            Voltar ao Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
