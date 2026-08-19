import GlobalSearch from "@/components/GlobalSearch";
import GuiasBar from "@/components/GuiasBar";
import TopBarActions from "@/components/TopBarActions";
import type { OfficeModules } from "@/lib/officeModules";

// Faixa única de topo do app desktop — funde o que antes eram duas faixas (TopBar clara de
// 42px + a faixa de menus escura do extinto modo Bancada, ver components/AppShell.tsx e o PR3
// do plano de execução) na única faixa que o documento 02 do handoff descreve: fundo escuro
// como o rail, guias de duplo clique (components/GuiasBar.tsx) à esquerda, busca e cluster de
// ações (Peticionar/Novo/Timesheet/Alertas/avatar, components/TopBarActions.tsx) à direita —
// cada um numa "ilha clara" flutuando sobre o escuro, mesmo tratamento que TopBarActions.tsx já
// usava sozinho no modo Bancada.
//
// Altura 44px, não os 30px do documento: Peticionar/TimesheetTimer/avatar (dentro de
// TopBarActions) já são dimensionados para uma barra de 42px — encolhê-los para caber em 30px
// exigiria uma variante "compacta" de cada um, fora do escopo deste PR (o documento 01 prevê
// essa variante — "Altura ... 26px em barra compacta" — mas nenhum desses componentes a
// implementa ainda).
export default function TopBar({
  hasFinanceAccess,
  modules,
}: {
  hasFinanceAccess: boolean;
  modules: OfficeModules;
}) {
  return (
    <header className="relative z-30 h-11 shrink-0 bg-grafite-800 flex items-center gap-2 pl-16 pr-2 md:pl-3 md:pr-3">
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        <GuiasBar />
      </div>
      {/* GlobalSearch agora é um botão-gatilho de largura fixa (paleta de comando ⌘K, ver
          components/GlobalSearch.tsx) — não precisa mais encolher pra mudar de modo. */}
      <div className="shrink-0 bg-sf px-2.5 py-1.5 shadow-menu">
        <GlobalSearch hasFinanceAccess={hasFinanceAccess} modules={modules} />
      </div>
      <div className="shrink-0">
        <TopBarActions />
      </div>
    </header>
  );
}
