import Link from "next/link";
import { Bell, Lock } from "lucide-react";
import PeticionarButton from "@/components/PeticionarButton";
import NewEntityMenu from "@/components/NewEntityMenu";
import TimesheetTimer from "@/components/TimesheetTimer";
import TeamMonitorPanel from "@/components/TeamMonitorPanel";
import { logout } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/currentUser";

// Miolo do cluster de ações da TopBar (Peticionar/Novo/Timesheet/Painel Mestre/Alertas/avatar) —
// extraído de components/TopBar.tsx, hoje o único lugar que o renderiza. Continua separado (em
// vez de inline na TopBar) porque a faixa de guias vai assumir este mesmo cluster no PR5 do
// plano de execução (documento 02 do handoff, "guias assumem o cluster de ações") — quando isso
// acontecer, components/TopBarActions.tsx passa a reaproveitá-lo de novo.
export default function TopBarActionsContent({
  user,
  initials,
  todayCount,
  sessionSeconds,
}: {
  user: CurrentUser | null;
  initials: string;
  todayCount: number;
  sessionSeconds: number;
}) {
  return (
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
        {todayCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white bg-atencao">
            {todayCount > 9 ? "9+" : todayCount}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-2 pl-3 border-l border-regua">
        {user ? (
          <TeamMonitorPanel
            userId={user.id}
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
  );
}
