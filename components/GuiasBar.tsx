"use client";

import { X, FileText } from "lucide-react";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { useTabs } from "@/components/TabsProvider";
import { resolveTabLabel } from "@/lib/navItems";

// Guias de duplo clique (estilo navegador) — mesmo TabsProvider do resto da casca. Renderizada
// dentro da faixa única de topo (components/TopBar.tsx, ver documento 02 do handoff do
// redesenho: "guias assumem o cluster de ações"). Sempre mostra pelo menos UM chip — a view
// "Principal" (a própria navegação normal, fora de qualquer guia aberta por duplo clique) — cujo
// nome acompanha a seção/sub-seção atual (lib/navItems.ts:resolveTabLabel, até o 2º nível da
// hierarquia); pedido do dono do produto: "sempre haverá, no mínimo, uma guia aparecendo, que é
// a principal, mudando a cada mudança de local". Esse chip não é uma Tab de TabsProvider (não
// entra no teto de 5, não tem botão de fechar) — é só a URL atual, lida com usePathname().
export default function GuiasBar() {
  const { tabs, activeTabId, maxTabs, limitReached, activateTab, closeTab, goToLiveView } = useTabs();
  const pathname = usePathname();
  const liveLabel = resolveTabLabel(pathname ?? "") ?? "Painel";

  return (
    <div className="flex items-center gap-0.5 min-w-0">
      <Chip label={liveLabel} active={activeTabId === null} onSelect={goToLiveView} />
      {tabs.map((tab) => (
        <Chip
          key={tab.id}
          label={tab.label}
          active={activeTabId === tab.id}
          hasUpdate={tab.hasUpdate}
          onSelect={() => activateTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}
      {limitReached && (
        <span className="ml-2 text-[11px] font-semibold text-atencao whitespace-nowrap shrink-0 animate-fade-in">
          Limite de {maxTabs} guias — feche uma para abrir outra
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  active,
  hasUpdate,
  onSelect,
  onClose,
}: {
  label: string;
  active: boolean;
  hasUpdate?: boolean;
  onSelect: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={clsx(
        // flex-1 (com teto) em vez do max-w fixo de antes: com poucas guias abertas, cada chip
        // recebe mais espaço e o nome completo cabe sem truncar (pedido do dono do produto,
        // combinado com o teto de 5 guias em TabsProvider.tsx) — truncate continua como rede de
        // segurança pra nome mesmo assim maior que o teto de largura.
        //
        // Cores por tema (ajuste de agosto/2026): a faixa de topo deixou de ter fundo escuro
        // fixo (ver components/TopBar.tsx), então a guia ativa precisa de um degrau PRÓPRIO
        // (--sf-apoio) pra continuar se destacando da faixa (--sf) — só o filete de --acao no
        // topo não bastaria. As inativas usam --tx-2 (não mais --rail-tx, que pressupunha fundo
        // sempre escuro).
        "shrink-0 flex-1 min-w-[90px] max-w-[260px] h-8 flex items-center gap-1.5 pl-3 pr-1.5 text-[11px] font-semibold border-t-2 rounded-t-lg transition-colors",
        active ? "bg-sf-apoio text-tx border-acao" : "text-tx-2 border-transparent hover:bg-sf-apoio/60 hover:text-tx"
      )}
    >
      <FileText size={11} className="shrink-0" />
      <button type="button" onClick={onSelect} className="truncate flex-1 text-left">
        {label}
      </button>
      {hasUpdate && !active && <span className="h-1.5 w-1.5 rounded-full bg-marca shrink-0" aria-label="Atualizada" />}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Fechar aba ${label}`}
          className={clsx(
            "p-0.5 shrink-0",
            active ? "text-tx-2/45 hover:text-tx" : "text-tx-3/60 hover:text-tx-2"
          )}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
