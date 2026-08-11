import { Bell, Lock } from "lucide-react";
import Link from "next/link";
import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { logout } from "@/lib/actions/auth";
import GlobalSearch from "@/components/GlobalSearch";
import InternalTabsBar from "@/components/InternalTabsBar";
import NewEntityMenu from "@/components/NewEntityMenu";
import PeticionarButton from "@/components/PeticionarButton";
import TimesheetTimer from "@/components/TimesheetTimer";
import TeamMonitorPanel from "@/components/TeamMonitorPanel";
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
    // visualização (Régua e Bancada) — ver components/AppShell.tsx.
    <header className="relative z-30 h-[42px] shrink-0 bg-sf border-b border-regua flex items-center justify-between pl-16 pr-4 md:px-6 gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <GlobalSearch />
        <InternalTabsBar />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <PeticionarButton />
        <NewEntityMenu />

        {user && <TimesheetTimer initialSeconds={sessionSeconds} />}

        {user?.isPlatformOwner && (
          <Link
            href="/painel-mestre"
            data-tip="Painel Mestre"
            data-tip-pos="bottom"
            className="p-2 rounded-lg hover:bg-sf-apoio transition-colors text-atencao"
          >
            <Lock size={18} />
          </Link>
        )}

        <Link href="/alertas?tab=hoje" className="relative p-2 rounded-lg hover:bg-sf-apoio transition-colors">
          <Bell size={20} className="text-tx" />
          {todayItems.length > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white bg-vinho-500">
              {todayItems.length > 9 ? "9+" : todayItems.length}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-regua">
          {user ? (
            <TeamMonitorPanel
              initials={initials}
              name={user.name}
              role={user.role}
              photoUrl={user.photoUrl ? `/api/perfil/foto/${user.id}` : null}
              isAdmin={user.isAdmin}
              logoutAction={logout}
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-grafite-800 text-marca flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <div className="hidden md:block leading-tight">
                <p className="text-sm font-medium text-tx">Não identificado</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
