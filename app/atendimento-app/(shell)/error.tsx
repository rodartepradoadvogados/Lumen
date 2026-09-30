"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

// Erro ao carregar uma tela do aplicativo: mensagem em português, sem jargão, e "Tentar de novo"
// (reexecuta a tela). O detalhe técnico fica no console, não na tela.
export default function ErroDoAtendimentoApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <AlertCircle size={36} aria-hidden="true" className="text-atd-terciario" />
      <h1 className="text-guia font-bold text-tx">Não foi possível carregar</h1>
      <p className="text-corpo text-atd-previa">Confira a internet e tente de novo. Se continuar, avise a equipe.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-ouro px-6 text-corpo font-bold text-atd-ouro-tx active:scale-95"
      >
        <RotateCcw size={18} aria-hidden="true" /> Tentar de novo
      </button>
    </div>
  );
}
