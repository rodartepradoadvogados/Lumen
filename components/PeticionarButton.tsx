"use client";

import { useState, useTransition } from "react";
import { FileEdit } from "lucide-react";
import { criarPeticao } from "@/lib/actions/peticionar";

export default function PeticionarButton({ compact, caseId }: { compact?: boolean; caseId?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    // As duas abas precisam abrir de forma SÍNCRONA, dentro do próprio clique — se
    // esperarmos a Server Action (criarPeticao) responder antes de chamar window.open,
    // o navegador perde o gesto do usuário e bloqueia como pop-up. Por isso abrimos a
    // aba do Drive em branco já aqui, e só navegamos ela pra URL real quando a cópia
    // terminar de ser criada (a aba de pesquisa já pode abrir direto, sua URL é fixa).
    const driveWindow = window.open("", "_blank", "noopener,noreferrer");
    window.open("/peticionar", "_blank", "noopener,noreferrer");

    startTransition(async () => {
      const result = await criarPeticao(caseId);
      if (result.error) {
        setError(result.error);
        driveWindow?.close();
        return;
      }
      if (driveWindow && result.driveUrl) driveWindow.location.href = result.driveUrl;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title="Gera uma cópia nova do timbrado do escritório no Google Docs para peticionar"
        className={
          compact
            ? "flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 disabled:opacity-50"
            : "hidden sm:flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
        }
      >
        <FileEdit size={compact ? 12 : 16} /> {pending ? "Gerando..." : "Peticionar"}
      </button>
      {error && (
        <p className="absolute top-full left-0 mt-1 w-56 text-[11px] text-red-600 bg-white dark:bg-navy-900 border border-red-200 rounded-lg px-2 py-1 z-30 shadow-pop">
          {error}
        </p>
      )}
    </div>
  );
}
