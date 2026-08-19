"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NavRail from "@/components/NavRail";
import PageSectionTabs from "@/components/PageSectionTabs";
import TabsProvider, { useTabs } from "@/components/TabsProvider";
import TabTitleSync from "@/components/TabTitleSync";
import { sectionForPathname, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

type AppShellProps = {
  sidebarProps: {
    hasFinanceAccess: boolean;
    unreadPublications: number;
    totalAlerts: number;
    todayAgendaCount: number;
    modules: OfficeModules;
  };
  topBar: React.ReactNode;
  supportBanner: React.ReactNode;
  inactivityNotice: React.ReactNode;
  badgeSync: React.ReactNode;
  actingBanner: React.ReactNode;
  claudeWidget: React.ReactNode;
  // Painel global "Anotações" (faixa retrátil, ver components/anotacoes/AnotacoesPanel.tsx) —
  // item de flexbox normal (não overlay) nesta mesma linha, para empurrar o conteúdo central
  // quando aberto, em vez de cobri-lo.
  anotacoesPanel: React.ReactNode;
  children: React.ReactNode;
};

// Casca única do app autenticado (redesenho Modernist — documento 02 do handoff): rail
// (NavRail) + TopBar (busca, abas internas, cluster de ações) + abas de seção
// (PageSectionTabs, no lugar do antigo painel de 190px) + conteúdo. Os modos de visualização
// Régua/Bancada saíram — eram decididos por um ViewModeProvider que ligava/desligava um
// segundo conjunto inteiro de faixas (TopMenuBar/SubTabsBar/GuiasBar); agora só existe esta
// forma. Duplo clique num item do rail/abas de seção abre aquela rota como uma NOVA aba,
// renderizada num <iframe> que fica montado o tempo todo (só escondido via CSS quando não é a
// aba ativa) — é isso que garante "não perder o progresso": rolagem, formulário em andamento
// etc. de uma aba continuam intactos ao voltar pra ela, porque o documento do iframe nunca é
// desmontado. Clique simples continua navegando a view "Principal" (`{children}`, o de sempre,
// renderizado pelo próprio Next), sem nenhuma aba nova. O estado das abas mora em
// components/TabsProvider.tsx (compartilhado com components/GuiasBar.tsx, renderizado dentro de
// components/TopBar.tsx).
//
// Cada iframe carrega a MESMA rota com `?embed=1` — abaixo, quando esse parâmetro está presente,
// a casca inteira (rail, abas de seção, TopBar) é suprimida e só o conteúdo puro é renderizado,
// pra não duplicar a navegação dentro do iframe nem, pior, criar uma aba dentro da aba
// recursivamente (o iframe embutido nunca chega a montar sua própria barra de abas).
function AppShellInner({
  sidebarProps,
  topBar,
  supportBanner,
  inactivityNotice,
  badgeSync,
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

  // Migração silenciosa: os modos de visualização Régua/Bancada saíram do produto — as chaves
  // que guardavam a preferência de quem já tinha escolhido algo ficariam órfãs no localStorage
  // para sempre. Limpa uma vez, sem perguntar nada ao usuário (documento 02, "Aceite": "Nenhum
  // localStorage órfão").
  useEffect(() => {
    try {
      localStorage.removeItem("lumen:viewMode");
      localStorage.removeItem("lumen:sectionPanelCollapsed");
    } catch {
      // localStorage indisponível — nada a limpar mesmo.
    }
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
    <TabsProvider>
      <ShellChrome
        sidebarProps={sidebarProps}
        topBar={topBar}
        supportBanner={supportBanner}
        inactivityNotice={inactivityNotice}
        badgeSync={badgeSync}
        actingBanner={actingBanner}
        claudeWidget={claudeWidget}
        anotacoesPanel={anotacoesPanel}
      >
        {children}
      </ShellChrome>
    </TabsProvider>
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
  actingBanner,
  claudeWidget,
  anotacoesPanel,
  children,
}: Omit<AppShellProps, "topBar"> & { topBar: React.ReactNode }) {
  const pathname = usePathname();
  const { tabs, activeTabId } = useTabs();

  // Seção ativa do rail: deriva do pathname (não é estado "de verdade"), mas clicar num item
  // precisa refletir na hora, antes da navegação terminar (o pathname só muda depois que o
  // router resolve) — por isso um estado local que é (re)sincronizado com o pathname sempre que
  // ele muda de verdade (navegação por link, botão voltar/avançar etc.).
  const [section, setSection] = useState<SectionKey | "painel" | null>(() => sectionForPathname(pathname));
  useEffect(() => {
    // Passa a seção ainda ativa como preferência de desempate — ver comentário de
    // sectionForPathname em lib/navSections.ts sobre a ambiguidade de /publicacoes.
    setSection((prev) => sectionForPathname(pathname, prev));
  }, [pathname]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // Linha mais externa: coluna com toda a casca (rail/conteúdo) à esquerda e o painel de
    // Anotações à direita, ocupando a altura INTEIRA da janela — pedido do dono do escritório
    // pra essa barra "seguir até o topo, e não acabar antes de chegar na extremidade superior".
    <div className="flex h-screen overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {supportBanner}
        <div className="flex flex-1 overflow-hidden">
          {inactivityNotice}
          {badgeSync}
          <Suspense fallback={null}>
            <NavRail
              hasFinanceAccess={sidebarProps.hasFinanceAccess}
              unreadPublications={sidebarProps.unreadPublications}
              totalAlerts={sidebarProps.totalAlerts}
              todayAgendaCount={sidebarProps.todayAgendaCount}
              modules={sidebarProps.modules}
              activeSection={section}
              onSelectSection={setSection}
              mobileOpen={mobileNavOpen}
              onOpenMobile={() => setMobileNavOpen(true)}
              onCloseMobile={() => setMobileNavOpen(false)}
            />
          </Suspense>
          <div className="flex-1 flex flex-col min-w-0 relative">
            {actingBanner}
            {topBar}
            <PageSectionTabs section={section} hasFinanceAccess={sidebarProps.hasFinanceAccess} modules={sidebarProps.modules} />

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
      {anotacoesPanel}
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
