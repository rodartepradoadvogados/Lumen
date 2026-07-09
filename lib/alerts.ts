import { prisma } from "@/lib/prisma";

export type AlertItem = {
  id: string;
  kind: "PRAZO_VENCIDO" | "PRAZO_PROXIMO" | "PUBLICACAO_NAO_LIDA" | "CONTA_PAGAR_VENCIDA" | "CONTA_RECEBER_VENCIDA" | "MENCAO" | "PARCELA_SEM_VENCIMENTO";
  title: string;
  subtitle?: string;
  date: Date;
  href: string;
  severity: "alta" | "media" | "baixa";
};

export async function getAlerts(): Promise<AlertItem[]> {
  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 3);

  const [overdueTasks, upcomingTasks, unreadPubs, overduePayables, overdueReceivables, unreadMentions, undatedPayables, undatedReceivables] =
    await Promise.all([
      prisma.task.findMany({
        where: { dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        include: { case: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.task.findMany({
        where: { dueDate: { gte: now, lte: soon }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        include: { case: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.publication.findMany({ where: { read: false }, include: { case: true }, orderBy: { publishedAt: "desc" } }),
      prisma.payable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } }),
      prisma.receivable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { lt: now }, noDueDate: false } }),
      prisma.mention.findMany({ where: { read: false }, include: { comment: { include: { author: true, case: true, task: true } } } }),
      prisma.payable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true } }),
      prisma.receivable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true } }),
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
  for (const t of upcomingTasks) {
    alerts.push({
      id: `task-upcoming-${t.id}`,
      kind: "PRAZO_PROXIMO",
      title: t.title,
      subtitle: t.case?.title,
      date: t.dueDate,
      href: `/agenda`,
      severity: "media",
    });
  }
  for (const p of unreadPubs) {
    alerts.push({
      id: `pub-${p.id}`,
      kind: "PUBLICACAO_NAO_LIDA",
      title: `Publicação (${p.source})`,
      subtitle: p.case?.title ?? p.content.slice(0, 60),
      date: p.publishedAt,
      href: `/publicacoes`,
      severity: "media",
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
