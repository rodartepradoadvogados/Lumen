import Link from "next/link";
import { Lock, Newspaper } from "lucide-react";
import SinoAlertas from "@/components/SinoAlertas";
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
  alertsCount,
  sessionSeconds,
}: {
  user: CurrentUser | null;
  initials: string;
  alertsCount: number;
  sessionSeconds: number;
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <PeticionarButton />
      <NewEntityMenu />

      {user && <TimesheetTimer initialSeconds={sessionSeconds} />}

      {/* O CAMINHO ATÉ O BLOG — pedido do dono em 17/09/2026: "no painel precisa colocar um local
          para ir para o blog, ainda que discreto. Não sei se no painel, se na barra superior, se
          no rail fixo... mas preciso disso de alguma forma."
          Ficou na barra superior, e não no Painel, justamente porque a barra está em TODA tela do
          portal: o caminho passa a existir de onde quer que a pessoa esteja, não só na home. Abre
          em aba nova porque o blog é o site público — trocar a tela do trabalho por ele seria
          fazer a pessoa refazer o caminho de volta.
          A administração do blog (revisar, publicar) continua em Configurações → Blog Jurídico,
          que é onde se AGE sobre ele; este atalho é para VER o que está no ar. */}
      <a
        href="/blog"
        target="_blank"
        rel="noopener noreferrer"
        data-tip="Blog Jurídico (abre em nova aba)"
        data-tip-pos="bottom"
        className="p-2 hover:bg-sf-apoio transition-colors text-tx-3 hover:text-tx rounded-md"
      >
        <Newspaper size={18} />
        <span className="sr-only">Blog Jurídico</span>
      </a>

      {user?.isPlatformOwner && (
        <Link
          href="/painel-mestre"
          data-tip="Painel Mestre"
          data-tip-pos="bottom"
          className="p-2 hover:bg-sf-apoio transition-colors text-atencao rounded-md"
        >
          <Lock size={18} />
        </Link>
      )}

      {/* O SINO — agora uma gaveta que desce, não um link que troca a tela. Ver a nota longa em
          components/SinoAlertas.tsx; a contagem continua vindo de getAlertsCount, a mesma do sino
          do PWA (components/TopBarActions.tsx). */}
      <SinoAlertas count={alertsCount} />

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
            <div className="h-8 w-8 rounded-full bg-grafite-800 text-rail-marca flex items-center justify-center text-xs font-semibold">
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
