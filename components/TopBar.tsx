import GlobalSearch from "@/components/GlobalSearch";
import GuiasBar from "@/components/GuiasBar";
import TopBarActions from "@/components/TopBarActions";

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
export default function TopBar() {
  return (
    <header className="relative z-30 h-11 shrink-0 bg-grafite-800 flex items-center gap-2 pl-16 pr-2 md:pl-3 md:pr-3">
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        <GuiasBar />
      </div>
      {/* min-w-0 (não shrink-0): GlobalSearch mede a própria largura disponível pra decidir entre
          barra inline ou botão-gatilho (ver MIN_INLINE_WIDTH_PX em GlobalSearch.tsx) — precisa
          poder encolher de verdade quando a faixa aperta, senão nunca teria como ficar estreita
          o bastante pra esse modo entrar em ação. */}
      <div className="min-w-0 bg-sf px-2.5 py-1.5 shadow-menu">
        <GlobalSearch />
      </div>
      <div className="shrink-0">
        <TopBarActions />
      </div>
    </header>
  );
}
