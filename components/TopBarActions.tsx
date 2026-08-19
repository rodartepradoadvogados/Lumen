import { getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";
import TopBarActionsContent from "@/components/TopBarActionsContent";

// Mesmo cluster de ações de components/TopBar.tsx, pronto pra faixa de guias assumir no lugar
// da TopBar atual (PR5 do plano de execução, documento 02 do handoff) — sem uso até lá. Busca os
// mesmos dados de novo (getCurrentUser/getTodayItems/sessão) — duplica a consulta em vez de
// compartilhar com TopBar, mas são consultas simples e o ganho de não precisar replumbing os
// dados através de props client-side compensa a simplicidade.
export default async function TopBarActions() {
  const user = await getCurrentUser();
  const hasFinanceAccess = Boolean(user?.isAdmin || user?.financeAccess);
  const todayItems = user ? await getTodayItems(user.officeId, hasFinanceAccess) : [];
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";
  const sessionSeconds = user ? await getCurrentSessionElapsedSeconds(user.id) : 0;

  return (
    // Ilha clara (--sf) flutuando na faixa escura do modo Bancada — mesmo raciocínio do campo de
    // busca em TopMenuBar (DESIGN-SYSTEM.md §3: "rgba(255,255,255,.09)" sobre o grafite): em vez
    // de recolorir cada botão filho (Peticionar/Novo/Timesheet/avatar já têm cor própria testada
    // nos dois temas), o cluster inteiro ganha uma superfície clara própria por cima do escuro.
    <div className="bg-sf rounded-lg pl-2.5 pr-1.5 py-1 shadow-menu">
      <TopBarActionsContent user={user} initials={initials} todayCount={todayItems.length} sessionSeconds={sessionSeconds} />
    </div>
  );
}
