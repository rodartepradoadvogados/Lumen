import { prisma } from "@/lib/prisma";

export type AlertItem = {
  id: string;
  kind:
    | "PRAZO_VENCIDO"
    | "CONTA_PAGAR_VENCIDA"
    | "CONTA_RECEBER_VENCIDA"
    | "MENCAO"
    | "PARCELA_SEM_VENCIMENTO"
    | "FOLLOWUP_ATRASADO"
    | "TAREFA_DELEGADA"
    | "DRIVE_INCONSISTENCIA";
  title: string;
  subtitle?: string;
  date: Date;
  href: string;
  severity: "alta" | "media" | "baixa";
  // Entidade real por trás do alerta — usada para rotear o clique (abrir o card de baixa,
  // o card do compromisso, ou navegar direto), já que `kind` mistura pagar/receber em PARCELA_SEM_VENCIMENTO.
  entityKind?: "PAYABLE" | "RECEIVABLE" | "TASK" | "COMMENT" | "ATTENDANCE";
  entityId?: string;
  amount?: number;
  // Número do processo do Case vinculado (quando o alerta vem de uma tarefa presa a um
  // processo) — exibido como chip copiável na Central de Alertas.
  processNumber?: string;
  // Urgência por data (compromissos/atividades/audiências/prazos/perícias/tarefas delegadas/
  // pendências distribuídas apenas — contas e menções não usam isso): "atrasado" pinta o card
  // de bordô, "hoje" de ouro, ambos com transparência; sem data especial (vincendo) não muda.
  dueStatus?: "atrasado" | "hoje";
};

