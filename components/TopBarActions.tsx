import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";
import TopBarActionsContent from "@/components/TopBarActionsContent";

// Cluster de ações (Peticionar/Novo/Timesheet/Painel Mestre/Alertas/avatar) renderizado direto
// dentro da faixa única de topo (components/TopBar.tsx) — busca seus próprios dados
// (getCurrentUser/getTodayItems/sessão) em vez de receber por prop, pra TopBar.tsx não precisar
// buscar nada só pra repassar.
export default async function TopBarActions() {
  const user = await getCurrentUser();
  const hasFinanceAccess = Boolean(user?.isAdmin || user?.financeAccess);
  const todayItems = user ? await getTodayItems(user.officeId, hasFinanceAccess) : [];
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";
  const sessionSeconds = user ? await getCurrentSessionElapsedSeconds(user.id) : 0;

  return (
    // Ilha clara (--sf) flutuando na faixa escura de components/TopBar.tsx: em vez de recolorir
    // cada botão filho (Peticionar/Novo/Timesheet/avatar já têm cor própria testada nos dois
    // temas), o cluster inteiro ganha uma superfície clara própria por cima do escuro.
    <div className="bg-sf rounded-lg pl-2.5 pr-1.5 py-1 shadow-menu">
      <TopBarActionsContent user={user} initials={initials} todayCount={todayItems.length} sessionSeconds={sessionSeconds} />
    </div>
  );
}
