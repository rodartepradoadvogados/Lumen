"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import TabTitleSync from "@/components/TabTitleSync";
import type { OfficeModules } from "@/lib/officeModules";

type Tab = { id: string; href: string; label: string };

const STORAGE_KEY = "lumen:openTabs";

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

type AppShellProps = {
  sidebarProps: {
    hasFinanceAccess: boolean;
    isAdmin: boolean;
    unreadPublications: number;
    totalAlerts: number;
    modules: OfficeModules;
  };
  topBar: React.ReactNode;
  supportBanner: React.ReactNode;
  inactivityNotice: React.ReactNode;
  badgeSync: React.ReactNode;
  backgroundLayer: React.ReactNode;
  actingBanner: React.ReactNode;
  claudeWidget: React.ReactNode;
  children: React.ReactNode;
};

// Casca do app autenticado com abas internas (estilo navegador): duplo clique num item/sub-item
// da Sidebar abre aquela rota como uma NOVA aba, renderizada num <iframe> que fica montado o
// tempo todo (só escondido via CSS quando não é a aba ativa) — é isso que garante "não perder o
// progresso": rolagem, formulário em andamento etc. de uma aba continuam intactos ao voltar pra
// ela, porque o documento do iframe nunca é desmontado. Clique simples continua navegando a view
// "Principal" (`{children}`, o de sempre, renderizado pelo próprio Next), sem nenhuma aba nova.
//
// Cada iframe carrega a MESMA rota com `?embed=1` — abaixo, quando esse parâmetro está presente,
// a casca inteira (Sidebar, TopBar, tiras de aba) é suprimida e só o conteúdo puro é renderizado,
// pra não duplicar a sidebar dentro do iframe nem, pior, criar uma aba dentro da aba
// recursivamente (o iframe embutido nunca chega a montar sua própria tira de abas).
function AppShellInner({
  sidebarProps,
  topBar,
  supportBanner,
  inactivityNotice,
  badgeSync,
  backgroundLayer,
  actingBanner,
  claudeWidget,
  children,
}: AppShellProps) {
  const searchParams = useSearchParams();
  // `?embed=1` só resolve a 1ª pintura (evita flash de casca completa antes do JS rodar) — depois
  // do mount, a verdade passa a ser "estou dentro de um <iframe> mesmo?" (window.self !== window.top).
  // Isso importa porque um link clicado DENTRO da aba (navegação client-side do próprio Next, sem
  // recarregar o iframe) pode apontar pra uma URL sem `embed=1` — sem essa checagem em runtime, a
  // casca completa (Sidebar/TopBar) reaparecia dentro da aba na primeira navegação interna.
  const embedParam = searchParams.get("embed") === "1";
  const [embed, setEmbed] = useState(embedParam);

  useEffect(() => {
    if (typeof window !== "undefined" && window.self !== window.top) setEmbed(true);
  }, []);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (embed) return;
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "lumen-tab" || typeof data.tabId !== "string" || typeof data.label !== "string") return;
      setTabs((prev) => prev.map((t) => (t.id === data.tabId && t.label !== data.label ? { ...t, label: data.label } : t)));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [embed]);

  useEffect(() => {
    if (embed) return;
    setTabs(loadStoredTabs());
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current || embed) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      // sessionStorage indisponível (modo privado etc.) — sem persistência entre recarregamentos.
    }
  }, [tabs, embed]);

  const openTab = useCallback((href: string, label: string) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.href === href);
      if (existing) {
        setActiveTabId(existing.id);
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

  const goToLiveView = useCallback(() => setActiveTabId(null), []);

  if (embed) {
    return (
      <main className="h-screen overflow-y-auto scrollbar-thin">
        <TabTitleSync />
        {children}
      </main>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {supportBanner}
      <div className="flex flex-1 overflow-hidden">
        {inactivityNotice}
        {badgeSync}
        <Suspense fallback={null}>
          <Sidebar {...sidebarProps} onOpenTab={openTab} onNavigate={goToLiveView} />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Suspense fallback={null}>{backgroundLayer}</Suspense>
          {actingBanner}
          {topBar}

          {tabs.length > 0 && (
            <div className="flex items-center gap-1 px-3 pt-2 border-b border-navy-800/8 dark:border-white/10 overflow-x-auto scrollbar-thin bg-cream-50/60 dark:bg-navy-950/40">
              <button
                type="button"
                onClick={goToLiveView}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-t-lg transition-colors ${
                  activeTabId === null
                    ? "bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50"
                    : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
                }`}
              >
                Principal
              </button>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold pl-3 pr-1.5 py-1.5 rounded-t-lg transition-colors ${
                    activeTabId === tab.id
                      ? "bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50"
                      : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
                  }`}
                >
                  <button type="button" onClick={() => setActiveTabId(tab.id)} className="max-w-[140px] truncate">
                    {tab.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(tab.id)}
                    aria-label={`Fechar aba ${tab.label}`}
                    className="p-0.5 rounded hover:bg-navy-900/10 dark:hover:bg-white/10"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <main className={activeTabId === null ? "flex-1 overflow-y-auto scrollbar-thin" : "hidden"}>{children}</main>
          {tabs.map((tab) => (
            <iframe
              key={tab.id}
              src={`${tab.href}${tab.href.includes("?") ? "&" : "?"}embed=1&tabId=${tab.id}`}
              className={activeTabId === tab.id ? "flex-1 w-full border-0" : "hidden"}
              title={tab.label}
            />
          ))}
        </div>
        {claudeWidget}
      </div>
    </div>
  );
}

export default function AppShell(props: AppShellProps) {
  return (
    <Suspense fallback={null}>
      <AppShellInner {...props} />
    </Suspense>
  );
}
