"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getAlertsCount } from "@/lib/alerts";

// Tipos de alerta sem nenhuma ação de "resolver" (ver lib/alerts.ts) ganham um botão "Lido" —
// por usuário, igual PublicationRead: dispensar não afeta os outros advogados do escritório.
// entityId é o mesmo AlertItem.entityId (comment.id/attendance.id/payable-ou-receivable.id/
// driveSyncIssue.id, conforme o kind).
const DISMISSIBLE_ALERT_KINDS = new Set([
  "MENCAO",
  "FOLLOWUP_ATRASADO",
  "PARCELA_SEM_VENCIMENTO",
  "DRIVE_INCONSISTENCIA",
  "HONORARIO_APURAR_DECISAO",
  "HONORARIO_APURAR_PARADO",
]);

export async function dismissAlert(kind: string, entityId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!DISMISSIBLE_ALERT_KINDS.has(kind)) return { error: "Este alerta não pode ser marcado como lido diretamente." };

  await prisma.alertDismissal.upsert({
    where: { userId_kind_entityId: { userId: user.id, kind, entityId } },
    update: {},
    create: { officeId: user.officeId, userId: user.id, kind, entityId },
  });

  revalidatePath("/alertas");
  revalidatePath("/m/alertas");
  revalidatePath("/painel");
  revalidatePath("/m");
  return {};
}

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
  return getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin);
}
