"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

async function requirePlatformOwner() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) throw new Error("Apenas donos da plataforma podem gerenciar a equipe da Lúmen.");
}

function revalidateEquipeLumen() {
  revalidatePath("/painel-mestre/equipe");
}

// Vincula um usuário de escritório já existente como membro da Lúmen.
export async function createPlatformMemberFromUser(userId: string, roleId: string) {
  await requirePlatformOwner();
  const existing = await prisma.platformMember.findUnique({ where: { userId } });
  if (existing) throw new Error("Este usuário já é um membro da Lúmen.");
  await prisma.platformMember.create({ data: { userId, roleId } });
  revalidateEquipeLumen();
}

// Cadastra alguém exclusivo da Lúmen, sem vínculo com nenhum escritório. Guarda a senha com o
// mesmo hash usado no cadastro normal (lib/auth.ts) — login() em lib/actions/auth.ts autentica
// contra PlatformMember.passwordHash quando o e-mail não bate com nenhum User, redirecionando
// direto pro Painel Mestre (achado A12 da revisão gauntlet: antes disto não existia NENHUM
// jeito de logar como PlatformMember standalone).
export async function createStandalonePlatformMember(data: { name: string; email: string; password: string; roleId: string }) {
  await requirePlatformOwner();
  if (!data.name || !data.email || !data.password || !data.roleId) throw new Error("Preencha todos os campos.");
  const existing = await prisma.platformMember.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("Já existe um membro com este e-mail.");
  // E-mail é identificador único GLOBAL (mesmo princípio do login, ver lib/actions/auth.ts) — um
  // PlatformMember standalone com o e-mail de um User já existente nunca conseguiria logar (o
  // login tenta User primeiro), virando um cadastro fantasma sem forma de acessar.
  const existingUser = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existingUser) throw new Error("Já existe um usuário de escritório com este e-mail — vincule-o em vez de cadastrar como novo membro.");
  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.platformMember.create({
    data: { name: data.name, email: data.email, passwordHash, roleId: data.roleId },
  });
  revalidateEquipeLumen();
}

export async function updatePlatformMemberRole(id: string, roleId: string) {
  await requirePlatformOwner();
  await prisma.platformMember.update({ where: { id }, data: { roleId } });
  revalidateEquipeLumen();
}

export async function togglePlatformMemberActive(id: string, active: boolean) {
  await requirePlatformOwner();
  await prisma.platformMember.update({ where: { id }, data: { active } });
  revalidateEquipeLumen();
}
