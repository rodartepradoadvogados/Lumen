"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { sanitizeExternalUrl } from "@/lib/urlSafety";
import { sendPushIfEnabled } from "@/lib/push";
import { enqueueNotification } from "@/lib/notificationOutbox";
import { isCaseInOffice, isAttendanceInOffice, isUserInOffice, isKanbanColumnInOffice, isTaskInOffice, isLicitacaoInOffice } from "@/lib/officeScope";
import { resolvePublicationGroupForOffice } from "@/lib/publicationResolution";
import { sanitizeRichTextHtml } from "@/lib/richText";

async function assertTaskRelationsInOffice(
  data: { caseId?: string; attendanceId?: string; responsibleId?: string; columnId?: string },
  officeId: string
): Promise<void> {
  if (data.caseId && !(await isCaseInOffice(data.caseId, officeId))) throw new Error("Processo não encontrado.");
  if (data.attendanceId && !(await isAttendanceInOffice(data.attendanceId, officeId))) throw new Error("Atendimento não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.columnId && !(await isKanbanColumnInOffice(data.columnId, officeId))) throw new Error("Coluna do Kanban não encontrada.");
}

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
      // Auditoria: registra quem concluiu; ao reabrir, limpa para não deixar
      // informação errada de uma conclusão que foi desfeita.
      completedById: isDone ? null : viewer.id,
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
  strategy?: string;
  points?: number;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await assertTaskRelationsInOffice(data, viewer.officeId);

  const firstColumn = data.columnId ? null : await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } });

  // TaskScore: usa o override manual se informado; senão, o padrão do tipo (fallback 10).
  let points = data.points;
  if (points == null || Number.isNaN(points)) {
    const typePoints = await prisma.taskTypePoints.findUnique({ where: { officeId_type: { officeId: viewer.officeId, type: data.type } } });
    points = typePoints?.points ?? 10;
  }

  const dueDate = new Date(data.dueDate);
  await prisma.task.create({
    data: {
      title: data.title,
      type: data.type,
      dueDate,
      dueTime: data.dueTime || null,
      // Mesma regra de delegateTask — sem isso, uma tarefa criada por aqui (o caminho normal de
      // cadastro) nunca ganha o aviso de 24h antes do prazo fatal na Agenda.
      safetyDueDate: computeSafetyDueDate(dueDate),
      priority: data.priority,
      caseId: data.caseId || null,
      attendanceId: data.attendanceId || null,
      responsibleId: data.responsibleId || null,
      columnId: data.columnId || firstColumn?.id || null,
      description: data.description ? sanitizeRichTextHtml(data.description) : null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: sanitizeExternalUrl(data.meetingUrl),
      strategy: data.strategy || null,
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

// Delega um compromisso a um ou mais membros da equipe: reaproveita a mesma lógica de
// criação de `createTask` (pontuação padrão, coluna inicial do kanban etc.), mas
// grava `delegatedById` além de `responsibleId` — é esse campo extra que diferencia
// uma tarefa delegada de uma tarefa comum que alguém cria pra si mesmo, e que faz
// o alerta "TAREFA_DELEGADA" aparecer só para quem recebeu (ver lib/alerts.ts).
//
// Cada pessoa selecionada recebe sua PRÓPRIA tarefa (uma linha independente na tabela Task),
// em vez de uma única tarefa compartilhada por várias pessoas — de propósito: Task.responsibleId
// é uma FK única (mesmo padrão em Case/Attendance/Assessoria), e TaskScore, o balanceamento de
// carga do Workflows (lib/actions/workflows.ts) e a marcação de "vista" de uma delegação
// (delegationAcknowledgedAt) já assumem um responsável por tarefa — duplicar a tarefa por pessoa
// evita reescrever essas três coisas para uma relação N:N, e cada destinatário efetivamente
// precisa realizar a mesma ação, então faz sentido cada um ter seu próprio card e sua própria
// pontuação, independente dos outros.
export async function delegateTask(data: {
  responsibleIds: string[];
  type: string;
  title: string;
  dueDate: string;
  dueTime?: string;
  priority: string;
  description?: string;
  meetingType?: string;
  location?: string;
  meetingUrl?: string;
  strategy?: string;
  caseId?: string;
  attendanceId?: string;
  // Preenchido quando a delegação nasce do botão "Delegar" de uma publicação
  // (components/PublicationRow.tsx) — linka a Task criada à publicação de origem e marca essa
  // pessoa como responsável pela triagem dela, no lugar do antigo select "Sem responsável"
  // (que só trocava o campo silenciosamente, sem gerar tarefa nem avisar ninguém). Publication
  // só tem um assignedToId (FK única), então com múltiplos destinatários o primeiro selecionado
  // é quem fica marcado como responsável pela triagem da publicação em si.
  publicationId?: string;
}): Promise<{ error?: string; taskIds?: string[] }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Usuário não autenticado." };
  const responsibleIds = [...new Set(data.responsibleIds)];
  if (responsibleIds.length === 0) return { error: "Selecione ao menos um membro da equipe que vai receber a delegação." };
  for (const responsibleId of responsibleIds) {
    if (!(await isUserInOffice(responsibleId, viewer.officeId))) return { error: "Responsável não encontrado." };
  }
  if (data.caseId && !(await isCaseInOffice(data.caseId, viewer.officeId))) return { error: "Processo não encontrado." };
  if (data.attendanceId && !(await isAttendanceInOffice(data.attendanceId, viewer.officeId))) return { error: "Atendimento não encontrado." };

  // SEGURANÇA (achado V7, auditoria de 05/09/2026): reivindica a publicação ANTES de criar
  // qualquer Task — compare-and-swap (assignedToId: null na condição), não um updateMany
  // incondicional depois. Sem isso, duas delegações quase simultâneas para a mesma publicação
  // (ex.: "Distribuir pendentes" em lote cruzando com alguém clicando "Delegar" nela) liam
  // assignedToId ainda null nas duas, e cada uma criava sua própria Task — duas pessoas com
  // compromisso ativo para a mesma publicação, e só a última escrita de assignedToId "vencia"
  // silenciosamente. Fazer a reivindicação primeiro, e só criar a(s) Task(s) se ela realmente
  // aconteceu, evita a Task órfã que sobraria se o check viesse depois da criação.
  if (data.publicationId) {
    const { count } = await prisma.publication.updateMany({
      where: { id: data.publicationId, officeId: viewer.officeId, assignedToId: null },
      data: { assignedToId: responsibleIds[0] },
    });
    if (count === 0) {
      return { error: "Esta publicação já foi atribuída a outra pessoa." };
    }
  }

  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } });

  const typePoints = await prisma.taskTypePoints.findUnique({ where: { officeId_type: { officeId: viewer.officeId, type: data.type } } });
  const points = typePoints?.points ?? 10;

  const dueDate = new Date(data.dueDate);

  const taskIds: string[] = [];
  for (const responsibleId of responsibleIds) {
    const task = await prisma.task.create({
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
        responsibleId,
        delegatedById: viewer.id,
        columnId: firstColumn?.id || null,
        description: data.description ? sanitizeRichTextHtml(data.description) : null,
        meetingType: data.meetingType || null,
        location: data.location || null,
        meetingUrl: sanitizeExternalUrl(data.meetingUrl),
        strategy: data.strategy || null,
        points,
        officeId: viewer.officeId,
      },
    });
    taskIds.push(task.id);

    // Corte do outbox (documento 06): o push em tempo real que existia aqui foi removido — a
    // fila nova cobre o mesmo caso por padrão (DEFAULT_PER_EVENT.TAREFA_DELEGADA =
    // PUSH/NA_HORA, ver lib/comunicadosEventos.ts), sem duplicar quem já recebia instantâneo.
    enqueueNotification({
      userId: responsibleId,
      officeId: viewer.officeId,
      event: "TAREFA_DELEGADA",
      title: "Nova tarefa delegada",
      body: `${viewer.name} delegou: ${data.title}`,
      url: "/m/agenda",
      vars: { responsavel: viewer.name, teor: data.title },
      dedupeKey: `TAREFA_DELEGADA:${task.id}:${responsibleId}`,
    });
  }

  if (data.publicationId) {
    // assignedToId já foi gravado pela reivindicação (compare-and-swap) lá em cima — aqui só
    // resolve o grupo, já com a publicação atribuída de fato.
    // Compromisso criado (prazo, audiência ou tarefa delegada) = alguém ASSUMIU. A partir daqui a
    // publicação sai da fila do escritório inteiro, não só de quem clicou — ver
    // lib/publicationResolution.ts para a regra e para o motivo de ela valer só neste caminho
    // (marcar como lida continua sendo pessoal, porque significa "não é comigo").
    await resolvePublicationGroupForOffice(data.publicationId, viewer.officeId);
    revalidatePath("/publicacoes");
    revalidatePath("/m/publicacoes");
    revalidatePath("/m");
  }

  revalidatePath("/agenda");
  revalidatePath("/m/agenda");
  revalidatePath("/kanban");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath("/produtividade");

  return { taskIds };
}

