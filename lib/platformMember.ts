import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME, verifyPlatformMemberSession, PLATFORM_MEMBER_SESSION_COOKIE } from "@/lib/auth";
import { getCurrentUser } from "@/lib/currentUser";

// Contraparte de lib/currentUser.ts para o lado da plataforma (a empresa por trás do produto,
// não um escritório-cliente) — acesso ao Painel Mestre (achado A12 da revisão gauntlet: as duas
// funções de login por papel de plataforma existiam desde o Passo 1 mas nunca foram ligadas a
// nenhuma tela; nem sequer existia um jeito de logar como PlatformMember standalone).

export type PlatformViewer = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  maxVisibility: string;
  canManageBilling: boolean;
  canManageMembers: boolean;
  canApproveAccess: boolean;
};

function toPlatformViewer(member: {
  id: string;
  name: string | null;
  email: string | null;
  user: { name: string; email: string } | null;
  role: {
    key: string;
    maxVisibility: string;
    canManageBilling: boolean;
    canManageMembers: boolean;
    canApproveAccess: boolean;
  };
}): PlatformViewer {
  return {
    id: member.id,
    name: member.user?.name ?? member.name ?? "",
    email: member.user?.email ?? member.email ?? "",
    roleKey: member.role.key,
    maxVisibility: member.role.maxVisibility,
    canManageBilling: member.role.canManageBilling,
    canManageMembers: member.role.canManageMembers,
    canApproveAccess: member.role.canApproveAccess,
  };
}

// Devolve o membro de equipe da Lúmen da sessão atual, ou null — sempre um dos dois caminhos
// abaixo, nunca os dois ao mesmo tempo (um PlatformMember tem userId OU tem email/passwordHash
// próprios, nunca as duas coisas, ver model no schema). NUNCA devolve nada que dê acesso a
// dado de escritório: é a contraparte de getCurrentUser(), não uma extensão dela.
export async function getPlatformMember(): Promise<PlatformViewer | null> {
  // Caminho 1: PlatformMember standalone (sem User de escritório, userId nulo) — sessão própria,
  // gravada no login (lib/actions/auth.ts) quando o e-mail não bate com nenhum User.
  const pmToken = cookies().get(PLATFORM_MEMBER_SESSION_COOKIE)?.value;
  if (pmToken) {
    const pmSession = await verifyPlatformMemberSession(pmToken);
    if (!pmSession) return null;
    const member = await prisma.platformMember.findUnique({
      where: { id: pmSession.platformMemberId },
      include: { role: true, user: { select: { name: true, email: true } } },
    });
    if (!member || !member.active) return null;
    return toPlatformViewer(member);
  }

  // Caminho 2: User de escritório com PlatformMember vinculado (userId preenchido, ex.: os
  // próprios donos quando também aparecem cadastrados na Equipe da Lúmen, ou um contratado que
  // também é usuário de um escritório-cliente) — checagem AO VIVO a cada chamada, sem cookie de
  // "contexto" separado exigindo senha de novo: a sessão de escritório já provou quem a pessoa é
  // no login, mesmo nível de confiança que User.isPlatformOwner já recebe (getCurrentUser, sem
  // nenhum passo a mais).
  const sessionToken = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;
  const session = await verifySession(sessionToken);
  if (!session) return null;

  const member = await prisma.platformMember.findUnique({
    where: { userId: session.userId },
    include: { role: true, user: { select: { name: true, email: true } } },
  });
  if (!member || !member.active) return null;
  return toPlatformViewer(member);
}

export type PlatformAccess = {
  name: string;
  email: string;
  isOwner: boolean;
  // Presente só quando o acesso vem de um PlatformMember com papel (ladder de visibilidade) —
  // ausente para o dono puro (User.isPlatformOwner), que não precisa de papel: enxerga tudo.
  member: PlatformViewer | null;
};

// Gate único de acesso ao Painel Mestre — dono da plataforma (User.isPlatformOwner) OU membro
// de equipe cadastrado e ativo (getPlatformMember, cobre os dois caminhos acima). Redireciona e
// nunca devolve algo que não seja um acesso válido; chamar isto substitui, em cada
// página/layout de app/painel-mestre/, o antigo par "getCurrentUser + if (!isPlatformOwner)"
// que só reconhecia o dono.
export async function requirePlatformAccess(): Promise<PlatformAccess> {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (viewer?.isPlatformOwner) {
    return { name: viewer.name, email: viewer.email, isOwner: true, member: null };
  }

  const member = await getPlatformMember();
  if (member) {
    return { name: member.name, email: member.email, isOwner: false, member };
  }

  // Sem acesso: quem já tem uma sessão de escritório (User comum, sem privilégio de
  // plataforma) volta pro próprio painel; quem não tem sessão nenhuma volta pro login.
  redirect(viewer ? "/painel" : "/");
}

// Mesma checagem de requirePlatformAccess acima, mas em booleano — para os Server Actions do
// Painel Mestre (não páginas: aqui não cabe redirect(), o chamador decide o que fazer com um
// false, normalmente devolver {error}). Abrir a TELA pro time e deixar toda ação dentro dela
// travada em "apenas donos" tornaria o acesso inútil (achado A12 da revisão gauntlet) — por
// isso qualquer membro ativo já basta aqui, não só o dono. Gerenciar a própria equipe (criar/
// desativar membro, trocar papel) continua owner-only de propósito, à parte desta função — ver
// requirePlatformOwner em lib/actions/platformEquipe.ts.
export async function isPlatformStaff(): Promise<boolean> {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (viewer?.isPlatformOwner) return true;
  return Boolean(await getPlatformMember());
}
