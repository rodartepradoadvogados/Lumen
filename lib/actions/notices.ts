"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export async function createNotice(content: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = content.trim();
  if (!trimmed) return { error: "Escreva um recado antes de publicar." };
  await prisma.notice.create({ data: { content: trimmed, authorId: user.id } });
  revalidatePath("/painel");
  return {};
}

export async function deleteNotice(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) return { error: "Recado não encontrado." };
  if (notice.authorId !== user.id && !user.isAdmin) {
    return { error: "Apenas o autor ou um sócio pode excluir este recado." };
  }
  await prisma.notice.delete({ where: { id } });
  revalidatePath("/painel");
  return {};
}

export async function togglePinNotice(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem fixar recados." };
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) return { error: "Recado não encontrado." };
  await prisma.notice.update({ where: { id }, data: { pinned: !notice.pinned } });
  revalidatePath("/painel");
  return {};
}
