"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

// Erro ao carregar uma tela do aplicativo: mensagem em português, sem jargão, e "Tentar de novo"
// (reexecuta a tela). O detalhe técnico fica no console, não na tela.
export default function ErroDoAtendimentoApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <h1 className="text-guia font-bold text-tx">Não foi possível carregar</h1>
      <p className="text-corpo text-tx-2">Confira a internet e tente de novo. Se continuar, avise a equipe.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-ouro-acento px-4 text-corpo font-bold text-ouro-tx hover:bg-ouro-hover"
      >
        <RotateCcw size={18} aria-hidden="true" /> Tentar de novo
      </button>
    </div>
  );
}
