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

  // A faixa de topo (components/TopBar.tsx) já é bg-sf — não precisa mais da "ilha clara" que
  // existia quando o fundo dela era escuro fixo (ajuste de tema, agosto/2026).
  return <TopBarActionsContent user={user} initials={initials} todayCount={todayItems.length} sessionSeconds={sessionSeconds} />;
}
