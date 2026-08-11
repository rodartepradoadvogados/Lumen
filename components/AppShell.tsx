"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NavRail from "@/components/NavRail";
import SectionPanel from "@/components/SectionPanel";
import GuiasBar from "@/components/GuiasBar";
import TopMenuBar from "@/components/TopMenuBar";
import SubTabsBar from "@/components/SubTabsBar";
import TabsProvider, { useTabs } from "@/components/TabsProvider";
import TabTitleSync from "@/components/TabTitleSync";
import ViewModeProvider, { useViewMode } from "@/components/ViewModeProvider";
import { sectionForPathname, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

const PANEL_COLLAPSED_KEY = "lumen:sectionPanelCollapsed";

type AppShellProps = {
  sidebarProps: {
    hasFinanceAccess: boolean;
    isAdmin: boolean;
    canConfigureIntegrations: boolean;
    unreadPublications: number;
    totalAlerts: number;
    todayAgendaCount: number;
    modules: OfficeModules;
  };
  topBar: React.ReactNode;
  supportBanner: React.ReactNode;
  inactivityNotice: React.ReactNode;
  badgeSync: React.ReactNode;
  backgroundLayer: React.ReactNode;
  actingBanner: React.ReactNode;
  claudeWidget: React.ReactNode;
  // Painel global "Anotações" (faixa retrátil, ver components/anotacoes/AnotacoesPanel.tsx) —
  // item de flexbox normal (não overlay) nesta mesma linha, para empurrar o conteúdo central
  // quando aberto, em vez de cobri-lo.
  anotacoesPanel: React.ReactNode;
  children: React.ReactNode;
};

// Casca do app autenticado com abas internas (estilo navegador): duplo clique num item/sub-item
// do rail/painel de seção (components/NavRail.tsx, components/SectionPanel.tsx) abre aquela
// rota como uma NOVA aba, renderizada num <iframe> que fica montado o tempo todo (só escondido
// via CSS quando não é a aba ativa) — é isso que garante "não perder o progresso": rolagem,
// formulário em andamento etc. de uma aba continuam intactos ao voltar pra ela, porque o
// documento do iframe nunca é desmontado. Clique simples continua navegando a view "Principal"
// (`{children}`, o de sempre, renderizado pelo próprio Next), sem nenhuma aba nova. O estado das
// abas mora em components/TabsProvider.tsx (compartilhado com components/InternalTabsBar.tsx,
// renderizado dentro da TopBar).
//
// Cada iframe carrega a MESMA rota com `?embed=1` — abaixo, quando esse parâmetro está presente,
// a casca inteira (rail, painel de seção, TopBar) é suprimida e só o conteúdo puro é renderizado,
// pra não duplicar a navegação dentro do iframe nem, pior, criar uma aba dentro da aba
// recursivamente (o iframe embutido nunca chega a montar sua própria barra de abas).
function AppShellInner({
  sidebarProps,
  topBar,
  supportBanner,
  inactivityNotice,
  badgeSync,
  backgroundLayer,
  actingBanner,
  claudeWidget,
  anotacoesPanel,
  children,
}: AppShellProps) {
  const searchParams = useSearchParams();
  // `?embed=1` só resolve a 1ª pintura (evita flash de casca completa antes do JS rodar) — depois
  // do mount, a verdade passa a ser "estou dentro de um <iframe> mesmo?" (window.self !== window.top).
  // Isso importa porque um link clicado DENTRO da aba (navegação client-side do próprio Next, sem
  // recarregar o iframe) pode apontar pra uma URL sem `embed=1` — sem essa checagem em runtime, a
  // casca completa (rail/TopBar) reaparecia dentro da aba na primeira navegação interna.
  const embedParam = searchParams.get("embed") === "1";
  const [embed, setEmbed] = useState(embedParam);

  useEffect(() => {
    if (typeof window !== "undefined" && window.self !== window.top) setEmbed(true);
  }, []);

  if (embed) {
    return (
      <main className="h-screen overflow-y-auto scrollbar-thin">
        <TabTitleSync />
        {children}
      </main>
    );
  }

  return (
    // ViewModeProvider envolve o TabsProvider (não o contrário): tanto o ShellChrome (decide
    // qual conjunto de casca montar) quanto o menu do avatar dentro da TopBar (onde o usuário
    // troca de modo, ver TeamMonitorPanel) precisam ler/escrever o modo — e os dois já estão
    // dentro da árvore do TabsProvider. Ver DESIGN-SYSTEM.md §5.
    <ViewModeProvider>
      <TabsProvider>
        <ShellChrome
          sidebarProps={sidebarProps}
          topBar={topBar}
          supportBanner={supportBanner}
          inactivityNotice={inactivityNotice}
          badgeSync={badgeSync}
          backgroundLayer={backgroundLayer}
          actingBanner={actingBanner}
          claudeWidget={claudeWidget}
          anotacoesPanel={anotacoesPanel}
        >
          {children}
        </ShellChrome>
      </TabsProvider>
    </ViewModeProvider>
  );
}

// Precisa estar DENTRO do TabsProvider (useTabs só funciona com um Provider acima na árvore) —
// por isso é um componente à parte de AppShellInner, não só mais um trecho do mesmo return.
function ShellChrome({
  sidebarProps,
  topBar,
  supportBanner,
  inactivityNotice,
  badgeSync,
  backgroundLayer,
  actingBanner,
  claudeWidget,
  anotacoesPanel,
  children,
}: Omit<AppShellProps, "topBar"> & { topBar: React.ReactNode }) {
  const pathname = usePathname();
  const { tabs, activeTabId } = useTabs();
  const { viewMode } = useViewMode();

  // Seção ativa do rail (Régua) / menu (Bancada): deriva do pathname (não é estado "de verdade"
  // — ver proposta), mas clicar num item precisa refletir na hora, antes da navegação terminar
  // (o pathname só muda depois que o router resolve) — por isso um estado local que é
  // (re)sincronizado com o pathname sempre que ele muda de verdade (navegação por link, botão
  // voltar/avançar etc.). Usado pelos dois modos: NavRail+SectionPanel na Régua,
  // TopMenuBar+SubTabsBar na Bancada.
  const [section, setSection] = useState<SectionKey | "painel" | null>(() => sectionForPathname(pathname));
  useEffect(() => {
    setSection(sectionForPathname(pathname));
  }, [pathname]);

  // Preferência de recolher o painel de seção (botão ChevronsLeft) — persiste entre sessões,
  // mas é sempre ignorada quando a seção é "painel" (que nunca mostra painel, ver handleSelectSection).
  const [collapsedByUser, setCollapsedByUser] = useState(false);
  useEffect(() => {
    try {
      setCollapsedByUser(localStorage.getItem(PANEL_COLLAPSED_KEY) === "1");
    } catch {
      // localStorage indisponível — segue com o painel aberto por padrão.
    }
  }, []);

  function handleSelectSection(next: SectionKey | "painel") {
    setSection(next);
    // Escolher uma seção de novo (mesmo que já estivesse recolhida) reabre o painel — só o botão
    // ChevronsLeft dentro do próprio painel recolhe.
    if (next !== "painel" && collapsedByUser) {
      setCollapsedByUser(false);
      try {
        localStorage.setItem(PANEL_COLLAPSED_KEY, "0");
      } catch {
        // ignora falha ao persistir
      }
    }
  }

  function handleCollapsePanel() {
    setCollapsedByUser(true);
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, "1");
    } catch {
      // ignora falha ao persistir
    }
  }

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isRegua = viewMode === "regua";
  const panelOpen = isRegua && section !== null && section !== "painel" && !collapsedByUser;
  const subTabsSection = !isRegua && section !== null && section !== "painel" ? section : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Bancada: guias, barra de menus e sub-abas substituem rail + painel de seção — nesta
          ordem, a primeira ("primeira linha da janela") acima até do supportBanner. Ver
          DESIGN-SYSTEM.md §3 e §5, e components/ViewModeProvider.tsx. */}
      {!isRegua && (
        <Suspense fallback={null}>
          <GuiasBar />
        </Suspense>
      )}
      {supportBanner}
      {!isRegua && (
        <Suspense fallback={null}>
          <TopMenuBar
            hasFinanceAccess={sidebarProps.hasFinanceAccess}
            modules={sidebarProps.modules}
            activeSection={section}
            onSelectSection={handleSelectSection}
          />
        </Suspense>
      )}
      {!isRegua && subTabsSection && (
        <Suspense fallback={null}>
          <SubTabsBar
            section={subTabsSection}
            hasFinanceAccess={sidebarProps.hasFinanceAccess}
            modules={sidebarProps.modules}
          />
        </Suspense>
      )}
      <div className="flex flex-1 overflow-hidden">
        {inactivityNotice}
        {badgeSync}
        {isRegua && (
          <Suspense fallback={null}>
            <NavRail
              hasFinanceAccess={sidebarProps.hasFinanceAccess}
              unreadPublications={sidebarProps.unreadPublications}
              totalAlerts={sidebarProps.totalAlerts}
              todayAgendaCount={sidebarProps.todayAgendaCount}
              modules={sidebarProps.modules}
              activeSection={section}
              onSelectSection={handleSelectSection}
              mobileOpen={mobileNavOpen}
              onOpenMobile={() => setMobileNavOpen(true)}
              onCloseMobile={() => setMobileNavOpen(false)}
            />
          </Suspense>
        )}
        {panelOpen && section && (
          <Suspense fallback={null}>
            <SectionPanel
              section={section}
              hasFinanceAccess={sidebarProps.hasFinanceAccess}
              isAdmin={sidebarProps.isAdmin}
              canConfigureIntegrations={sidebarProps.canConfigureIntegrations}
              modules={sidebarProps.modules}
              onCollapse={handleCollapsePanel}
            />
          </Suspense>
        )}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Suspense fallback={null}>{backgroundLayer}</Suspense>
          {actingBanner}
          {topBar}

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
        {anotacoesPanel}
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
