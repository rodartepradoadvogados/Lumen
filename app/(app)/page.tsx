import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAlerts } from "@/lib/alerts";
import {
  Card,
  CardHeader,
  StatCard,
  Badge,
  EmptyState,
  formatCurrency,
  formatDate,
  taskTypeLabels,
  taskTypeColors,
} from "@/components/ui";
import { Wallet, TrendingDown, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 7);

  const [
    payablesPending,
    receivablesPending,
    activeCases,
    upcomingTasks,
    overdueTasksCount,
    alerts,
    recentComments,
  ] = await Promise.all([
    prisma.payable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] } } }),
    prisma.receivable.findMany({ where: { status: { in: ["PENDENTE", "ATRASADO"] } } }),
    prisma.case.count({ where: { status: "ATIVO" } }),
    prisma.task.findMany({
      where: { dueDate: { gte: now, lte: soon }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.task.count({ where: { dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } } }),
    getAlerts(),
    prisma.comment.findMany({
      include: { author: true, case: true, task: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const totalPayable = payablesPending.reduce((s, p) => s + p.amount, 0);
  const totalReceivable = receivablesPending.reduce((s, r) => s + r.amount, 0);
  const saldoProjetado = totalReceivable - totalPayable;

  const byArea = await prisma.case.groupBy({
    by: ["area"],
    where: { status: "ATIVO" },
    _count: { _all: true },
  });
  const totalCasesByArea = byArea.reduce((s, a) => s + a._count._all, 0) || 1;

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-navy-900">Painel</h1>
        <p className="text-sm text-navy-800/55 mt-1 capitalize">
          {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="A Receber (pendente)" value={formatCurrency(totalReceivable)} tone="green" icon={<TrendingUp size={18} />} hint={`${receivablesPending.length} contas em aberto`} />
        <StatCard label="A Pagar (pendente)" value={formatCurrency(totalPayable)} tone="red" icon={<TrendingDown size={18} />} hint={`${payablesPending.length} contas em aberto`} />
        <StatCard label="Saldo Projetado" value={formatCurrency(saldoProjetado)} tone={saldoProjetado >= 0 ? "gold" : "red"} icon={<Wallet size={18} />} />
        <StatCard label="Prazos Atrasados" value={String(overdueTasksCount)} tone="red" icon={<AlertTriangle size={18} />} hint={`${activeCases} processos ativos`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Próximos 7 dias"
            subtitle="Tarefas, eventos, audiências e prazos"
            action={
              <Link href="/agenda" className="text-xs font-semibold text-gold-700 hover:text-gold-800 flex items-center gap-1">
                Ver agenda <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="divide-y divide-navy-800/5">
            {upcomingTasks.length === 0 && <EmptyState title="Nada agendado para os próximos dias" />}
            {upcomingTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-cream-50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                    <p className="text-sm font-medium text-navy-900 truncate">{t.title}</p>
                  </div>
                  {t.case && <p className="text-xs text-navy-800/45 mt-0.5 truncate">{t.case.title}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs font-semibold text-navy-800">{formatDate(t.dueDate)}</p>
                  {t.dueTime && <p className="text-[11px] text-navy-800/45">{t.dueTime}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Central de Alertas"
            action={
              <Link href="/alertas" className="text-xs font-semibold text-gold-700 hover:text-gold-800 flex items-center gap-1">
                Ver tudo <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="divide-y divide-navy-800/5 max-h-[420px] overflow-y-auto scrollbar-thin">
            {alerts.length === 0 && <EmptyState title="Sem alertas" />}
            {alerts.slice(0, 8).map((a) => (
              <Link key={a.id} href={a.href} className="block px-5 py-3 hover:bg-cream-50 transition-colors">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                      a.severity === "alta" ? "bg-red-500" : a.severity === "media" ? "bg-gold-500" : "bg-slate-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{a.title}</p>
                    {a.subtitle && <p className="text-xs text-navy-800/45 truncate">{a.subtitle}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader title="Atividade Recente" subtitle="Comentários em processos e tarefas" />
          <div className="divide-y divide-navy-800/5">
            {recentComments.length === 0 && <EmptyState title="Nenhum comentário ainda" />}
            {recentComments.map((c) => (
              <div key={c.id} className="px-5 py-3">
                <p className="text-sm text-navy-900">
                  <span className="font-semibold">{c.author.name}</span> comentou{" "}
                  {c.case && <span className="text-navy-800/60">em {c.case.title}</span>}
                  {c.task && <span className="text-navy-800/60">na tarefa &quot;{c.task.title}&quot;</span>}
                </p>
                <p className="text-xs text-navy-800/50 mt-1 line-clamp-2">{c.content}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Resumo de Processos por Área" />
          <div className="p-5 space-y-3">
            {byArea.length === 0 && <EmptyState title="Nenhum processo ativo" />}
            {byArea.map((a) => (
              <div key={a.area ?? "outros"}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-navy-800">{a.area ?? "Não classificado"}</span>
                  <span className="font-semibold text-navy-900">{a._count._all}</span>
                </div>
                <div className="h-2 rounded-full bg-cream-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-navy-800 to-gold-600"
                    style={{ width: `${(a._count._all / totalCasesByArea) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
