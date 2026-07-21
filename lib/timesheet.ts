import { prisma } from "@/lib/prisma";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getTodayElapsedSeconds(userId: string): Promise<number> {
  const today = startOfDay(new Date());
  const sessions = await prisma.loginSession.findMany({ where: { userId, loginAt: { gte: today } } });
  let total = 0;
  for (const s of sessions) {
    total += Math.max(0, (s.lastPingAt.getTime() - s.loginAt.getTime()) / 1000);
  }
  return Math.round(total);
}

export async function pingCurrentSession(userId: string): Promise<number> {
  const today = startOfDay(new Date());
  const latest = await prisma.loginSession.findFirst({ where: { userId }, orderBy: { loginAt: "desc" } });

  // Se a sessão mais recente já é de hoje, só atualizamos o "último ping".
  // Caso contrário (usuário sem sessão nenhuma, ou a mais recente é de um dia
  // anterior — ex.: cookie ainda válido de ontem, sem novo login/senha),
  // abrimos uma sessão nova para que o dia de hoje comece a contar do zero.
  if (latest && latest.loginAt >= today) {
    await prisma.loginSession.update({ where: { id: latest.id }, data: { lastPingAt: new Date() } });
  } else {
    await prisma.loginSession.create({ data: { userId } });
  }

  return getTodayElapsedSeconds(userId);
}

// Usado quando o usuário confirma que voltou de um período de inatividade (ver
// components/InactivityNotice.tsx). Ao contrário de pingCurrentSession (que só abre uma
// sessão nova quando o dia virou), aqui a intenção é sempre "fechar" o segmento anterior e
// abrir um novo a partir do momento em que a pessoa confirma que voltou — o tempo em que
// ficou parada (sem interagir) não deve ser contado como tempo de uso.
export async function startFreshSession(userId: string): Promise<number> {
  await prisma.loginSession.create({ data: { userId } });
  return getTodayElapsedSeconds(userId);
}

export type TeamSummary = { id: string; name: string; color: string; lastLoginAt: string | null; todaySeconds: number };

export async function getTeamSummaries(): Promise<TeamSummary[]> {
  const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const result: TeamSummary[] = [];
  for (const u of users) {
    const lastSession = await prisma.loginSession.findFirst({ where: { userId: u.id }, orderBy: { loginAt: "desc" } });
    const todaySeconds = await getTodayElapsedSeconds(u.id);
    result.push({ id: u.id, name: u.name, color: u.color, lastLoginAt: lastSession?.loginAt.toISOString() ?? null, todaySeconds });
  }
  return result;
}

export type DayHistory = { date: string; seconds: number; firstLogin: string };

export async function getUserHistory(userId: string, days = 14): Promise<DayHistory[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const sessions = await prisma.loginSession.findMany({ where: { userId, loginAt: { gte: since } }, orderBy: { loginAt: "asc" } });

  const byDay = new Map<string, { seconds: number; firstLogin: Date }>();
  for (const s of sessions) {
    const key = s.loginAt.toISOString().slice(0, 10);
    const secs = Math.max(0, (s.lastPingAt.getTime() - s.loginAt.getTime()) / 1000);
    const existing = byDay.get(key);
    if (existing) {
      existing.seconds += secs;
      if (s.loginAt < existing.firstLogin) existing.firstLogin = s.loginAt;
    } else {
      byDay.set(key, { seconds: secs, firstLogin: s.loginAt });
    }
  }

  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, seconds: Math.round(v.seconds), firstLogin: v.firstLogin.toISOString() }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
