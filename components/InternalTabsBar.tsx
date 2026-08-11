"use client";

import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";
import { useViewMode } from "@/components/ViewModeProvider";

// Abas internas (estilo navegador) renderizadas DENTRO da TopBar, ao lado da busca — ver
// proposta de remodelação do portal: antes ficavam numa faixa própria abaixo do cabeçalho
// (components/AppShell.tsx), agora entram aqui. O estado (quais abas, qual ativa) mora em
// components/TabsProvider.tsx, compartilhado com AppShell (que decide qual <iframe> mostrar).
// Some por completo sem nenhuma aba aberta — não ocupa espaço à toa na barra. No modo de
// visualização Bancada (components/ViewModeProvider.tsx), quem mostra as mesmas abas é
// components/GuiasBar.tsx (linha própria no topo da janela) — para não duplicar a mesma lista
// duas vezes na tela, este componente some inteiro nesse modo, mesmo com abas abertas.
export default function InternalTabsBar() {
  const { tabs, activeTabId, activateTab, closeTab, goToLiveView } = useTabs();
  const { viewMode } = useViewMode();

  if (viewMode === "bancada" || tabs.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-thin max-w-[420px]">
      <div className="w-px h-6 bg-regua shrink-0 mr-1" />
      <button
        type="button"
        onClick={goToLiveView}
        className={clsx(
          "shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
          activeTabId === null
            ? "bg-acao-bg border-transparent text-acao"
            : "border-regua text-tx-2 hover:text-tx"
        )}
      >
        Principal
      </button>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={clsx(
            "shrink-0 flex items-center gap-1.5 text-xs font-semibold pl-2.5 pr-1.5 py-1.5 rounded-lg border transition-colors",
            activeTabId === tab.id
              ? "bg-acao-bg border-transparent text-acao"
              : "border-regua text-tx-2 hover:text-tx"
          )}
        >
          <FileText size={13} className="shrink-0" />
          <button type="button" onClick={() => activateTab(tab.id)} className="max-w-[150px] truncate">
            {tab.label}
          </button>
          {tab.hasUpdate && activeTabId !== tab.id && (
            <span className="h-1.5 w-1.5 rounded-full bg-marca shrink-0" aria-label="Atualizada" />
          )}
          <button
            type="button"
            onClick={() => closeTab(tab.id)}
            aria-label={`Fechar aba ${tab.label}`}
            className="p-0.5 rounded hover:bg-sf-apoio shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
