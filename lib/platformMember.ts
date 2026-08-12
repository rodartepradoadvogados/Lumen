import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

// Passo 1 da fundação de dados da Lúmen: este módulo é a contraparte de lib/currentUser.ts
// para o lado da plataforma (a empresa por trás do produto), não uma extensão dela. Nenhuma
// tela chama nada daqui ainda — é contrato pronto para o Passo 3, dormente até lá.

export const PLATFORM_CTX_COOKIE = "lumen_platform_ctx";

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

// Devolve o membro da Lúmen da sessão atual, ou null. Exige DOIS fatores presentes ao mesmo
// tempo — sessão de escritório válida E cookie de contexto Lúmen — porque não existe sessão
// que seja escritório e plataforma ao mesmo tempo (ver enterPlatformContext). NUNCA devolve
// nada que dê acesso a dado de escritório: é a contraparte de getCurrentUser(), não uma
// extensão dela.
export async function getPlatformMember(): Promise<PlatformViewer | null> {
  const sessionToken = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;
  const session = await verifySession(sessionToken);
  if (!session) return null;

  const ctxCookie = cookies().get(PLATFORM_CTX_COOKIE)?.value;
  if (!ctxCookie) return null;

  const member = await prisma.platformMember.findUnique({
    where: { userId: session.userId },
    include: { role: true, user: { select: { name: true, email: true } } },
  });
  if (!member || !member.active) return null;

  return toPlatformViewer(member);
}

// Entrar no contexto Lúmen exige reconfirmar a senha, mesmo já estando logado — é o mesmo
// princípio de "step-up auth" do sudo/re-auth de painéis administrativos: a sessão de
// escritório sozinha nunca é suficiente pra abrir a capacidade de plataforma.
export async function enterPlatformContext(password: string): Promise<{ error?: string }> {
  const sessionToken = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return { error: "Sessão inválida." };
  const session = await verifySession(sessionToken);
  if (!session) return { error: "Sessão inválida." };

  const member = await prisma.platformMember.findUnique({ where: { userId: session.userId } });
  if (!member || !member.active) return { error: "Este usuário não tem acesso à Lúmen." };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.passwordHash) return { error: "Sessão inválida." };

  // Mesmo utilitário de comparação de hash usado no login (ver lib/actions/auth.ts) — não
  // reimplementar bcrypt aqui.
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Senha incorreta." };

  cookies().set(PLATFORM_CTX_COOKIE, member.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 horas
  });
  return {};
}

export async function exitPlatformContext(): Promise<void> {
  // Path explícito: o cookie nasce com path "/" (ver acima) — sem isso aqui, sair a partir de
  // uma rota de mais de 1 nível grava o Set-Cookie de exclusão num path diferente do original e
  // a sessão de contexto de plataforma nunca é derrubada de fato (mesmo bug de lib/actions/auth.ts:logout).
  cookies().delete({ name: PLATFORM_CTX_COOKIE, path: "/" });
}
