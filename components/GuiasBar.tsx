"use client";

import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";

// Primeira linha da janela no modo de visualização Bancada (DESIGN-SYSTEM.md §3) — mesmas abas
// internas de components/InternalTabsBar.tsx, consumindo o MESMO TabsProvider (nenhum estado
// novo de abas). A diferença é só onde a barra aparece: aqui é sempre visível (mesmo sem
// nenhuma aba aberta, já que esta barra É a própria primeira linha da janela, acima até da barra
// de menus — components/TopMenuBar.tsx), enquanto InternalTabsBar (modo Régua, dentro da
// TopBar) some por completo sem abas. components/AppShell.tsx decide qual dos dois monta,
// conforme components/ViewModeProvider.tsx.
export default function GuiasBar() {
  const { tabs, activeTabId, activateTab, closeTab, goToLiveView } = useTabs();

  return (
    <div className="h-[27px] shrink-0 flex items-end bg-grafite-800 px-2 gap-0.5 overflow-x-auto scrollbar-thin">
      <button
        type="button"
        onClick={goToLiveView}
        className={clsx(
          "shrink-0 h-[27px] flex items-center px-3 text-[11px] font-semibold rounded-t border-t-2 transition-colors",
          activeTabId === null
            ? "bg-sf text-tx border-acao"
            : "text-rail-tx border-transparent hover:text-white"
        )}
      >
        Principal
      </button>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={clsx(
            "shrink-0 h-[27px] max-w-[210px] flex items-center gap-1.5 pl-3 pr-1.5 text-[11px] font-semibold rounded-t border-t-2 transition-colors",
            activeTabId === tab.id
              ? "bg-sf text-tx border-acao"
              : "text-rail-tx border-transparent hover:text-white"
          )}
        >
          <FileText size={11} className="shrink-0" />
          <button type="button" onClick={() => activateTab(tab.id)} className="truncate">
            {tab.label}
          </button>
          {tab.hasUpdate && activeTabId !== tab.id && (
            <span className="h-1.5 w-1.5 rounded-full bg-marca shrink-0" aria-label="Atualizada" />
          )}
          <button
            type="button"
            onClick={() => closeTab(tab.id)}
            aria-label={`Fechar aba ${tab.label}`}
            className={clsx(
              "p-0.5 rounded shrink-0",
              // Cor do "x" depende do fundo do próprio chip (claro quando ativo, grafite escuro
              // quando inativo) — não dá pra usar só --tx-2 aqui, ele inverteria errado num dos
              // dois fundos conforme o tema do site (ver DESIGN-SYSTEM.md §3: "Botão de fechar —
              // --tx-2 a 45%", que pressupõe fundo --sf-superficie, o caso ativo).
              activeTabId === tab.id ? "text-tx-2/45 hover:text-tx" : "text-white/45 hover:text-white"
            )}
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
