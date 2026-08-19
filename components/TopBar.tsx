import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import GlobalSearch from "@/components/GlobalSearch";
import InternalTabsBar from "@/components/InternalTabsBar";
import TopBarActionsContent from "@/components/TopBarActionsContent";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";

export default async function TopBar() {
  const user = await getCurrentUser();
  const hasFinanceAccess = Boolean(user?.isAdmin || user?.financeAccess);
  const todayItems = user ? await getTodayItems(user.officeId, hasFinanceAccess) : [];
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";
  const sessionSeconds = user ? await getCurrentSessionElapsedSeconds(user.id) : 0;

  return (
    // 42px, fundo --sf-superficie, borda inferior --regua — sem backdrop-blur e sem borda dourada.
    // Única faixa de topo do app desktop desde a remoção dos modos Régua/Bancada (ver
    // components/AppShell.tsx) — o cluster de ações (Peticionar/Novo/Timesheet/Alertas/avatar)
    // mora aqui direto, sem gate nenhum. `components/TopBarActions.tsx` (o mesmo cluster, ilha
    // clara sobre fundo escuro) fica sem uso até a faixa de guias assumi-lo (PR5 do plano de
    // execução, documento 02 do handoff — "guias assumem o cluster de ações").
    <header className="relative z-30 h-[42px] shrink-0 bg-sf border-b border-regua flex items-center justify-between pl-16 pr-4 md:px-6 gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <GlobalSearch />
        <InternalTabsBar />
      </div>

      <TopBarActionsContent user={user} initials={initials} todayCount={todayItems.length} sessionSeconds={sessionSeconds} />
    </header>
  );
}
