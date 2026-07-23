"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { sendPushIfEnabled } from "@/lib/push";

// 24h antes do prazo fatal — como dueDate representa a data-calendário (meia-noite) e dueTime
// é só um rótulo de exibição separado (sem ser combinado no timestamp), subtrair exatamente
// 24h do dueDate já dá o dia anterior, mantendo o mesmo dueTime como rótulo do prazo de
// segurança (24h antes do mesmo horário é o mesmo horário, um dia antes).
function computeSafetyDueDate(dueDate: Date): Date {
  return new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);
}

export async function moveTask(taskId: string, columnId: string, columnOrder: number) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.task.updateMany({
    where: { id: taskId, officeId: viewer.officeId },
    data: { columnId, columnOrder },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
}

export async function toggleTaskDone(taskId: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  const task = await prisma.task.findFirstOrThrow({ where: { id: taskId, officeId: viewer.officeId } });
  const isDone = task.status === "CONCLUIDO";
  const doneColumn = await prisma.kanbanColumn.findFirst({ where: { isDoneCol: true, officeId: viewer.officeId } });
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: isDone ? "PENDENTE" : "CONCLUIDO",
      completedAt: isDone ? null : new Date(),
      columnId: !isDone && doneColumn ? doneColumn.id : task.columnId,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/alertas");
}

export async function createTask(data: {
  title: string;
  type: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  caseId?: string;
  attendanceId?: string;
  responsibleId?: string;
  columnId?: string;
  description?: string;
  meetingType?: string;
  location?: string;
  meetingUrl?: string;
  points?: number;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return;

  const firstColumn = data.columnId ? null : await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } });

  // TaskScore: usa o override manual se informado; senão, o padrão do tipo (fallback 10).
  let points = data.points;
  if (points == null || Number.isNaN(points)) {
    const typePoints = await prisma.taskTypePoints.findUnique({ where: { officeId_type: { officeId: viewer.officeId, type: data.type } } });
    points = typePoints?.points ?? 10;
  }

  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      responsibleId: data.responsibleId || null,
      columnId: data.columnId || firstColumn?.id || null,
      description: data.description || null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: data.meetingUrl || null,
      points,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/m/agenda");
  if (data.attendanceId) revalidatePath(`/atendimento/${data.attendanceId}`);
  if (data.caseId) revalidatePath(`/m/processos/${data.caseId}`);
}

// Delega um compromisso a outro membro da equipe: reaproveita a mesma lógica de
// criação de `createTask` (pontuação padrão, coluna inicial do kanban etc.), mas
// grava `delegatedById` além de `responsibleId` — é esse campo extra que diferencia
// uma tarefa delegada de uma tarefa comum que alguém cria pra si mesmo, e que faz
// o alerta "TAREFA_DELEGADA" aparecer só para quem recebeu (ver lib/alerts.ts).
export async function delegateTask(data: {
  responsibleId: string;
  type: string;
  title: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  description?: string;
  caseId?: string;
  attendanceId?: string;
  // Preenchido quando a delegação nasce do botão "Delegar" de uma publicação
  // (components/PublicationRow.tsx) — linka a Task criada à publicação de origem e marca essa
  // pessoa como responsável pela triagem dela, no lugar do antigo select "Sem responsável"
  // (que só trocava o campo silenciosamente, sem gerar tarefa nem avisar ninguém).
  publicationId?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Usuário não autenticado." };
  if (!data.responsibleId) return { error: "Selecione o membro da equipe que vai receber a delegação." };

  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } });

  const typePoints = await prisma.taskTypePoints.findUnique({ where: { officeId_type: { officeId: viewer.officeId, type: data.type } } });
  const points = typePoints?.points ?? 10;

  const dueDate = new Date(data.dueDate);

  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate,
      dueTime: data.dueTime || null,
      safetyDueDate: computeSafetyDueDate(dueDate),
      priority: data.priority,
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      publicationId: data.publicationId || null,
      responsibleId: data.responsibleId,
      delegatedById: viewer.id,
      columnId: firstColumn?.id || null,
      description: data.description || null,
      points,
      officeId: viewer.officeId,
    },
  });

  if (data.publicationId) {
    await prisma.publication.updateMany({ where: { id: data.publicationId, officeId: viewer.officeId }, data: { assignedToId: data.responsibleId } });
    revalidatePath("/publicacoes");
  }

  revalidatePath("/agenda");
  revalidatePath("/kanban");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath("/produtividade");

  sendPushIfEnabled(data.responsibleId, "tarefasDelegadas", {
    title: "Nova tarefa delegada",
    body: `${viewer.name} delegou: ${data.title}`,
    url: "/m/agenda",
  }).catch(() => {});

  return {};
}

