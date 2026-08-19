"use client";

import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";

// Guias de duplo clique (estilo navegador) — mesmo TabsProvider do resto da casca. Renderizada
// dentro da faixa única de topo (components/TopBar.tsx, ver documento 02 do handoff do
// redesenho: "guias assumem o cluster de ações"). Sem abas abertas não renderiza nada — a faixa
// continua de pé por causa da busca e do cluster de ações ao lado dela; só a área das guias
// fica vazia.
export default function GuiasBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={clsx(
            "shrink-0 h-8 max-w-[210px] flex items-center gap-1.5 pl-3 pr-1.5 text-[11px] font-semibold border-t-2 transition-colors",
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
              "p-0.5 shrink-0",
              // Cor do "x" depende do fundo do próprio chip (claro quando ativo, grafite escuro
              // quando inativo) — não dá pra usar só --tx-2 aqui, ele inverteria errado num dos
              // dois fundos conforme o tema do site.
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
