"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { pingCurrentSession, startFreshSession, getTeamSummaries, getUserHistory, type TeamSummary, type DayHistory } from "@/lib/timesheet";

// `sessionSeconds` é o tempo decorrido da sessão ATUAL (não o total do dia) — ver
// lib/timesheet.ts:getCurrentSessionElapsedSeconds para o porquê.
export async function pingSession(): Promise<{ sessionSeconds: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const sessionSeconds = await pingCurrentSession(user.id, user.officeId);
  return { sessionSeconds };
}

// Chamado quando o usuário confirma, no aviso de inatividade, que voltou a usar o sistema.
// Abre uma sessão nova (ver startFreshSession) para que o período parado não conte como tempo de
// uso — e para que o widget do topo volte a contar visivelmente a partir de 0.
export async function resumeAfterInactivity(): Promise<{ sessionSeconds: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const sessionSeconds = await startFreshSession(user.id, user.officeId);
  return { sessionSeconds };
}

export async function fetchTeamSummaries(): Promise<TeamSummary[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas administradores podem ver este painel." };
  return getTeamSummaries(user.officeId);
}

export async function fetchUserHistory(userId: string): Promise<DayHistory[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin && user.id !== userId) return { error: "Você só pode ver o seu próprio histórico." };
  if (user.id !== userId) {
    const target = await prisma.user.findFirst({ where: { id: userId, officeId: user.officeId } });
    if (!target) return { error: "Usuário não encontrado." };
  }
  return getUserHistory(userId);
}
