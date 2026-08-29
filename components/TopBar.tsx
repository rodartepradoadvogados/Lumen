import GlobalSearch from "@/components/GlobalSearch";
import GuiasBar from "@/components/GuiasBar";
import TopBarActions from "@/components/TopBarActions";
import type { OfficeModules } from "@/lib/officeModules";

// Faixa única de topo do app desktop — funde o que antes eram duas faixas (TopBar clara de
// 42px + a faixa de menus escura do extinto modo Bancada, ver components/AppShell.tsx e o PR3
// do plano de execução) na única faixa que o documento 02 do handoff descreve: guias de duplo
// clique (components/GuiasBar.tsx) à esquerda, busca e cluster de ações (Peticionar/Novo/
// Timesheet/Alertas/avatar, components/TopBarActions.tsx) à direita.
//
// Ajuste de tema (agosto/2026): a faixa nasceu com fundo escuro fixo (--grafite-800, igual ao
// rail) nos dois temas, com cada grupo numa "ilha clara" (bg-sf) por cima — no tema Manhã isso
// lia como uma tarja preta cravada no meio de uma tela clara, pedido explícito pra tirar. Agora
// é bg-sf/border-regua, igual a qualquer outra superfície do produto (retematiza sozinha) — só
// o rail (NavRail.tsx) continua permanentemente escuro, por decisão à parte, documentada lá.
// Sem mais "ilhas": GuiasBar/GlobalSearch/TopBarActions já leem certo direto sobre o bg-sf da
// própria faixa (ver ajustes nesses três arquivos).
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
    <header className="relative z-30 h-11 shrink-0 bg-sf border-b border-regua flex items-center gap-2 pl-16 pr-2 md:pl-3 md:pr-3">
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        <GuiasBar />
      </div>
      <div className="shrink-0">
        <GlobalSearch hasFinanceAccess={hasFinanceAccess} modules={modules} />
      </div>
      <div className="shrink-0">
        <TopBarActions />
      </div>
    </header>
  );
}
