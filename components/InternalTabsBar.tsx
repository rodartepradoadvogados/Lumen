"use client";

import { X, FileText } from "lucide-react";
import { useTabs } from "@/components/TabsProvider";

// Abas internas (estilo navegador) renderizadas DENTRO da TopBar, ao lado da busca — ver
// proposta de remodelação do portal: antes ficavam numa faixa própria abaixo do cabeçalho
// (components/AppShell.tsx), agora entram aqui. O estado (quais abas, qual ativa) mora em
// components/TabsProvider.tsx, compartilhado com AppShell (que decide qual <iframe> mostrar).
// Some por completo sem nenhuma aba aberta — não ocupa espaço à toa na barra.
export default function InternalTabsBar() {
  const { tabs, activeTabId, activateTab, closeTab, goToLiveView } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-thin max-w-[420px]">
      <div className="w-px h-6 bg-navy-800/10 dark:bg-white/10 shrink-0 mr-1" />
      <button
        type="button"
        onClick={goToLiveView}
        className={`shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
          activeTabId === null
            ? "bg-[rgba(110,13,37,0.08)] border-transparent text-[#6e0d25] dark:bg-[rgba(201,106,128,0.14)] dark:text-[#c96a80]"
            : "border-navy-800/10 dark:border-white/10 text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
        }`}
      >
        Principal
      </button>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold pl-2.5 pr-1.5 py-1.5 rounded-lg border transition-colors ${
            activeTabId === tab.id
              ? "bg-[rgba(110,13,37,0.08)] border-transparent text-[#6e0d25] dark:bg-[rgba(201,106,128,0.14)] dark:text-[#c96a80]"
              : "border-navy-800/10 dark:border-white/10 text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
          }`}
        >
          <FileText size={13} className="shrink-0" />
          <button type="button" onClick={() => activateTab(tab.id)} className="max-w-[150px] truncate">
            {tab.label}
          </button>
          {tab.hasUpdate && activeTabId !== tab.id && (
            <span className="h-1.5 w-1.5 rounded-full bg-[#b8860b] shrink-0" aria-label="Atualizada" />
          )}
          <button
            type="button"
            onClick={() => closeTab(tab.id)}
            aria-label={`Fechar aba ${tab.label}`}
            className="p-0.5 rounded hover:bg-navy-900/10 dark:hover:bg-white/10 shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
