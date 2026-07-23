import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAlerts } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { hasBlogAccess } from "@/lib/officeModules";
import {
  Card,
  CardHeader,
  Badge,
  EmptyState,
  formatCurrency,
  formatDate,
  taskTypeLabels,
  taskTypeColors,
} from "@/components/ui";
import { TrendingDown, TrendingUp, AlertTriangle, ArrowRight, Newspaper, ExternalLink } from "lucide-react";
import NoticesPanel from "@/components/NoticesPanel";
import AlertRow from "@/components/AlertRow";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import PendingListModal from "@/components/PendingListModal";
import SettleButton from "@/components/SettleButton";
import OverdueTaskRow from "@/components/OverdueTaskRow";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 7);

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const [payablesPending, receivablesPending, activeCases, upcomingTasks, overdueTasksList, alerts, activeUsers] = await Promise.all([
    hasFinanceAccess
      ? prisma.payable.findMany({
          where: { status: { in: ["PENDENTE", "ATRASADO"] }, officeId: viewer.officeId },
          include: { case: true },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    hasFinanceAccess
      ? prisma.receivable.findMany({
          where: { status: { in: ["PENDENTE", "ATRASADO"] }, officeId: viewer.officeId },
          include: { case: true, client: true },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    prisma.case.count({ where: { status: "ATIVO", officeId: viewer.officeId } }),
    prisma.task.findMany({
      where: { dueDate: { gte: now, lte: soon }, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, officeId: viewer.officeId },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.task.findMany({
      where: { dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, officeId: viewer.officeId },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
    }),
    getAlerts(viewer.officeId, hasFinanceAccess, viewer.id),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const blogPendingCount = await prisma.blogPost.count({ where: { status: "AGUARDANDO_REVISAO", officeId: viewer.officeId } });
  const blogAccess = await hasBlogAccess(viewer.officeId);

  const notices = await prisma.notice.findMany({
    where: { officeId: viewer.officeId },
    include: { author: { select: { id: true, name: true, color: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 10,
  });
  const serializedNotices = notices.map((n) => ({
    id: n.id,
    content: n.content,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    author: { id: n.author.id, name: n.author.name, color: n.author.color },
  }));

  const totalPayable = payablesPending.reduce((s, p) => s + p.amount, 0);
  const totalReceivable = receivablesPending.reduce((s, r) => s + r.amount, 0);

  const byArea = await prisma.case.groupBy({
    by: ["area"],
    where: { status: "ATIVO", officeId: viewer.officeId },
    _count: { _all: true },
  });
  const totalCasesByArea = byArea.reduce((s, a) => s + a._count._all, 0) || 1;

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Painel</h1>
        <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1 capitalize">
          {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasFinanceAccess ? "lg:grid-cols-3" : "lg:grid-cols-1"} gap-4 mb-6`}>
        {hasFinanceAccess && (
          <>
            <PendingListModal
              label="A Receber (pendente)"
              value={formatCurrency(totalReceivable)}
              tone="green"
              icon={<TrendingUp size={18} />}
              hint={`${receivablesPending.length} contas em aberto`}
              title="Contas a Receber Pendentes"
            >
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {receivablesPending.length === 0 && <EmptyState title="Nenhuma conta pendente" />}
                {receivablesPending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{r.description}</p>
                      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                        {r.noDueDate ? "Sem vencimento" : `Vence em ${formatDate(r.dueDate)}`}
                      </p>
                      {r.case && (
                        <Link href={`/processos/${r.case.id}`} className="text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline">
                          {r.case.processNumber || r.case.title}
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(r.amount)}</span>
                      <SettleButton id={r.id} kind="receivable" amount={r.amount} status={r.status} />
                    </div>
                  </div>
                ))}
              </div>
            </PendingListModal>

            <PendingListModal
              label="A Pagar (pendente)"
              value={formatCurrency(totalPayable)}
              tone="red"
              icon={<TrendingDown size={18} />}
              hint={`${payablesPending.length} contas em aberto`}
              title="Contas a Pagar Pendentes"
            >
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {payablesPending.length === 0 && <EmptyState title="Nenhuma conta pendente" />}
                {payablesPending.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{p.description}</p>
                      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                        {p.noDueDate ? "Sem vencimento" : `Vence em ${formatDate(p.dueDate)}`}
                      </p>
                      {p.case && (
                        <Link href={`/processos/${p.case.id}`} className="text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline">
                          {p.case.processNumber || p.case.title}
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(p.amount)}</span>
                      <SettleButton id={p.id} kind="payable" amount={p.amount} status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            </PendingListModal>
          </>
        )}

        <PendingListModal
          label="Prazos Atrasados"
          value={String(overdueTasksList.length)}
          tone="red"
          icon={<AlertTriangle size={18} />}
          hint={`${activeCases} processos ativos`}
          title="Prazos Atrasados"
        >
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {overdueTasksList.length === 0 && <EmptyState title="Nenhum prazo atrasado" />}
            {overdueTasksList.map((t) => (
              <OverdueTaskRow
                key={t.id}
                task={{
                  id: t.id,
                  title: t.title,
                  type: t.type,
                  dueDate: t.dueDate.toISOString(),
                  responsibleName: t.responsible?.name,
                  caseId: t.case?.id,
                  caseLabel: t.case ? t.case.processNumber || t.case.title : null,
                }}
              />
            ))}
          </div>
        </PendingListModal>
      </div>

      {/* Bloco de destaque do Juris Blog: propositalmente diferente dos StatCards acima
          (fundo em gradiente navy->bordô, ícone em moldura dourada) para chamar atenção
          para o blog público do escritório sem se misturar com os cards de KPI. */}
      <div className="mb-6 relative overflow-hidden rounded-xl border border-gold-500/30 bg-gradient-to-r from-navy-900 via-navy-800 to-bordo-700 shadow-card">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-5">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gold-500/15 border border-gold-400/40 flex items-center justify-center text-gold-400">
            <Newspaper size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-lg font-bold text-cream-50">Juris Blog</h2>
              {blogPendingCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-gold-500/20 text-gold-300 border border-gold-400/30">
                  {blogPendingCount} aguardando revisão
                </span>
              )}
            </div>
            <p className="text-sm text-cream-50/70 mt-0.5">Conteúdo jurídico atualizado, publicado pelo escritório para clientes e visitantes.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/blog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gold-500 hover:bg-gold-400 text-navy-950 rounded-lg px-3.5 py-2 transition-colors"
            >
              Ver blog <ExternalLink size={13} />
            </Link>
            {viewer?.isAdmin && blogAccess && (
              <Link
                href="/configuracoes?secao=blog&blogTab=revisao"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/15 text-cream-50 border border-white/15 rounded-lg px-3.5 py-2 transition-colors"
              >
                Fila de revisão <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Próximos 7 dias"
            subtitle="Tarefas, eventos, audiências e prazos"
            action={
              <Link href="/agenda" className="text-xs font-semibold text-gold-700 dark:text-gold-400 hover:text-gold-800 dark:hover:text-gold-300 flex items-center gap-1">
                Ver agenda <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {upcomingTasks.length === 0 && <EmptyState title="Nada agendado para os próximos dias" />}
            {upcomingTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{t.title}</p>
                  </div>
                  {t.case && <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5 truncate">{t.case.title}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50/80">{formatDate(t.dueDate)}</p>
                  {t.dueTime && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">{t.dueTime}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Central de Alertas"
            action={
              <Link href="/alertas" className="text-xs font-semibold text-gold-700 dark:text-gold-400 hover:text-gold-800 dark:hover:text-gold-300 flex items-center gap-1">
                Ver tudo <ArrowRight size={13} />
              </Link>
            }
          />
          <div className="divide-y divide-navy-800/5 dark:divide-white/10 max-h-[420px] overflow-y-auto scrollbar-thin">
            {alerts.length === 0 && <EmptyState title="Sem alertas" />}
            {alerts.slice(0, 8).map((a) => (
              <AlertRow key={a.id} alert={a} className="block w-full text-left px-5 py-3 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                      a.severity === "alta" ? "bg-bordo-500 dark:bg-bordo-400" : a.severity === "media" ? "bg-gold-500" : "bg-slate-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{a.title}</p>
                    {a.subtitle && <p className="text-xs text-navy-800/45 dark:text-cream-50/45 truncate">{a.subtitle}</p>}
                    {a.processNumber && <ProcessNumberChip processNumber={a.processNumber} />}
                  </div>
                </div>
              </AlertRow>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="flex flex-col">
          <CardHeader title="Recados do Escritório" subtitle="Mural de comunicação entre a equipe" />
          <NoticesPanel notices={serializedNotices} currentUserId={viewer?.id ?? null} isAdmin={Boolean(viewer?.isAdmin)} users={activeUsers} />
        </Card>

        <Card>
          <CardHeader title="Resumo de Processos por Área" />
          <div className="p-5 space-y-3">
            {byArea.length === 0 && <EmptyState title="Nenhum processo ativo" />}
            {byArea.map((a) => (
              <div key={a.area ?? "outros"}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-navy-800 dark:text-cream-50/80">{a.area ?? "Não classificado"}</span>
                  <span className="font-semibold text-navy-900 dark:text-cream-50">{a._count._all}</span>
                </div>
                <div className="h-2 rounded-full bg-cream-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-navy-800 to-gold-600 dark:from-gold-500 dark:to-bordo-500"
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
