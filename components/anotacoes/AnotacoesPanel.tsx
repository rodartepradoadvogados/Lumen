"use client";

import { NotebookPen, Plus, PanelRightClose } from "lucide-react";
import { useAnotacoes, ANOTACOES_PANEL_WIDTH, ANOTACOES_STRIP_WIDTH } from "./AnotacoesContext";
import AnotacaoDraftForm from "./AnotacaoDraftForm";

// Painel global "Anotações": faixa fina fixa na borda direita, sempre visível em qualquer página
// (montado uma única vez em app/(app)/layout.tsx, dentro de <AnotacoesProvider>). Fechado, ocupa
// só ANOTACOES_STRIP_WIDTH; aberto, ocupa ANOTACOES_PANEL_WIDTH (mesma largura w-64 da Sidebar
// esquerda — ver AnotacoesContext.tsx). É um item de flexbox normal (não `fixed`, não overlay)
// dentro da linha principal do AppShell — por isso empurra o conteúdo central, nunca cobre nada.
export default function AnotacoesPanel() {
  const { isOpen, setOpen, drafts, addDraft } = useAnotacoes();

  return (
    <div
      className="hidden md:flex shrink-0 h-full flex-col border-l border-regua bg-sf transition-[width] duration-200 overflow-hidden"
      style={{ width: isOpen ? ANOTACOES_PANEL_WIDTH : ANOTACOES_STRIP_WIDTH }}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Anotações"
          title="Anotações"
          className="flex-1 flex flex-col items-center gap-3 pt-4 text-tx-2 hover:text-marca-tx hover:bg-sf-apoio transition-colors"
        >
          <NotebookPen size={17} />
          <span className="text-[10px] font-bold tracking-widest [writing-mode:vertical-rl]">ANOTAÇÕES</span>
        </button>
      ) : (
        <>
          <div className="shrink-0 flex items-center justify-between gap-1 pl-3 pr-2 h-12 border-b border-regua">
            <h3 className=" font-bold text-sm text-tx">Anotações</h3>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={addDraft}
                disabled={drafts.length >= 2}
                title="Nova anotação"
                aria-label="Nova anotação"
                className="p-1.5 text-tx-2 hover:bg-marca-bg hover:text-marca-tx disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-tx-2 transition-colors"
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Recolher painel de Anotações"
                aria-label="Recolher painel de Anotações"
                className="p-1.5 text-tx-2 hover:bg-sf-apoio transition-colors"
              >
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>

          <div
            className={
              drafts.length === 2
                ? "flex-1 min-h-0 flex flex-col divide-y divide-regua"
                : "flex-1 min-h-0 overflow-y-auto scrollbar-thin"
            }
          >
            {drafts.map((draft) => (
              <AnotacaoDraftForm key={draft.id} draft={draft} splitView={drafts.length === 2} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
