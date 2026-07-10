import { prisma } from "@/lib/prisma";

export type AlertItem = {
  id: string;
  kind: "PRAZO_VENCIDO" | "CONTA_PAGAR_VENCIDA" | "CONTA_RECEBER_VENCIDA" | "MENCAO" | "PARCELA_SEM_VENCIMENTO";
  title: string;
  subtitle?: string;
  date: Date;
  href: string;
  severity: "alta" | "media" | "baixa";
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
export async function getAlerts(includeFinance: boolean = true): Promise<AlertItem[]> {
  const now = new Date();

  const [overdueTasks, overduePayables, overdueReceivables, unreadMentions, undatedPayables, undatedReceivables] =
    await Promise.all([
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
    });
  }
  for (const m of unreadMentions) {
    alerts.push({
      id: `mention-${m.id}`,
      kind: "MENCAO",
      title: `${m.comment.author.name} mencionou você`,
      subtitle: m.comment.content.slice(0, 60),
      date: m.createdAt,
      href: m.comment.caseId ? `/processos/${m.comment.caseId}` : "/kanban",
      severity: "baixa",
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
