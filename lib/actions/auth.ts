"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { getCurrentUser } from "@/lib/currentUser";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Mostra só a 1ª letra e as 2 últimas do que vem antes do "@", o resto com "***" —
// confirma pro usuário qual e-mail vai receber o link sem expor o endereço completo.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local.slice(-2)}@${domain}`;
}

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Login por e-mail (não por username): num sistema multi-tenant, e-mail é o único
// identificador que continua único GLOBALMENTE (username agora é só um apelido por
// escritório, ver prisma/schema.prisma) — login por e-mail evita qualquer ambiguidade
// entre escritórios diferentes sem exigir que o usuário informe também qual escritório é o seu.
export async function login(email: string, password: string, next?: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash) {
    return { error: "E-mail ou senha inválidos." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "E-mail ou senha inválidos." };
  }
  const token = await signSession(user.id);
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  await prisma.loginSession.create({ data: { userId: user.id, officeId: user.officeId } });
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/painel");
}

export async function logout() {
  // O cookie de sessão é sempre gravado com path "/" (ver login() acima). `delete(name)` sem
  // opções usa como path padrão o diretório da própria URL da Server Action — que só coincide
  // com "/" quando "Sair" é clicado a partir de uma rota de 1 nível (ex.: /painel). Clicado de
  // uma rota mais profunda (ex.: /processos/123), o Set-Cookie de exclusão nasce com path
  // "/processos" e nunca chega a sobrescrever o cookie original: o navegador mantém os dois,
  // a sessão nunca é derrubada de fato e o usuário parece preso, sempre logado de novo depois
  // do redirect. Path explícito garante que a exclusão sempre mira o mesmo cookie do login.
  cookies().delete({ name: SESSION_COOKIE_NAME, path: "/" });
  redirect("/");
}

// Passo 1 do "Esqueci minha senha": confirma se o login existe e devolve o e-mail
// mascarado, sem revelar mais nada — usado pela janela suspensa antes de perguntar
// "deseja redefinir a senha por e-mail?".
export async function checkLoginForReset(email: string): Promise<{ found: boolean; maskedEmail?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { found: false };
  return { found: true, maskedEmail: maskEmail(user.email) };
}

// Passo 2: gera um token de uso único (válido por 1h, guardado só como hash) e envia
// o link de redefinição para o e-mail cadastrado do usuário.
export async function requestPasswordReset(email: string): Promise<{ error?: string; sent?: boolean }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { error: "E-mail não encontrado." };

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { name: true } });
  const resetUrl = `${getAppUrl()}/redefinir-senha?token=${rawToken}`;
  const result = await sendPasswordResetEmail(user.email, resetUrl, office?.name || "Lúmen", user.officeId);
  if (!result.sent) {
    return {
      error:
        result.reason ||
        "Não foi possível enviar agora — peça a um administrador para gerar seu link de acesso em Configurações → Equipe.",
    };
  }
  return { sent: true };
}

// Caminho que NÃO depende de e-mail nenhum: um administrador gera, na hora, um link de
// redefinição de uso único para qualquer pessoa da equipe (inclusive outro administrador) —
// mesmo mecanismo de token de requestPasswordReset acima (hash SHA-256 salvo em
// User.resetTokenHash, expiração de 1h em User.resetTokenExpiry, consumido por
// resetPasswordWithToken). Pensado para entregar por WhatsApp ou pessoalmente quando nenhum
// canal de e-mail (SMTP/Google/Microsoft) está disponível — ver sendCriticalEmailCascade em
// lib/email.ts.
export async function adminGenerateResetLink(userId: string): Promise<{ error?: string; url?: string; expiresAt?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem gerar link de redefinição." };

  const user = await prisma.user.findFirst({ where: { id: userId, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  if (!user.active) return { error: "Não é possível gerar link para um membro inativo." };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiry: expiresAt },
  });

  return { url: `${getAppUrl()}/redefinir-senha?token=${rawToken}`, expiresAt: expiresAt.toISOString() };
}

// Passo 3: valida o token (hash + expiração) e define a nova senha.
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ error?: string; success?: boolean }> {
  if (newPassword.length < 6) return { error: "A nova senha deve ter ao menos 6 caracteres." };

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return { error: "Link inválido ou expirado. Solicite uma nova redefinição de senha." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
  });
  return { success: true };
}
