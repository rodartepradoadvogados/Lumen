"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || "escritorio";
}

async function uniqueOfficeSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 1;
  while (await prisma.office.findUnique({ where: { slug } })) {
    suffix++;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

// Cadastro público de um novo escritório (tenant) — cria o Office e seu primeiro usuário
// (administrador) numa única transação, já loga automaticamente ao final. Este é o único
// jeito de um Office novo passar a existir no sistema (não há convite de admin externo aqui,
// diferente da criação de membros de equipe em Configurações, que exige um admin já logado).
export async function signupOffice(data: {
  officeName: string;
  adminName: string;
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const officeName = data.officeName.trim();
  const adminName = data.adminName.trim();
  const email = data.email.trim().toLowerCase();

  if (!officeName || !adminName || !email) {
    return { error: "Preencha o nome do escritório, seu nome e seu e-mail." };
  }
  if (data.password.length < 6) {
    return { error: "A senha deve ter ao menos 6 caracteres." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Já existe uma conta cadastrada com esse e-mail." };
  }

  const slug = await uniqueOfficeSlug(slugify(officeName));
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const office = await tx.office.create({ data: { name: officeName, slug } });
    return tx.user.create({
      data: {
        name: adminName,
        email,
        passwordHash,
        role: "Admin",
        isAdmin: true,
        financeAccess: true,
        officeId: office.id,
      },
    });
  });

  const token = await signSession(user.id);
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  await prisma.loginSession.create({ data: { userId: user.id, officeId: user.officeId } });
  redirect("/painel");
}
