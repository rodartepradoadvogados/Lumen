import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "rp_session";
const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET não configurado — defina essa variável de ambiente antes de usar em produção.");
    }
    return new TextEncoder().encode("dev-only-insecure-secret");
  }
  return new TextEncoder().encode(value);
};

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export async function signSession(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// Sessão própria para um PlatformMember SEM User de escritório (userId nulo, ver
// createStandalonePlatformMember em lib/actions/platformEquipe.ts) — cookie e claim distintos
// da sessão normal de propósito: um PlatformMember standalone nunca deve ser confundido com um
// User de escritório em nenhum código que leia SESSION_COOKIE_NAME (getCurrentUser, middleware
// de rotas do app, etc.), já que ele não tem officeId nenhum (achado A12 da revisão gauntlet —
// antes disto não existia NENHUM jeito de logar como PlatformMember standalone).
export const PLATFORM_MEMBER_SESSION_COOKIE = "lumen_pm_session";

export async function signPlatformMemberSession(platformMemberId: string) {
  return new SignJWT({ platformMemberId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyPlatformMemberSession(token: string): Promise<{ platformMemberId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.platformMemberId !== "string") return null;
    return { platformMemberId: payload.platformMemberId };
  } catch {
    return null;
  }
}
