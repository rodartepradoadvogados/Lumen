"use client";

import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";

// Mesmas abas internas de components/InternalTabsBar.tsx (hoje o que está montado, dentro da
// TopBar), consumindo o MESMO TabsProvider (nenhum estado novo de abas) — pensada como a faixa
// própria de guias no topo da janela que o PR5 do plano de execução vai montar no lugar da
// TopBar atual (documento 02 do handoff, "guias assumem o cluster de ações"). Sem uso até lá.
// Some por completo sem nenhuma aba aberta, mesmo critério de InternalTabsBar.
export default function GuiasBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();

  // O botão "Principal" saiu (agora quem leva de volta à visão principal é qualquer clique
  // simples num item do menu — components/TopMenuBar.tsx — e fechar a última guia já chama
  // closeTab, que zera activeTabId sozinho, ver components/TabsProvider.tsx). Sem guias abertas,
  // esta faixa não tem mais nada pra mostrar: 0px de altura em vez de uma barra vazia.
  if (tabs.length === 0) return null;

  return (
    <div className="h-[27px] shrink-0 flex items-end bg-grafite-800 px-2 gap-0.5 overflow-x-auto scrollbar-thin">
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
