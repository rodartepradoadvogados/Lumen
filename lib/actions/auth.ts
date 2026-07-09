"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function login(username: string, password: string): Promise<{ error?: string }> {
  const user = await prisma.user.findFirst({ where: { username, active: true } });
  if (!user || !user.passwordHash) {
    return { error: "Usuário ou senha inválidos." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Usuário ou senha inválidos." };
  }
  const token = await signSession(user.id);
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export async function logout() {
  cookies().delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
