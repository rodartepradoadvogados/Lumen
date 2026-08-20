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
      {/* Botão mais visível do produto (DESIGN-SYSTEM.md §4, "o caso que você citou"): primário
          de verdade, --acao/--acao-tx — nunca bordô/vinho, nunca `text-white` cravado (no Noite
          o azul de ação CLAREIA, e o texto vai ESCURO por cima dele; --acao-tx já resolve isso
          nos dois temas sozinho). */}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        title="Gera uma cópia nova do timbrado do escritório no Google Docs para peticionar"
        className={
          compact
            ? "flex items-center gap-1 text-[11px] font-semibold text-acao hover:text-acao-hover px-2.5 py-1 bg-acao-bg hover:bg-acao/20 disabled:opacity-50"
            : "hidden sm:flex items-center gap-1.5 h-8 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-medium px-3.5 transition-colors disabled:opacity-50"
        }
      >
        <FileEdit size={compact ? 12 : 16} /> {pending ? "Gerando..." : "Peticionar"}
      </button>
      {error && (
        <p className="absolute top-full left-0 mt-1 w-56 text-[11px] text-urgente bg-sf border border-urgente/30 px-2 py-1 z-30 shadow-menu">
          {error}
        </p>
      )}
    </div>
  );
}
