"use server";

import { getCurrentUser } from "@/lib/currentUser";
import { pingCurrentSession, getTeamSummaries, getUserHistory, type TeamSummary, type DayHistory } from "@/lib/timesheet";

export async function pingSession(): Promise<{ todaySeconds: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const todaySeconds = await pingCurrentSession(user.id);
  return { todaySeconds };
}

export async function fetchTeamSummaries(): Promise<TeamSummary[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem ver este painel." };
  return getTeamSummaries();
}

export async function fetchUserHistory(userId: string): Promise<DayHistory[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin && user.id !== userId) return { error: "Você só pode ver o seu próprio histórico." };
  return getUserHistory(userId);
}
