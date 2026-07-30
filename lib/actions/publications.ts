"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { normalizeProcessNumber, processNumberIncludes } from "@/lib/processNumber";
import { delegateTask, acknowledgeDelegation } from "@/lib/actions/tasks";

// Usado pelo AppBadgeSync (badge no ícone do PWA instalado, via Badging API) para saber se o
// número mudou desde a última checagem, sem precisar recarregar a página inteira.
export async function getUnreadPublicationsCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  return prisma.publication.count({
    where: { officeId: user.officeId, reads: { none: { userId: user.id } } },
  });
}

// Leitura é por usuário — marcar como lida só afeta a visão de quem clicou, nunca a dos
// colegas (diferente de anexar/agendar/delegar/triagem, que continuam compartilhados).
export async function markPublicationRead(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const pub = await prisma.publication.findFirst({ where: { id, officeId: user.officeId }, select: { id: true } });
  if (!pub) return;
  await prisma.publicationRead.upsert({
    where: { publicationId_userId: { publicationId: id, userId: user.id } },
    create: { publicationId: id, userId: user.id },
    update: {},
  });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

export async function markPublicationUnread(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const pub = await prisma.publication.findFirst({ where: { id, officeId: user.officeId }, select: { id: true } });
  if (!pub) return;
  await prisma.publicationRead.deleteMany({ where: { publicationId: id, userId: user.id } });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

export async function markAllPublicationsRead() {
  const user = await getCurrentUser();
  if (!user) return { count: 0 };
  const unread = await prisma.publication.findMany({
    where: { officeId: user.officeId, reads: { none: { userId: user.id } } },
    select: { id: true },
  });
  if (unread.length === 0) return { count: 0 };
  const result = await prisma.publicationRead.createMany({
    data: unread.map((p) => ({ publicationId: p.id, userId: user.id })),
    skipDuplicates: true,
  });
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  return { count: result.count };
}

// Igual a markAllPublicationsRead, mas restrito às publicações/andamentos de um único
// processo — usado pelo botão na aba Publicações da página do Processo.
export async function markAllPublicationsReadForCase(caseId: string) {
  const user = await getCurrentUser();
  if (!user) return { count: 0 };
  const unread = await prisma.publication.findMany({
    where: { caseId, officeId: user.officeId, reads: { none: { userId: user.id } } },
    select: { id: true },
  });
  if (unread.length === 0) return { count: 0 };
  const result = await prisma.publicationRead.createMany({
    data: unread.map((p) => ({ publicationId: p.id, userId: user.id })),
    skipDuplicates: true,
  });
  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  return { count: result.count };
}

// ===== RIDT — fila de triagem de publicações com atribuição de responsável =====
// A atribuição por publicação acontece via "Delegar" (delegateTask, lib/actions/tasks.ts, com
// publicationId — botão individual em PublicationRow) ou via a janela suspensa "Distribuir
// pendentes" (getPendingPublicationsForDistribution + submitPublicationDistribution, logo
// abaixo — em lote, com sugestão de advogado balanceada por carga atual). As duas chamam
// delegateTask por baixo, então sempre geram Task + setam Publication.assignedToId. O antigo
// assignPublication (select "Sem responsável" mudando o campo em silêncio, sem gerar tarefa nem
// avisar ninguém) foi removido para não duplicar esse fluxo.

export async function setPublicationTriageStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.publication.updateMany({ where: { id, officeId: user.officeId }, data: { triageStatus: status } });
  revalidatePath("/publicacoes");
}

export type DistributionRow = {
  id: string;
  processNumber: string | null;
  title: string;
  content: string;
  suggestedUserId: string | null;
};

// Alimenta a janela suspensa de "Distribuir pendentes" (DistributePublicationsButton): lista as
// publicações pendentes sem responsável e, pra cada uma, uma SUGESTÃO de advogado (mesmo
// balanceamento por carga atual + regra de tag "Jairo"/"Rodrigo" que a distribuição automática
// antiga usava) — o admin ainda revisa/ajusta cada linha antes de confirmar, nada é gravado aqui.
export async function getPendingPublicationsForDistribution(): Promise<{
  error?: string;
  rows?: DistributionRow[];
  users?: { id: string; name: string }[];
}> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem distribuir publicações." };

  const eligible = await prisma.user.findMany({
    where: { active: true, role: { in: ["Advogado", "Sócio"] }, officeId: viewer.officeId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const pending = await prisma.publication.findMany({
    where: { triageStatus: "PENDENTE", assignedToId: null, officeId: viewer.officeId },
    include: { case: true, client: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  const currentCounts = eligible.length
    ? await prisma.publication.groupBy({
        by: ["assignedToId"],
        where: { triageStatus: { in: ["PENDENTE", "EM_ANALISE"] }, assignedToId: { not: null }, officeId: viewer.officeId },
        _count: { _all: true },
      })
    : [];
  const loadByUser = new Map<string, number>();
  for (const u of eligible) loadByUser.set(u.id, 0);
  for (const c of currentCounts) {
    if (c.assignedToId && loadByUser.has(c.assignedToId)) loadByUser.set(c.assignedToId, c._count._all);
  }

  function pickBalanced(): string | null {
    if (eligible.length === 0) return null;
    return eligible
      .slice()
      .sort((a, b) => {
        const la = loadByUser.get(a.id) ?? 0;
        const lb = loadByUser.get(b.id) ?? 0;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name, "pt-BR");
      })[0].id;
  }

  const rows: DistributionRow[] = pending.map((pub) => {
    const tag = pub.lawyerTag?.trim();
    let suggestedUserId: string | null = null;
    if (tag === "Jairo" || tag === "Rodrigo") {
      suggestedUserId = eligible.find((u) => u.name.toLowerCase().includes(tag.toLowerCase()))?.id ?? null;
    }
    if (!suggestedUserId) suggestedUserId = pickBalanced();
    if (suggestedUserId) loadByUser.set(suggestedUserId, (loadByUser.get(suggestedUserId) ?? 0) + 1);

    return {
      id: pub.id,
      processNumber: pub.case?.processNumber ?? null,
      title: pub.case?.title ?? (pub.client ? `Cliente compatível: ${pub.client.name}` : "Sem processo vinculado"),
      content: pub.content,
      suggestedUserId,
    };
  });

  return { rows, users: eligible };
}

// Confirma a distribuição em lote (um item por linha da janela suspensa). Para cada
// publicação com pelo menos um advogado selecionado e prazo preenchido, cria uma Task
// delegada (mesma lógica de "Delegar" — delegateTask, com publicationId) por advogado
// escolhido; se "pedir confirmação" não estiver marcado, a delegação já nasce reconhecida
// (não fica bloqueando a Central de Alertas de ninguém).
export async function submitPublicationDistribution(
  items: { publicationId: string; userIds: string[]; dueDate: string; requireConfirmation: boolean }[]
): Promise<{ error?: string; created?: number }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem distribuir publicações." };

  const toProcess = items.filter((i) => i.userIds.length > 0 && i.dueDate);
  if (toProcess.length === 0) return { created: 0 };

  const pubs = await prisma.publication.findMany({
    where: { id: { in: toProcess.map((i) => i.publicationId) }, officeId: viewer.officeId },
    include: { case: true },
  });
  const pubById = new Map(pubs.map((p) => [p.id, p]));

  let created = 0;
  for (const item of toProcess) {
    const pub = pubById.get(item.publicationId);
    if (!pub) continue;
    const title = pub.case?.title
      ? `Publicação — ${pub.case.title}`
      : pub.processNumberRaw
        ? `Publicação — ${pub.processNumberRaw}`
        : "Publicação sem processo vinculado";

    for (const userId of item.userIds) {
      const result = await delegateTask({
        responsibleIds: [userId],
        type: "PRAZO",
        title,
        dueDate: item.dueDate,
        priority: "MEDIA",
        caseId: pub.caseId || undefined,
        publicationId: pub.id,
      });
      const taskId = result.taskIds?.[0];
      if (result.error || !taskId) continue;
      if (!item.requireConfirmation) await acknowledgeDelegation(taskId);
      created++;
    }
  }

  revalidatePath("/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/agenda");
  revalidatePath("/kanban");
  revalidatePath("/painel");
  return { created };
}

// Busca de processos já cadastrados (por título ou número), para o chooser "Vincular a
// processo já existente" que aparece quando uma publicação não tem processo compatível.
// A busca por número ignora qualquer máscara (pontos, hífen, barra) — ver lib/processNumber.ts.
export async function searchCasesForLinking(query: string): Promise<{ id: string; title: string; processNumber: string | null }[]> {
  const q = query.trim();
  if (!q) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  const byTitle = await prisma.case.findMany({
    where: { title: { contains: q, mode: "insensitive" }, officeId: user.officeId },
    select: { id: true, title: true, processNumber: true },
    orderBy: { title: "asc" },
    take: 15,
  });

  const normalizedQuery = normalizeProcessNumber(q);
  if (!normalizedQuery || byTitle.length >= 15) return byTitle;

  const candidates = await prisma.case.findMany({
    where: { processNumber: { not: null }, officeId: user.officeId },
    select: { id: true, title: true, processNumber: true },
    orderBy: { title: "asc" },
  });
  const byNumber = candidates.filter((c) => processNumberIncludes(c.processNumber, q) && !byTitle.some((existing) => existing.id === c.id));

  return [...byTitle, ...byNumber].slice(0, 15);
}

export async function linkPublicationToCase(publicationId: string, caseId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const targetCase = await prisma.case.findFirst({ where: { id: caseId, officeId: user.officeId }, select: { id: true } });
  if (!targetCase) return;
  await prisma.publication.updateMany({ where: { id: publicationId, officeId: user.officeId }, data: { caseId } });
  revalidatePath("/publicacoes");
  revalidatePath("/m/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
}

// ===== Bloqueio de processo não cadastrado (LinkPublicationMenu — botão "Bloquear") =====
// Só faz sentido para publicação/andamento SEM processo vinculado: um processo já cadastrado é
// justamente o que o escritório quer acompanhar. Efeito é POR USUÁRIO: a Publication continua
// existindo normalmente pro escritório inteiro, só some da fila/fica marcada como tratada para
// quem bloqueou — os demais advogados do mesmo escritório continuam recebendo normalmente.

export type BlockedProcessNumberRow = {
  id: string;
  displayNumber: string;
  createdAt: string;
};

export async function blockProcessNumber(publicationId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const pub = await prisma.publication.findFirst({
    where: { id: publicationId, officeId: user.officeId },
    select: { id: true, caseId: true, processNumberRaw: true },
  });
  if (!pub) return { error: "Publicação não encontrada." };
  if (pub.caseId) return { error: "Este processo já está cadastrado — o bloqueio só é permitido para processos não cadastrados." };
  if (!pub.processNumberRaw) return { error: "Esta publicação não tem número de processo identificado." };

  const normalized = normalizeProcessNumber(pub.processNumberRaw);
  if (!normalized) return { error: "Não foi possível interpretar o número deste processo." };

  await prisma.blockedProcessNumber.upsert({
    where: { userId_processNumber: { userId: user.id, processNumber: normalized } },
    update: {},
    create: { officeId: user.officeId, processNumber: normalized, displayNumber: pub.processNumberRaw, userId: user.id },
  });

  // Publicações/andamentos já recebidos desse mesmo processo somem só da fila de quem bloqueou —
  // nunca apagados (mesmo princípio de nunca destruir dado usado no resto do Lúmen), só marcados
  // como lidos para este usuário. triageStatus é do escritório inteiro, então não mexemos nele
  // aqui (os demais advogados continuam vendo a publicação normalmente, inclusive na triagem).
  const semCaso = await prisma.publication.findMany({
    where: { officeId: user.officeId, caseId: null, processNumberRaw: { not: null } },
    select: { id: true, processNumberRaw: true },
  });
  const idsDoProcesso = semCaso.filter((p) => normalizeProcessNumber(p.processNumberRaw!) === normalized).map((p) => p.id);

  if (idsDoProcesso.length > 0) {
    await prisma.publicationRead.createMany({
      data: idsDoProcesso.map((pubId) => ({ publicationId: pubId, userId: user.id })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/publicacoes");
  revalidatePath("/m/publicacoes");
  revalidatePath("/alertas");
  revalidatePath("/painel");
  revalidatePath("/configuracoes");
  return {};
}

export async function unblockProcessNumber(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  // Só quem bloqueou pode reverter — bloqueio é pessoal, não do escritório.
  const existing = await prisma.blockedProcessNumber.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!existing) return { error: "Bloqueio não encontrado." };
  await prisma.blockedProcessNumber.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}