export type TodayItem = {
  id: string;
  kind: "TAREFA" | "EVENTO" | "AUDIENCIA" | "PERICIA" | "PRAZO" | "CONTA_PAGAR" | "CONTA_RECEBER";
  title: string;
  subtitle?: string;
  time?: string | null;
  href: string;
  dueStatus?: "atrasado" | "hoje";
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// "atrasado" (antes de hoje) pinta bordô, "hoje" pinta ouro, qualquer outra data (vincendo,
// futuro) não muda nada — ver AlertItem.dueStatus/TodayItem.dueStatus.
function computeDueStatus(dueDate: Date, now: Date): "atrasado" | "hoje" | undefined {
  if (dueDate < startOfDay(now)) return "atrasado";
  if (dueDate <= endOfDay(now)) return "hoje";
  return undefined;
}

// Prazos vencidos, contas a pagar/receber vencidas, parcelas sem vencimento e menções —
// ficam visíveis até serem tratados (diferente de publicações, que somem da própria aba ao serem lidas).
// `viewerId`: quando informado, também busca tarefas delegadas para esse usuário ainda não
// vistas (delegationAcknowledgedAt null) — alerta pessoal, visível só pra quem recebeu.
// `includeDriveSync`: segue o MESMO padrão de includeFinance, mas gated por isAdmin (não por
// financeAccess) — inconsistência de estrutura no Drive é assunto de sócio/administrador, ver
// lib/driveSync.ts. Default false para não vazar pra quem chama getAlerts sem saber que este
// gate existe (ex: lib/email.ts, que filtra por kind e nunca precisaria disso mesmo assim).
export async function getAlerts(
  officeId: string,
  includeFinance: boolean = true,
  viewerId?: string,
  includeDriveSync: boolean = false
): Promise<AlertItem[]> {
  const now = new Date();

  // MENCAO/FOLLOWUP_ATRASADO/PARCELA_SEM_VENCIMENTO/DRIVE_INCONSISTENCIA não têm nenhuma ação
  // de resolver — dispensados via botão "Lido" (dismissAlert em lib/actions/alerts.ts),
  // por usuário. Buscado antes do Promise.all abaixo pra poder excluir cada tipo já na query.
  const dismissedByKind = new Map<string, Set<string>>();
  if (viewerId) {
    const dismissals = await prisma.alertDismissal.findMany({ where: { userId: viewerId }, select: { kind: true, entityId: true } });
    for (const d of dismissals) {
      if (!dismissedByKind.has(d.kind)) dismissedByKind.set(d.kind, new Set());
      dismissedByKind.get(d.kind)!.add(d.entityId);
    }
  }
  const dismissedFollowupIds = Array.from(dismissedByKind.get("FOLLOWUP_ATRASADO") ?? []);
  const dismissedParcelaIds = Array.from(dismissedByKind.get("PARCELA_SEM_VENCIMENTO") ?? []);
  const dismissedDriveIds = Array.from(dismissedByKind.get("DRIVE_INCONSISTENCIA") ?? []);

  const [
    overdueTasks,
    overduePayables,
    overdueReceivables,
    unreadMentions,
    undatedPayables,
    undatedReceivables,
    overdueFollowups,
    delegatedTasks,
    driveSyncIssues,
  ] = await Promise.all([
      prisma.task.findMany({
        where: { officeId, dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        include: { case: true },
        orderBy: { dueDate: "asc" },
      }),
      includeFinance
        ? prisma.payable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
        : Promise.resolve([]),
      viewerId
        ? prisma.mention.findMany({
            where: { officeId, userId: viewerId, read: false, ...(dismissedByKind.has("MENCAO") ? { commentId: { notIn: Array.from(dismissedByKind.get("MENCAO")!) } } : {}) },
            include: { comment: { include: { author: true, case: true, task: true } } },
          })
        : Promise.resolve([]),
      includeFinance
        ? prisma.payable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
        : Promise.resolve([]),
      prisma.attendance.findMany({
        where: { officeId, nextContactAt: { lt: now }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" }, id: { notIn: dismissedFollowupIds } },
        orderBy: { nextContactAt: "asc" },
      }),
      viewerId
        ? prisma.task.findMany({
            where: { officeId, responsibleId: viewerId, delegatedById: { not: null }, delegationAcknowledgedAt: null },
            include: { case: true, delegatedBy: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      includeDriveSync
        ? prisma.driveSyncIssue.findMany({
            where: { officeId, resolvedAt: null, id: { notIn: dismissedDriveIds } },
            include: { case: { select: { id: true, processNumber: true } }, attendance: { select: { id: true } } },
            orderBy: { detectedAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

  const alerts: AlertItem[] = [];

  for (const t of overdueTasks) {
    alerts.push({
      id: `task-overdue-${t.id}`,
      kind: "PRAZO_VENCIDO",
      title: t.title,
      subtitle: t.case?.title,
      date: t.dueDate,
      href: `/agenda`,
      severity: "alta",
      entityKind: "TASK",
      entityId: t.id,
      processNumber: t.case?.processNumber ?? undefined,
      dueStatus: "atrasado",
    });
  }
  for (const p of overduePayables) {
    alerts.push({
      id: `payable-${p.id}`,
      kind: "CONTA_PAGAR_VENCIDA",
      title: p.description,
      subtitle: `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      date: p.dueDate,
      href: `/financeiro/despesas`,
      severity: "alta",
      entityKind: "PAYABLE",
      entityId: p.id,
      amount: p.amount,
    });
  }
  for (const r of overdueReceivables) {
    alerts.push({
      id: `receivable-${r.id}`,
      kind: "CONTA_RECEBER_VENCIDA",
      title: r.description,
      subtitle: `R$ ${r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      date: r.dueDate,
      href: `/financeiro/receitas`,
      severity: "media",
      entityKind: "RECEIVABLE",
      entityId: r.id,
      amount: r.amount,
    });
  }
  for (const p of undatedPayables) {
    alerts.push({
      id: `payable-undated-${p.id}`,
      kind: "PARCELA_SEM_VENCIMENTO",
      title: `Definir vencimento: ${p.description}`,
      subtitle: `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · revisar todo início de mês`,
      date: p.dueDate,
      href: `/financeiro/despesas`,
      severity: "baixa",
      entityKind: "PAYABLE",
      entityId: p.id,
      amount: p.amount,
    });
  }
  for (const r of undatedReceivables) {
    alerts.push({
      id: `receivable-undated-${r.id}`,
      kind: "PARCELA_SEM_VENCIMENTO",
      title: `Definir vencimento: ${r.description}`,
      subtitle: `R$ ${r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · revisar todo início de mês`,
      date: r.dueDate,
      href: `/financeiro/receitas`,
      severity: "baixa",
      entityKind: "RECEIVABLE",
      entityId: r.id,
      amount: r.amount,
    });
  }
  for (const f of overdueFollowups) {
    if (!f.nextContactAt) continue;
    alerts.push({
      id: `followup-${f.id}`,
      kind: "FOLLOWUP_ATRASADO",
      title: `Follow-up atrasado: ${f.clientName}`,
      subtitle: f.subject,
      date: f.nextContactAt,
      href: `/atendimento/${f.id}`,
      severity: "media",
      entityKind: "ATTENDANCE",
      entityId: f.id,
    });
  }
  for (const t of delegatedTasks) {
    alerts.push({
      id: `task-delegated-${t.id}`,
      kind: "TAREFA_DELEGADA",
      title: `${t.delegatedBy?.name} atribuiu: ${t.title}`,
      subtitle: t.case?.title,
      date: t.createdAt,
      href: `/agenda`,
      severity: "media",
      entityKind: "TASK",
      entityId: t.id,
      processNumber: t.case?.processNumber ?? undefined,
      dueStatus: computeDueStatus(t.dueDate, now),
    });
  }
  for (const issue of driveSyncIssues) {
    alerts.push({
      id: `drive-sync-${issue.id}`,
      kind: "DRIVE_INCONSISTENCIA",
      title: issue.description,
      subtitle: issue.suggestedFix,
      date: issue.detectedAt,
      href: issue.case ? `/processos/${issue.case.id}` : issue.attendance ? `/atendimento/${issue.attendance.id}` : "/alertas",
      severity: "alta",
      processNumber: issue.case?.processNumber ?? undefined,
      entityId: issue.id,
    });
  }
  for (const m of unreadMentions) {
    alerts.push({
      id: `mention-${m.id}`,
      kind: "MENCAO",
      title: `${m.comment.author.name} mencionou você`,
      subtitle: m.comment.content.slice(0, 60),
      date: m.createdAt,
      href: m.comment.caseId ? `/processos/${m.comment.caseId}?tab=comentarios` : "/kanban",
      severity: "baixa",
      entityKind: "COMMENT",
      entityId: m.comment.id,
    });
  }

  return alerts.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Mesmo conjunto de critérios de getAlerts() acima, mas só CONTANDO (sem os includes de
// case/comment/author, que ela busca pra exibir na Central de Alertas) — usado onde só o
// número importa (badge do ícone do PWA, badge do item "Alertas" no menu), pra não pagar o
// custo dos joins/conteúdo completo só pra chegar num inteiro.
export async function getAlertsCount(
  officeId: string,
  includeFinance: boolean = true,
  viewerId?: string,
  includeDriveSync: boolean = false
): Promise<number> {
  const now = new Date();

  const dismissedByKind = new Map<string, Set<string>>();
  if (viewerId) {
    const dismissals = await prisma.alertDismissal.findMany({ where: { userId: viewerId }, select: { kind: true, entityId: true } });
    for (const d of dismissals) {
      if (!dismissedByKind.has(d.kind)) dismissedByKind.set(d.kind, new Set());
      dismissedByKind.get(d.kind)!.add(d.entityId);
    }
  }
  const dismissedFollowupIds = Array.from(dismissedByKind.get("FOLLOWUP_ATRASADO") ?? []);
  const dismissedParcelaIds = Array.from(dismissedByKind.get("PARCELA_SEM_VENCIMENTO") ?? []);
  const dismissedDriveIds = Array.from(dismissedByKind.get("DRIVE_INCONSISTENCIA") ?? []);

  const [
    overdueTasks,
    overduePayables,
    overdueReceivables,
    unreadMentions,
    undatedPayables,
    undatedReceivables,
    overdueFollowups,
    delegatedTasks,
    driveSyncIssues,
  ] = await Promise.all([
    prisma.task.count({
      where: { officeId, dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    }),
    includeFinance
      ? prisma.payable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.receivable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
      : Promise.resolve(0),
    viewerId
      ? prisma.mention.count({ where: { officeId, userId: viewerId, read: false, ...(dismissedByKind.has("MENCAO") ? { commentId: { notIn: Array.from(dismissedByKind.get("MENCAO")!) } } : {}) } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.payable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.receivable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
      : Promise.resolve(0),
    prisma.attendance.count({
      where: { officeId, nextContactAt: { lt: now }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" }, id: { notIn: dismissedFollowupIds } },
    }),
    viewerId
      ? prisma.task.count({ where: { officeId, responsibleId: viewerId, delegatedById: { not: null }, delegationAcknowledgedAt: null } })
      : Promise.resolve(0),
    includeDriveSync ? prisma.driveSyncIssue.count({ where: { officeId, resolvedAt: null, id: { notIn: dismissedDriveIds } } }) : Promise.resolve(0),
  ]);

  return (
    overdueTasks +
    overduePayables +
    overdueReceivables +
    unreadMentions +
    undatedPayables +
    undatedReceivables +
    overdueFollowups +
    delegatedTasks +
    driveSyncIssues
  );
}

// Tudo que vence HOJE: tarefas/eventos/audiências/perícias/prazos + contas a pagar/receber — reforço do dia.
export async function getTodayItems(officeId: string, includeFinance: boolean = true): Promise<TodayItem[]> {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(now);

  const [tasksToday, payablesToday, receivablesToday] = await Promise.all([
    prisma.task.findMany({
      where: { officeId, dueDate: { gte: start, lte: end }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
      include: { case: true },
      orderBy: { dueTime: "asc" },
    }),
    includeFinance
      ? prisma.payable.findMany({ where: { officeId, dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false } })
      : Promise.resolve([]),
    includeFinance
      ? prisma.receivable.findMany({ where: { officeId, dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false } })
      : Promise.resolve([]),
  ]);

  const items: TodayItem[] = [];

  for (const t of tasksToday) {
    items.push({
      id: `task-today-${t.id}`,
      kind: (["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"].includes(t.type) ? t.type : "TAREFA") as TodayItem["kind"],
      title: t.title,
      subtitle: t.case?.title,
      time: t.dueTime,
      href: "/agenda",
      dueStatus: "hoje",
    });
  }
  for (const p of payablesToday) {
    items.push({
      id: `payable-today-${p.id}`,
      kind: "CONTA_PAGAR",
      title: p.description,
      subtitle: `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      href: "/financeiro/despesas",
    });
  }
  for (const r of receivablesToday) {
    items.push({
      id: `receivable-today-${r.id}`,
      kind: "CONTA_RECEBER",
      title: r.description,
      subtitle: `R$ ${r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      href: "/financeiro/receitas",
    });
  }

  return items;
}
