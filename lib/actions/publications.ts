"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

// Usado pelo AppBadgeSync (badge no ícone do PWA instalado, via Badging API) para saber se o
// número mudou desde a última checagem, sem precisar recarregar a página inteira.
export async function getUnreadPublicationsCount(): Promise<number> {
  return prisma.publication.count({ where: { read: false } });
}

export async function markPublicationRead(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

export async function markPublicationUnread(id: string) {
  await prisma.publication.update({ where: { id }, data: { read: false } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

export async function markAllPublicationsRead() {
  const result = await prisma.publication.updateMany({ where: { read: false }, data: { read: true } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  return { count: result.count };
}

// ===== RIDT — fila de triagem de publicações com atribuição de responsável =====
// A atribuição manual por publicação agora acontece só via "Delegar" (delegateTask,
// lib/actions/tasks.ts, com publicationId) — que também seta Publication.assignedToId — e
// via distribuição automática balanceada logo abaixo. O antigo assignPublication (select
// "Sem responsável" mudando o campo em silêncio, sem gerar tarefa nem avisar ninguém) foi
// removido para não duplicar esse fluxo.

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

// Busca de processos já cadastrados (por título ou número), para o chooser "Vincular a
// processo já existente" que aparece quando uma publicação não tem processo compatível.
export async function searchCasesForLinking(query: string): Promise<{ id: string; title: string; processNumber: string | null }[]> {
  const q = query.trim();
  if (!q) return [];
  return prisma.case.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { processNumber: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, processNumber: true },
    orderBy: { title: "asc" },
    take: 15,
  });
}

export async function linkPublicationToCase(publicationId: string, caseId: string) {
  await prisma.publication.update({ where: { id: publicationId }, data: { caseId } });
  revalidatePath("/publicacoes");
  revalidatePath("/m/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
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
  revalidatePath("/painel");
  if (pub.caseId) revalidatePath(`/processos/${pub.caseId}`);
}
