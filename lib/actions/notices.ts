"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { authorDisplayName } from "@/lib/authorDisplay";

export type SerializedNotice = {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string; color: string };
};

// Recados saíram do Painel (documento 03 do handoff do redesenho) e viraram um item do menu do
// avatar (components/TeamMonitorPanel.tsx) — que é montado em toda página autenticada, não só em
// /painel, então não dá mais para carregar a lista via prop de Server Component. Esta action
// (chamada sob demanda, mesmo padrão de fetchTeamSummaries em lib/actions/timesheet.ts) é o que
// alimenta o painel do menu agora.
export async function fetchNotices(): Promise<{ notices: SerializedNotice[]; users: { id: string; name: string }[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const [notices, users] = await Promise.all([
    prisma.notice.findMany({
      where: { officeId: user.officeId },
      include: { author: { select: { id: true, name: true, color: true, officeId: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.user.findMany({ where: { active: true, officeId: user.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return {
    notices: notices.map((n) => ({
      id: n.id,
      content: n.content,
      pinned: n.pinned,
      createdAt: n.createdAt.toISOString(),
      // author.officeId comparado e descartado aqui — mesmo tratamento de nome genérico para
      // autor "atuando como" de fora do escritório que o Painel já fazia (achado A33 do gauntlet).
      author: { id: n.author.id, name: authorDisplayName(n.author, user.officeId), color: n.author.color },
    })),
    users,
  };
}

export async function createNotice(content: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const trimmed = content.trim();
  if (!trimmed) return { error: "Escreva um recado antes de publicar." };
  await prisma.notice.create({ data: { content: trimmed, authorId: user.id, officeId: user.officeId } });
  revalidatePath("/", "layout");
  return {};
}

export async function deleteNotice(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const notice = await prisma.notice.findFirst({ where: { id, officeId: user.officeId } });
  if (!notice) return { error: "Recado não encontrado." };
  if (notice.authorId !== user.id && !user.isAdmin) {
    return { error: "Apenas o autor ou um sócio pode excluir este recado." };
  }
  await prisma.notice.delete({ where: { id } });
  revalidatePath("/", "layout");
  return {};
}

export async function togglePinNotice(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem fixar recados." };
  const notice = await prisma.notice.findFirst({ where: { id, officeId: user.officeId } });
  if (!notice) return { error: "Recado não encontrado." };
  await prisma.notice.update({ where: { id }, data: { pinned: !notice.pinned } });
  revalidatePath("/", "layout");
  return {};
}
