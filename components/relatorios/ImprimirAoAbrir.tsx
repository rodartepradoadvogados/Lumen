"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

// Dispara a janela de impressão do navegador assim que a folha termina de renderizar — é ela que
// oferece "Salvar como PDF". O pequeno atraso dá tempo de a folha assentar antes do diálogo abrir
// (chamar print() no mesmo tique do mount imprime a página ainda a meio caminho). O botão fica na
// tela para reimprimir sem precisar recarregar.
export default function ImprimirAoAbrir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="nao-imprimir" style={{ display: "flex", justifyContent: "center", padding: "14px 0 0" }}>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx rounded-lg px-4 py-2"
      >
        <Printer size={13} /> Imprimir / Salvar como PDF
      </button>
    </div>
  );
}
