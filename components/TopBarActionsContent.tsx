import Link from "next/link";
import { Bell, Lock, Newspaper } from "lucide-react";
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

      {/* O SINO — mesma contagem, mesmo teto de exibição e mesmo rótulo acessível do sino do PWA
          (app/m/layout.tsx). Ver o comentário longo em components/TopBarActions.tsx: aqui o
          número vinha de "o que vence hoje" e lá da Central inteira, então o site dizia 1 com o
          PWA dizendo 22. O teto também divergia — 9+ aqui, 99+ lá: com 22 pendências o site
          escrevia "9+" e escondia a escala do problema justamente de quem precisa vê-la. */}
      <Link
        href="/alertas?tab=pendentes"
        aria-label={`Central de Alertas${alertsCount > 0 ? `, ${alertsCount} pendente(s)` : ""}`}
        className="relative p-2 hover:bg-sf-apoio transition-colors rounded-md"
      >
        <Bell size={20} className="text-tx" />
        {alertsCount > 0 && (
          <span // Bordô, igual ao badge do sino do PWA (app/m/layout.tsx) — pedido do dono em 2026-09-16:
            // contagem não é risco, o vermelho/âmbar fica para prazo vencido. Este era o terceiro
            // desalinhamento entre os dois sinos, junto com a contagem e o teto de exibição.
            className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-etiqueta font-bold flex items-center justify-center bg-acao text-acao-tx tabular-nums">
            {alertsCount > 99 ? "99+" : alertsCount}
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
