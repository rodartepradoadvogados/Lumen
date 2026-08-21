"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Tab = { id: string; href: string; label: string; hasUpdate?: boolean };

const STORAGE_KEY = "lumen:openTabs";

// Teto de guias simultâneas — pedido do dono do produto: com poucas guias abertas, cada chip
// consegue mostrar o nome completo (ver components/GuiasBar.tsx, que divide o espaço disponível
// por esse mesmo número). Mais que isso e o nome sempre truncaria de novo.
const MAX_TABS = 5;

function loadStoredTabs(): Tab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // dado corrompido no sessionStorage — segue sem nenhuma aba salva
  }
}

type TabsContextValue = {
  tabs: Tab[];
  activeTabId: string | null;
  maxTabs: number;
  limitReached: boolean;
  openTab: (href: string, label: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  goToLiveView: () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

// Estado das abas internas (estilo navegador) — extraído de components/AppShell.tsx pra fora,
// pra components/GuiasBar.tsx (renderizado DENTRO de components/TopBar.tsx, ao lado da busca e
// do cluster de ações) e o próprio AppShell (que decide qual <iframe>/view mostrar) lerem e
// escreverem no MESMO estado sem precisar passar callbacks por profundezas de props — TopBar é
// Server Component e recebe GuiasBar como filho, então os dois só conseguem compartilhar estado
// via um Context acima dos dois na árvore (aqui, em AppShell).
export default function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "lumen-tab" || typeof data.tabId !== "string" || typeof data.label !== "string") return;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== data.tabId) return t;
          const labelChanged = t.label !== data.label;
          // Ponto de marca (ver GuiasBar): só acende quando a atualização chegou de uma
          // aba que NÃO está em foco no momento — abrir a aba já é a confirmação de leitura.
          return labelChanged || !t.hasUpdate
            ? { ...t, label: data.label, hasUpdate: t.hasUpdate || t.id !== activeTabIdRef.current }
            : t;
        })
      );
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Ref espelhando activeTabId pra usar dentro do listener de "message" acima sem precisar
  // recriar o listener (e perder mensagens) a cada troca de aba ativa.
  const activeTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    setTabs(loadStoredTabs());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      // hasUpdate é só um sinal visual desta sessão — não persiste entre recarregamentos, senão
      // um ponto dourado "grudaria" numa aba que na próxima visita já nem existe mais.
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tabs.map(({ id, href, label }) => ({ id, href, label })))
      );
    } catch {
      // sessionStorage indisponível (modo privado etc.) — sem persistência entre recarregamentos.
    }
  }, [tabs]);

  const openTab = useCallback((href: string, label: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.href === href);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      if (prev.length >= MAX_TABS) {
        if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
        setLimitReached(true);
        limitTimerRef.current = setTimeout(() => setLimitReached(false), 4000);
        return prev;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setActiveTabId(id);
      return [...prev, { id, href, label }];
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTabId((current) => (current === id ? null : current));
  }, []);

  const activateTab = useCallback((id: string) => {
    setActiveTabId(id);
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, hasUpdate: false } : t)));
  }, []);

  const goToLiveView = useCallback(() => setActiveTabId(null), []);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, maxTabs: MAX_TABS, limitReached, openTab, closeTab, activateTab, goToLiveView }}>
      {children}
    </TabsContext.Provider>
  );
}

// Fora de um TabsProvider (ex.: dentro do próprio <iframe> embutido, que renderiza a casca
// suprimida — ver AppShell.tsx `embed`), retorna um valor inerte em vez de lançar erro: o
// conteúdo embutido nunca abre suas próprias abas mesmo, então não faz diferença nenhuma.
const NOOP_TABS: TabsContextValue = {
  tabs: [],
  activeTabId: null,
  maxTabs: MAX_TABS,
  limitReached: false,
  openTab: () => {},
  closeTab: () => {},
  activateTab: () => {},
  goToLiveView: () => {},
};

export function useTabs(): TabsContextValue {
  return useContext(TabsContext) ?? NOOP_TABS;
}
