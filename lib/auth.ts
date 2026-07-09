import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "rp_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-insecure-secret");

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
