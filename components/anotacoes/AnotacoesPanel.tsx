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
      className="hidden md:flex shrink-0 h-full flex-col border-l border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 transition-[width] duration-200 overflow-hidden"
      style={{ width: isOpen ? ANOTACOES_PANEL_WIDTH : ANOTACOES_STRIP_WIDTH }}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Anotações"
          title="Anotações"
          className="flex-1 flex flex-col items-center gap-3 pt-4 text-navy-800/50 dark:text-cream-50/50 hover:text-gold-700 dark:hover:text-gold-400 hover:bg-cream-100/60 dark:hover:bg-white/5 transition-colors"
        >
          <NotebookPen size={17} />
          <span className="text-[10px] font-bold tracking-widest [writing-mode:vertical-rl]">ANOTAÇÕES</span>
        </button>
      ) : (
        <>
          <div className="shrink-0 flex items-center justify-between gap-1 pl-3 pr-2 h-12 border-b border-navy-800/10 dark:border-white/10">
            <h3 className="font-serif font-bold text-sm text-navy-900 dark:text-cream-50">Anotações</h3>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={addDraft}
                disabled={drafts.length >= 2}
                title="Nova anotação"
                aria-label="Nova anotação"
                className="p-1.5 rounded-lg text-navy-800/50 dark:text-cream-50/50 hover:bg-gold-500/15 hover:text-gold-700 dark:hover:text-gold-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-navy-800/50 transition-colors"
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Recolher painel de Anotações"
                aria-label="Recolher painel de Anotações"
                className="p-1.5 rounded-lg text-navy-800/50 dark:text-cream-50/50 hover:bg-navy-800/10 dark:hover:bg-white/10 transition-colors"
              >
                <PanelRightClose size={16} />
              </button>
            </div>
          </div>

          <div
            className={
              drafts.length === 2
                ? "flex-1 min-h-0 flex flex-col divide-y divide-navy-800/10 dark:divide-white/10"
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
