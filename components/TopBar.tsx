import { Bell, LogOut } from "lucide-react";
import Link from "next/link";
import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { logout } from "@/lib/actions/auth";
import GlobalSearch from "@/components/GlobalSearch";
import NewEntityMenu from "@/components/NewEntityMenu";
import PeticionarButton from "@/components/PeticionarButton";
import ThemeToggle from "@/components/ThemeToggle";
import TimesheetTimer from "@/components/TimesheetTimer";
import TeamMonitorPanel from "@/components/TeamMonitorPanel";
import { getTodayElapsedSeconds } from "@/lib/timesheet";

export default async function TopBar() {
  const user = await getCurrentUser();
  const hasFinanceAccess = Boolean(user?.isAdmin || user?.financeAccess);
  const todayItems = user ? await getTodayItems(user.officeId, hasFinanceAccess) : [];
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";
  const todaySeconds = user ? await getTodayElapsedSeconds(user.id) : 0;

  return (
    <header className="relative z-30 h-16 shrink-0 bg-cream-50/80 dark:bg-navy-950/90 backdrop-blur border-b border-gold-500/20 dark:border-gold-400/10 flex items-center justify-between pl-16 pr-4 md:px-6 gap-4">
      <GlobalSearch />

      <div className="flex items-center gap-3">
        <PeticionarButton />
        <NewEntityMenu />

        {user && <TimesheetTimer initialSeconds={todaySeconds} />}

        <ThemeToggle />

        <Link href="/alertas?tab=hoje" className="relative p-2 rounded-lg hover:bg-navy-900/5 dark:hover:bg-white/10 transition-colors">
          <Bell size={20} className="text-navy-800 dark:text-cream-50/80" />
          {todayItems.length > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white bg-bordo-600 dark:bg-bordo-500">
              {todayItems.length > 9 ? "9+" : todayItems.length}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-navy-800/10 dark:border-white/10">
          {user?.isAdmin ? (
            <TeamMonitorPanel initials={initials} name={user.name} role={user.role} />
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <div className="hidden md:block leading-tight">
                <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{user?.name ?? "Não identificado"}</p>
                <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50">{user?.role ?? ""}</p>
              </div>
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              data-tip="Sair"
              className="p-2 rounded-lg hover:bg-navy-900/5 dark:hover:bg-white/10 transition-colors text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
