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
    | "TAREFA_DELEGADA";
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
};

export type TodayItem = {
  id: string;
  kind: "TAREFA" | "EVENTO" | "AUDIENCIA" | "PERICIA" | "PRAZO" | "CONTA_PAGAR" | "CONTA_RECEBER";
  title: string;
  subtitle?: string;
  time?: string | null;
  href: string;
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

// Prazos vencidos, contas a pagar/receber vencidas, parcelas sem vencimento e menções —
// ficam visíveis até serem tratados (diferente de publicações, que somem da própria aba ao serem lidas).
// `viewerId`: quando informado, também busca tarefas delegadas para esse usuário ainda não
// vistas (delegationAcknowledgedAt null) — alerta pessoal, visível só pra quem recebeu.
export async function getAlerts(includeFinance: boolean = true, viewerId?: string): Promise<AlertItem[]> {
  const now = new Date();

  const [
    overdueTasks,
    overduePayables,
    overdueReceivables,
    unreadMentions,
    undatedPayables,
    undatedReceivables,
    overdueFollowups,
    delegatedTasks,
  ] = await Promise.all([
      prisma.task.findMany({
        where: { dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        include: { case: true },
        orderBy: { dueDate: "asc" },
      }),
      includeFinance
        ? prisma.payable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } })
        : Promise.resolve([]),
      prisma.mention.findMany({ where: { read: false }, include: { comment: { include: { author: true, case: true, task: true } } } }),
      includeFinance
        ? prisma.payable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true } })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true } })
        : Promise.resolve([]),
      prisma.attendance.findMany({
        where: { nextContactAt: { lt: now }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" } },
        orderBy: { nextContactAt: "asc" },
      }),
      viewerId
        ? prisma.task.findMany({
            where: { responsibleId: viewerId, delegatedById: { not: null }, delegationAcknowledgedAt: null },
            include: { case: true, delegatedBy: true },
            orderBy: { createdAt: "desc" },
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
    });
  }
  for (const p of overduePayables) {
    alerts.push({
      id: `payable-${p.id}`,
      kind: "CONTA_PAGAR_VENCIDA",
      title: p.description,
      subtitle: `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      date: p.dueDate,
      href: `/financeiro/contas-a-pagar`,
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
      href: `/financeiro/contas-a-receber`,
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
      href: `/financeiro/contas-a-pagar`,
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
      href: `/financeiro/contas-a-receber`,
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

// Tudo que vence HOJE: tarefas/eventos/audiências/perícias/prazos + contas a pagar/receber — reforço do dia.
export async function getTodayItems(includeFinance: boolean = true): Promise<TodayItem[]> {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(now);

  const [tasksToday, payablesToday, receivablesToday] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { gte: start, lte: end }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
      include: { case: true },
      orderBy: { dueTime: "asc" },
    }),
    includeFinance
      ? prisma.payable.findMany({ where: { dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false } })
      : Promise.resolve([]),
    includeFinance
      ? prisma.receivable.findMany({ where: { dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: false } })
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
    });
  }
  for (const p of payablesToday) {
    items.push({
      id: `payable-today-${p.id}`,
      kind: "CONTA_PAGAR",
      title: p.description,
      subtitle: `R$ ${p.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      href: "/financeiro/contas-a-pagar",
    });
  }
  for (const r of receivablesToday) {
    items.push({
      id: `receivable-today-${r.id}`,
      kind: "CONTA_RECEBER",
      title: r.description,
      subtitle: `R$ ${r.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      href: "/financeiro/contas-a-receber",
    });
  }

  return items;
}