// Marca a delegação como vista: chamado quando o destinatário abre o card da tarefa
// a partir do alerta na Central de Alertas — some do alerta sem afetar o compromisso.
export async function acknowledgeDelegation(taskId: string): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await prisma.task.updateMany({ where: { id: taskId, officeId: viewer.officeId }, data: { delegationAcknowledgedAt: new Date() } });
  revalidatePath("/alertas");
  revalidatePath("/painel");
  // AlertRow (onde este acknowledge é disparado) também é renderizado no app, que tem rotas
  // espelhadas próprias — sem revalidar elas o alerta continua na Central de Alertas e no badge
  // do PWA até um reload duro (achado A22 da revisão gauntlet).
  revalidatePath("/m/alertas");
  revalidatePath("/m");
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
  strategy: string | null;
  responsibleId: string | null;
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
  case: { id: string; title: string; processNumber: string | null } | null;
  comments: { id: string; content: string; createdAt: string; authorName: string }[];
};

// Usado pelo card de compromisso (aberto a partir de um alerta, da lista de prazos atrasados do
// painel, do Kanban ou da aba Atividades do processo): traz a tarefa completa + a conversa em
// comentários (mesma funcionalidade de Comment/CommentBox já usada na aba Comentários do
// processo, só que ligada à tarefa via taskId em vez de caseId) + a lista de responsáveis
// possíveis, já serializada (sem Date) para poder ser chamado direto de um client component.
export async function getTaskDetail(id: string): Promise<{ task: TaskDetail | null; users: { id: string; name: string }[] }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { task: null, users: [] };
  const [task, users] = await Promise.all([
    prisma.task.findFirst({
      where: { id, officeId: viewer.officeId },
      include: {
        case: { select: { id: true, title: true, processNumber: true } },
        completedBy: { select: { id: true, name: true } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
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
      strategy: task.strategy,
      responsibleId: task.responsibleId,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      completedBy: task.completedBy,
      case: task.case,
      comments: task.comments.map((cm) => ({
        id: cm.id,
        content: cm.content,
        createdAt: cm.createdAt.toISOString(),
        authorName: cm.author.name,
      })),
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
  if (responsibleId && !(await isUserInOffice(responsibleId, viewer.officeId))) return;
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
  strategy?: string;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  const existing = await prisma.task.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!existing) return;
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, viewer.officeId))) return;
  const dueDate = new Date(data.dueDate);
  await prisma.task.update({
    where: { id },
    data: {
      title: data.title,
      type: data.type,
      dueDate,
      dueTime: data.dueTime || null,
      // Campo derivado persistido — sem recalcular aqui, reagendar uma tarefa delegada deixava o
      // aviso de prazo de segurança preso na data antiga (ver computeSafetyDueDate acima).
      safetyDueDate: computeSafetyDueDate(dueDate),
      priority: data.priority,
      responsibleId: data.responsibleId || null,
      description: data.description ? sanitizeRichTextHtml(data.description) : null,
      meetingType: data.meetingType || null,
      location: data.location || null,
      meetingUrl: sanitizeExternalUrl(data.meetingUrl),
      strategy: data.strategy || null,
    },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/alertas");
}

export async function addComment(data: { content: string; taskId?: string; caseId?: string; licitacaoId?: string }) {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  // O autor é sempre o usuário da sessão — nunca um authorId vindo do cliente, que poderia
  // ser forjado para atribuir o comentário (e a menção correspondente) a outra pessoa.
  if (data.taskId && !(await isTaskInOffice(data.taskId, viewer.officeId))) return;
  if (data.caseId && !(await isCaseInOffice(data.caseId, viewer.officeId))) return;
  if (data.licitacaoId && !(await isLicitacaoInOffice(data.licitacaoId, viewer.officeId))) return;
  // Comentário de tarefa (card estilo Trello, ver TaskDetailModal) não vem com caseId do
  // chamador — busca o processo da própria tarefa pra também revalidar a aba Atividades dele
  // (contador de comentários) e pro link de notificação apontar pro processo certo.
  const taskCaseId = data.taskId
    ? (await prisma.task.findUnique({ where: { id: data.taskId }, select: { caseId: true } }))?.caseId ?? null
    : null;
  // Licitação não tem rota própria (vive em /assessoria/{id}?tab=licitacoes) — revalidar exige
  // achar a Assessoria dona primeiro, mesmo padrão de lib/actions/attachments.ts.
  const licitacaoAssessoriaId = data.licitacaoId
    ? (await prisma.licitacao.findUnique({ where: { id: data.licitacaoId }, select: { assessoriaId: true } }))?.assessoriaId ?? null
    : null;
  const mentionNames = Array.from(data.content.matchAll(/@(\p{Lu}\p{L}*(?:[ \t]+\p{Lu}\p{L}*)*)/gu)).map((m) => m[1].trim());
  const comment = await prisma.comment.create({
    data: {
      content: data.content,
      authorId: viewer.id,
      taskId: data.taskId || null,
      caseId: data.caseId || null,
      licitacaoId: data.licitacaoId || null,
      officeId: viewer.officeId,
    },
    include: { author: true },
  });

  if (mentionNames.length > 0) {
    const users = await prisma.user.findMany({ where: { officeId: viewer.officeId } });
    for (const name of mentionNames) {
      const user = users.find((u) => name.toLowerCase().includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(name.toLowerCase()));
      if (user && user.id !== viewer.id) {
        await prisma.mention.create({ data: { commentId: comment.id, userId: user.id, officeId: viewer.officeId } });
        const effectiveCaseId = data.caseId || taskCaseId;
        const url = effectiveCaseId ? `/m/processos/${effectiveCaseId}` : "/m";
        await sendPushIfEnabled(user.id, viewer.officeId, "mencao", {
          title: "Você foi mencionado",
          body: `${comment.author.name}: ${data.content.slice(0, 120)}`,
          url,
        }).catch(() => {});
      }
    }
  }

  if (data.taskId) revalidatePath(`/kanban`);
  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  if (taskCaseId) revalidatePath(`/processos/${taskCaseId}`);
  if (licitacaoAssessoriaId) revalidatePath(`/assessoria/${licitacaoAssessoriaId}`);
  revalidatePath("/alertas");
}
