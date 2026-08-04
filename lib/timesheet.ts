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

// Tempo decorrido da sessão ATUAL (a mais recente do LoginSession), não o total do dia — é o que
// o widget do topo (TimesheetTimer) mostra. Diferente de getTodayElapsedSeconds (soma de todas as
// sessões de hoje, usado no painel de Monitoramento da Equipe): aqui, cada sessão nova (login do
// dia ou retomada após inatividade) volta a contar visivelmente a partir de 0 — é o sinal, tanto
// pra quem está usando quanto pra quem audita depois (getUserHistory, mais abaixo), de que houve
// uma pausa. Somar o dia inteiro escondia isso: o tempo parado já não entrava na conta, mas nada
// na tela indicava que a pausa tinha acontecido.
export async function getCurrentSessionElapsedSeconds(userId: string): Promise<number> {
  const latest = await prisma.loginSession.findFirst({ where: { userId }, orderBy: { loginAt: "desc" } });
  if (!latest) return 0;
  return Math.max(0, Math.round((Date.now() - latest.loginAt.getTime()) / 1000));
}

export async function pingCurrentSession(userId: string, officeId: string): Promise<number> {
  const today = startOfDay(new Date());
  const latest = await prisma.loginSession.findFirst({ where: { userId }, orderBy: { loginAt: "desc" } });

  // Se a sessão mais recente já é de hoje, só atualizamos o "último ping".
  // Caso contrário (usuário sem sessão nenhuma, ou a mais recente é de um dia
  // anterior — ex.: cookie ainda válido de ontem, sem novo login/senha),
  // abrimos uma sessão nova para que o dia de hoje comece a contar do zero.
  if (latest && latest.loginAt >= today) {
    await prisma.loginSession.update({ where: { id: latest.id }, data: { lastPingAt: new Date() } });
  } else {
    await prisma.loginSession.create({ data: { userId, officeId } });
  }

  return getCurrentSessionElapsedSeconds(userId);
}

// Usado quando o usuário confirma que voltou de um período de inatividade (ver
// components/InactivityNotice.tsx). Ao contrário de pingCurrentSession (que só abre uma
// sessão nova quando o dia virou), aqui a intenção é sempre "fechar" o segmento anterior e
// abrir um novo a partir do momento em que a pessoa confirma que voltou — o tempo em que
// ficou parada (sem interagir) não deve ser contado como tempo de uso.
export async function startFreshSession(userId: string, officeId: string): Promise<number> {
  await prisma.loginSession.create({ data: { userId, officeId } });
  return getCurrentSessionElapsedSeconds(userId);
}

export type TeamSummary = { id: string; name: string; color: string; lastLoginAt: string | null; todaySeconds: number };

export async function getTeamSummaries(officeId: string): Promise<TeamSummary[]> {
  const users = await prisma.user.findMany({ where: { active: true, officeId }, orderBy: { name: "asc" } });
  const result: TeamSummary[] = [];
  for (const u of users) {
    const lastSession = await prisma.loginSession.findFirst({ where: { userId: u.id }, orderBy: { loginAt: "desc" } });
    const todaySeconds = await getTodayElapsedSeconds(u.id);
    result.push({ id: u.id, name: u.name, color: u.color, lastLoginAt: lastSession?.loginAt.toISOString() ?? null, todaySeconds });
  }
  return result;
}

export type SessionSegment = { loginAt: string; lastPingAt: string; seconds: number };
export type DayHistory = { date: string; seconds: number; firstLogin: string; sessions: SessionSegment[] };

// `sessions` (cada segmento login→último ping do dia, em ordem cronológica) é o que permite a
// quem audita (Monitoramento da Equipe) enxergar as pausas: mais de um segmento no mesmo dia
// significa que houve uma sessão nova no meio do dia — por inatividade (ver startFreshSession)
// ou por ter saído e voltado a logar —, com um intervalo sem contar entre o fim de um e o início
// do outro. Só o total do dia (`seconds`) não mostrava isso.
export async function getUserHistory(userId: string, days = 14): Promise<DayHistory[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const sessions = await prisma.loginSession.findMany({ where: { userId, loginAt: { gte: since } }, orderBy: { loginAt: "asc" } });

  const byDay = new Map<string, { seconds: number; firstLogin: Date; sessions: SessionSegment[] }>();
  for (const s of sessions) {
    const key = s.loginAt.toISOString().slice(0, 10);
    const secs = Math.max(0, (s.lastPingAt.getTime() - s.loginAt.getTime()) / 1000);
    const segment: SessionSegment = { loginAt: s.loginAt.toISOString(), lastPingAt: s.lastPingAt.toISOString(), seconds: Math.round(secs) };
    const existing = byDay.get(key);
    if (existing) {
      existing.seconds += secs;
      existing.sessions.push(segment);
      if (s.loginAt < existing.firstLogin) existing.firstLogin = s.loginAt;
    } else {
      byDay.set(key, { seconds: secs, firstLogin: s.loginAt, sessions: [segment] });
    }
  }

  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, seconds: Math.round(v.seconds), firstLogin: v.firstLogin.toISOString(), sessions: v.sessions }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