// Marca a delegação como vista: chamado quando o destinatário abre o card da tarefa
// a partir do alerta na Central de Alertas — some do alerta sem afetar o compromisso.
export async function acknowledgeDelegation(taskId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.task.updateMany({ where: { id: taskId, officeId: viewer.officeId }, data: { delegationAcknowledgedAt: new Date() } });
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

// Busca resumida de Processos/Casos para o passo 3 do formulário de delegação —
// `judicial` filtra por `type === "JUDICIAL"` (Processo) ou `type !== "JUDICIAL"` (Caso).
export async function searchCasesForDelegation(query: string, judicial: boolean): Promise<{ id: string; label: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const q = query.trim();
  if (!q) return [];
  const cases = await prisma.case.findMany({
    where: {
      officeId: viewer.officeId,
      type: judicial ? "JUDICIAL" : { not: "JUDICIAL" },
      OR: [{ title: { contains: q, mode: "insensitive" } }, { processNumber: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, title: true, processNumber: true },
    orderBy: { title: "asc" },
    take: 15,
  });
  return cases.map((c) => ({ id: c.id, label: c.processNumber ? `${c.title} — ${c.processNumber}` : c.title }));
}

// Busca resumida de Atendimentos para o passo 3 do formulário de delegação.
export async function searchAttendancesForDelegation(query: string): Promise<{ id: string; label: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const q = query.trim();
  if (!q) return [];
  const attendances = await prisma.attendance.findMany({
    where: {
      officeId: viewer.officeId,
      OR: [{ clientName: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, clientName: true, subject: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return attendances.map((a) => ({ id: a.id, label: `${a.clientName} — ${a.subject}` }));
}

export type TaskDetail = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  dueDate: string;
  dueTime: string | null;
  priority: string;
  status: string;
  meetingType: string | null;
  location: string | null;
  meetingUrl: string | null;
  responsibleId: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
};

// Usado pelo card de compromisso (aberto a partir de um alerta ou da lista de prazos
// atrasados do painel): traz a tarefa completa + a lista de responsáveis possíveis,
// já serializada (sem Date) para poder ser chamado direto de um client component.
export async function getTaskDetail(id: string): Promise<{ task: TaskDetail | null; users: { id: string; name: string }[] }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { task: null, users: [] };
  const [task, users] = await Promise.all([
    prisma.task.findFirst({
      where: { id, officeId: viewer.officeId },
      include: { case: { select: { id: true, title: true, processNumber: true } } },
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!task) return { task: null, users };
  return {
    task: {
      id: task.id,
      title: task.title,
      type: task.type,
      description: task.description,
      dueDate: task.dueDate.toISOString(),
      dueTime: task.dueTime,
      priority: task.priority,
      status: task.status,
      meetingType: task.meetingType,
      location: task.location,
      meetingUrl: task.meetingUrl,
      responsibleId: task.responsibleId,
      case: task.case,
    },
    users,
  };
}

// Troca só o responsável de uma tarefa já existente, sem precisar reenviar título/tipo/
// prazo/prioridade (que updateTask exige) — usado pela lista de tarefas do Processo no
// app mobile, que hoje não tem nenhuma tela de edição completa de tarefa.
export async function setTaskResponsible(taskId: string, responsibleId: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  const existing = await prisma.task.findFirst({ where: { id: taskId, officeId: viewer.officeId } });
  if (!existing) return;
  const task = await prisma.task.update({ where: { id: taskId }, data: { responsibleId: responsibleId || null } });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/m/agenda");
  if (task.caseId) {
    revalidatePath(`/processos/${task.caseId}`);
    revalidatePath(`/m/processos/${task.caseId}`);
  }
}

export async function updateTask(id: string, data: {
  title: string;
  type: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  responsibleId?: string;
  description?: string;
  meetingType?: string;
  location?: string;
  meetingUrl?: string;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  const existing = await prisma.task.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!existing) return;
  await prisma.task.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      priority: data.priority,
      responsibleId: data.responsibleId || null,
      description: data.description || null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: data.meetingUrl || null,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/alertas");
}

export async function addComment(data: { content: string; authorId: string; taskId?: string; caseId?: string }) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  const mentionNames = Array.from(data.content.matchAll(/@([\p{L}\s]+?)(?=(@|$|\n))/gu)).map((m) => m[1].trim());
  const comment = await prisma.comment.create({
    data: {
      content: data.content,
      authorId: data.authorId,
      taskId: data.taskId || null,
      caseId: data.caseId || null,
      officeId: viewer.officeId,
    },
    include: { author: true },
  });

  if (mentionNames.length > 0) {
    const users = await prisma.user.findMany({ where: { officeId: viewer.officeId } });
    for (const name of mentionNames) {
      const user = users.find((u) => name.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(name.toLowerCase()));
      if (user && user.id !== data.authorId) {
        await prisma.mention.create({ data: { commentId: comment.id, userId: user.id, officeId: viewer.officeId } });
        const url = data.caseId ? `/m/processos/${data.caseId}` : "/m";
        await sendPushIfEnabled(user.id, "mencao", {
          title: "Você foi mencionado",
          body: `${comment.author.name}: ${data.content.slice(0, 120)}`,
          url,
        }).catch(() => {});
      }
    }
  }

  if (data.taskId) revalidatePath(`/kanban`);
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  revalidatePath("/alertas");
}
