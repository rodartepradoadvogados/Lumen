import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import GlobalSearch from "@/components/GlobalSearch";
import InternalTabsBar from "@/components/InternalTabsBar";
import HideInBancada from "@/components/HideInBancada";
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
    // 42px, fundo --sf-superficie, borda inferior --regua — sem backdrop-blur e sem borda dourada
    // (DESIGN-SYSTEM.md §3: "hoje tem border-gold-500/20, que sai"). Presente nos dois modos de
    // visualização (Régua e Bancada) — ver components/AppShell.tsx. No modo Bancada, o cluster de
    // ações (Peticionar/Novo/Timesheet/Alertas/avatar) some daqui (ver HideInBancada): mora mais
    // acima, dentro da faixa de menus compacta (components/TopBarActions.tsx) — pedido do dono do
    // escritório pra esses botões ficarem "mais para cima, alinhados com os botões do menu".
    <header className="relative z-30 h-[42px] shrink-0 bg-sf border-b border-regua flex items-center justify-between pl-16 pr-4 md:px-6 gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <GlobalSearch />
        <InternalTabsBar />
      </div>

      <HideInBancada>
        <TopBarActionsContent user={user} initials={initials} todayCount={todayItems.length} sessionSeconds={sessionSeconds} />
      </HideInBancada>
    </header>
  );
}
