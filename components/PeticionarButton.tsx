"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FileEdit } from "lucide-react";
import PeticionarWizard from "@/components/PeticionarWizard";

// Antes de gerar a petição, abre um roteiro perguntando ONDE ela deve ficar salva — ver
// components/PeticionarWizard.tsx (o wizard é quem de fato chama criarPeticao e faz a dança de
// abrir as duas abas no clique síncrono; este componente só decide qual é a "tela atual" pro
// primeiro passo do roteiro).
export default function PeticionarButton({ compact, caseId }: { compact?: boolean; caseId?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // "Tela atual": quem já sabe o caseId (processo aberto, publicação vinculada a um processo)
  // passa a prop direto — não precisa adivinhar nada. O botão global da TopBar não recebe
  // caseId/attendanceId/assessoriaId nenhum (fica fora de qualquer página específica), então
  // deriva da própria URL: só nas três rotas de DETALHE de um registro (não a lista, nem "novo").
  const screenContext = caseId
    ? ({ type: "CASO", id: caseId } as const)
    : (() => {
        const m = pathname.match(/^\/(processos|atendimento|assessoria)\/([^/]+)$/);
        if (!m || m[2] === "novo") return null;
        const type = m[1] === "processos" ? "CASO" : m[1] === "atendimento" ? "ATENDIMENTO" : "ASSESSORIA";
        return { type, id: m[2] } as const;
      })();

  return (
    <>
      {/* Botão mais visível do produto (DESIGN-SYSTEM.md §4, "o caso que você citou"): primário
          de verdade, --acao/--acao-tx — nunca bordô/vinho, nunca `text-white` cravado (no Noite
          o azul de ação CLAREIA, e o texto vai ESCURO por cima dele; --acao-tx já resolve isso
          nos dois temas sozinho). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Gera uma cópia nova do timbrado do escritório no Google Docs para peticionar"
        className={
          compact
            ? "flex items-center gap-1 text-etiqueta font-semibold text-marca-tx hover:text-tx px-2.5 py-1 rounded-sm bg-acao-bg hover:bg-acao-bg"
            : "hidden sm:flex items-center gap-1.5 h-8 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-medium px-3.5 rounded-md transition-colors"
        }
      >
        <FileEdit size={compact ? 12 : 16} /> Peticionar
      </button>
      {open && <PeticionarWizard screenContext={screenContext} onClose={() => setOpen(false)} />}
    </>
  );
}
