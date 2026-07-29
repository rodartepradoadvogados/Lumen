"use server";

import { getCurrentUser } from "@/lib/currentUser";
import { getAlertsCount } from "@/lib/alerts";

// Usado pelo AppBadgeSync (badge no ícone do PWA instalado, via Badging API) para saber a
// contagem TOTAL de alertas pendentes do usuário — menções, prazos vencidos, tarefas
// delegadas, contas vencidas, publicações não lidas etc. (ver lib/alerts.ts getAlerts/
// getAlertsCount) — sem precisar recarregar a página inteira. Diferente de
// getUnreadPublicationsCount (lib/actions/publications.ts), que conta só Publicações e
// alimenta o badge específico da aba/menu Publicações.
export async function getUnreadAlertsCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const hasFinanceAccess = Boolean(user.isAdmin || user.financeAccess);
  return getAlertsCount(user.officeId, hasFinanceAccess, user.id);
}
