"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export async function markPublicationRead(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function markPublicationUnread(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: false } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
}

export async function markAllPublicationsRead() {
  const result = await prisma.publication.updateMany({ where: { read: false }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/");
  return { count: result.count };
}

// ===== RIDT — fila de triagem de publicações com atribuição de responsável =====

export async function assignPublication(id: string, userId: string | null) {
  await prisma.publication.update({ where: { id }, data: { assignedToId: userId || null } });
  revalidatePath("/publicacoes");
}

export async function setPublicationTriageStatus(id: string, status: string) {
  await prisma.publication.update({ where: { id }, data: { triageStatus: status } });
  revalidatePath("/publicacoes");
}

// Distribuição automática balanceada das publicações pendentes entre advogados/sócios.
// Restrita a administradores (Jairo/Rodrigo). Inspirado no Flowter do ADVBOX.
export async function distributePendingPublications(): Promise<{ assigned?: number; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem distribuir publicações." };

  const eligible = await prisma.user.findMany({
    where: { active: true, role: { in: ["Advogado", "Sócio"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (eligible.length === 0) return { error: "Nenhum advogado ou sócio ativo para distribuir." };

  const pending = await prisma.publication.findMany({
    where: { triageStatus: "PENDENTE", assignedToId: null },
    select: { id: true, lawyerTag: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  if (pending.length === 0) return { assigned: 0 };

  // Carga atual por usuário: publicações já atribuídas em triagem (PENDENTE/EM_ANALISE),
  // contada uma vez e incrementada em memória a cada atribuição para manter o balanceamento.
  const currentCounts = await prisma.publication.groupBy({
    by: ["assignedToId"],
    where: { triageStatus: { in: ["PENDENTE", "EM_ANALISE"] }, assignedToId: { not: null } },
    _count: { _all: true },
  });
  const loadByUser = new Map<string, number>();
  for (const u of eligible) loadByUser.set(u.id, 0);
  for (const c of currentCounts) {
    if (c.assignedToId && loadByUser.has(c.assignedToId)) {
      loadByUser.set(c.assignedToId, c._count._all);
    }
  }

  function pickBalanced(): { id: string; name: string } {
    return eligible
      .slice()
      .sort((a, b) => {
        const la = loadByUser.get(a.id) ?? 0;
        const lb = loadByUser.get(b.id) ?? 0;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name, "pt-BR");
      })[0];
  }

  const updates: { id: string; userId: string }[] = [];
  for (const pub of pending) {
    let target: { id: string; name: string } | undefined;

    // Regra de prioridade: tag "Jairo" ou "Rodrigo" força o usuário cujo nome contém esse primeiro nome.
    const tag = pub.lawyerTag?.trim();
    if (tag === "Jairo" || tag === "Rodrigo") {
      target = eligible.find((u) => u.name.toLowerCase().includes(tag.toLowerCase()));
    }
    // "Jairo e Rodrigo", nulo, ou nome não elegível → balanceamento normal.
    if (!target) target = pickBalanced();

    updates.push({ id: pub.id, userId: target.id });
    loadByUser.set(target.id, (loadByUser.get(target.id) ?? 0) + 1);
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.publication.update({ where: { id: u.id }, data: { assignedToId: u.userId } })
    )
  );

  revalidatePath("/publicacoes");
  return { assigned: updates.length };
}

export async function generateTaskFromPublication(
  id: string,
  data: { title: string; type: string; dueDate: string; dueTime?: string; priority: string }
) {
  const pub = await prisma.publication.findUniqueOrThrow({ where: { id } });
  const firstColumn = await prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      caseId: pub.caseId,
      publicationId: pub.id,
      columnId: firstColumn?.id,
    },
  });
  await prisma.publication.update({ where: { id }, data: { deadlineGenerated: true, read: true, triageStatus: "TRATADA" } });
  revalidatePath("/publicacoes");
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/alertas");
  revalidatePath("/");
  if (pub.caseId) revalidatePath(`/processos/${pub.caseId}`);
}
