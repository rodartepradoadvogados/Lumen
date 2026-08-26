import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { stageLabels } from "@/lib/funil";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";
import {
  Card,
  CardHeader,
  EmptyState,
  formatCurrency,
  formatDate,
  formatCalendarDate,
} from "@/components/ui";
import { ArrowRight, Clock, ArrowDown, ArrowUp, Filter } from "lucide-react";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import PendingListModal from "@/components/PendingListModal";
import SettleButton from "@/components/SettleButton";
import OverdueTaskRow from "@/components/OverdueTaskRow";
import DayQueueRow, { type DayQueueItem } from "@/components/DayQueueRow";
import GrainOverlay from "@/components/GrainOverlay";

export const dynamic = "force-dynamic";

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

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function DashboardPage() {
  const now = new Date();
  const soon = new Date();
  soon.setDate(now.getDate() + 7);
  const hoje = startOfDay(now);
  const fimHoje = endOfDay(now);
  const amanha = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const fimAmanha = endOfDay(amanha);

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const [
    payablesSoon,
    receivablesSoon,
    upcomingTasks,
    overdueTasksList,
    bankAccounts,
    unreadPublicationsRaw,
    blockedSet,
    funilHoje,
  ] = await Promise.all([
    hasFinanceAccess
      ? prisma.payable.findMany({
          where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false, dueDate: { lte: soon } },
          include: { case: true, payments: true },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    hasFinanceAccess
      ? prisma.receivable.findMany({
          where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false, dueDate: { lte: soon } },
          include: { case: true, payments: true },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),
    // Próximos 7 dias — take mais folgado que o widget antigo (era 8): a fila "O dia" reordena por
    // severidade, não por data pura, e precisa de material suficiente para os 6 primeiros lugares
    // não ficarem reféns de um corte cedo demais na query.
    prisma.task.findMany({
      where: { dueDate: { gte: now, lte: soon }, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, officeId: viewer.officeId },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: { dueDate: { lt: now }, status: { notIn: ["CONCLUIDO", "CANCELADO"] }, officeId: viewer.officeId },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
    }),
    hasFinanceAccess
      ? prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.publication.findMany({
      where: { officeId: viewer.officeId, reads: { none: { userId: viewer.id } } },
      select: {
        id: true,
        source: true,
        content: true,
        publishedAt: true,
        processNumberRaw: true,
        case: { select: { title: true, processNumber: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
    getBlockedProcessNumberSet(viewer.id),
    // FUNIL — {n} HOJE (documento 03): sem critério de "hoje" já definido em outra tela do produto
    // para o funil comercial — escolha própria, seguindo o mesmo vocabulário que a Central de
    // Alertas já usa para follow-up atrasado (lib/alerts.ts, FOLLOWUP_ATRASADO): próximo contato
    // agendado (nextContactAt) caindo hoje, em estágio ainda aberto.
    prisma.attendance.findMany({
      where: { officeId: viewer.officeId, nextContactAt: { gte: hoje, lte: fimHoje }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" } },
      select: { id: true, clientName: true, stage: true, nextContactAt: true },
      orderBy: { nextContactAt: "asc" },
      take: 6,
    }),
  ]);

  const totalReceivableSoon = receivablesSoon.reduce((s, r) => s + saldoEmAberto(r.amount, r.discount, r.surcharge, r.payments.reduce((a, x) => a + x.amount, 0)), 0);
  const totalPayableSoon = payablesSoon.reduce((s, p) => s + saldoEmAberto(p.amount, p.discount, p.surcharge, p.payments.reduce((a, x) => a + x.amount, 0)), 0);

  const myOverdueTasks = overdueTasksList.filter((t) => t.responsibleId === viewer.id);

  // "O dia": as mesmas queries de upcomingTasks/overdueTasksList, reordenadas por severidade em
  // vez de só dueDate asc (documento 03) — prazo vencido primeiro, depois outros tipos vencidos,
  // depois hoje (prazo → audiência → resto), depois amanhã, depois o resto da janela de 7 dias.
  function severityRank(task: { type: string; dueDate: Date }): number {
    const overdue = task.dueDate < hoje;
    const isToday = !overdue && task.dueDate >= hoje && task.dueDate <= fimHoje;
    const isTomorrow = !overdue && !isToday && task.dueDate >= amanha && task.dueDate <= fimAmanha;
    if (overdue) return task.type === "PRAZO" ? 0 : 1;
    if (isToday) return task.type === "PRAZO" ? 2 : task.type === "AUDIENCIA" ? 3 : 4;
    if (isTomorrow) return 5;
    return 6;
  }

  function timeLabel(task: { dueDate: Date; dueTime: string | null }): { label: string; urgent: boolean } {
    const overdue = task.dueDate < hoje;
    const isToday = !overdue && task.dueDate >= hoje && task.dueDate <= fimHoje;
    const isTomorrow = !overdue && !isToday && task.dueDate >= amanha && task.dueDate <= fimAmanha;
    if (overdue) return { label: `venceu em ${formatCalendarDate(task.dueDate)}`, urgent: true };
    if (isToday) return { label: task.dueTime ? `hoje ${task.dueTime}` : "hoje", urgent: true };
    if (isTomorrow) return { label: task.dueTime ? `amanhã ${task.dueTime}` : "amanhã", urgent: false };
    return { label: formatCalendarDate(task.dueDate), urgent: false };
  }

  const dayQueueSource = [...overdueTasksList, ...upcomingTasks];
  const dayQueueSorted = dayQueueSource
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b) || a.dueDate.getTime() - b.dueDate.getTime());

  const dayQueueItems: DayQueueItem[] = dayQueueSorted.map((t) => {
    const { label, urgent } = timeLabel(t);
    return {
      id: t.id,
      type: t.type,
      title: t.title,
      subtitle: t.case?.title ?? null,
      timeLabel: label,
      urgent,
      caseId: t.case?.id ?? null,
      caseLabel: t.case ? t.case.processNumber || t.case.title : null,
    };
  });

  const prazosCount = dayQueueSource.filter((t) => t.type === "PRAZO").length;
  const audienciasCount = dayQueueSource.filter((t) => t.type === "AUDIENCIA").length;
  const dayQueueVisible = dayQueueItems.slice(0, 6);
  const dayQueueRestCount = dayQueueItems.length - dayQueueVisible.length;

  // Publicações não lidas: mesmo agrupamento por processo+dia da tela de Publicações (uma
  // publicação repassada por mais de uma fonte no mesmo dia não deve virar duas prévias aqui) —
  // filtra as bloqueadas do viewer (mesmo critério da Sidebar/aba Publicações) e mostra as 3 mais
  // recentes.
  const unreadFiltered = unreadPublicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet));
  const unreadGroups = groupPublicationsByProcess(
    unreadFiltered.map((p) => ({ ...p, publishedAt: p.publishedAt.toISOString(), read: false }))
  );
  const unreadPreview = unreadGroups.slice(0, 3);

  return (
    <div className="relative">
      <GrainOverlay />
      <div className="relative z-10 p-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Halo sutil do bordô atrás da saudação — mesmo tratamento da Início mobile (gradiente de
          fundo, não sombra: DESIGN-SYSTEM.md §13). */}
      <div className="relative mb-6">
        <div
          className="absolute -top-8 -left-8 h-40 w-[340px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, var(--halo-marca), transparent 70%)" }}
        />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-[30px] font-extrabold text-tx leading-tight">
            {greeting(now.getHours())}, {viewer.name.split(" ")[0]}
          </h1>
          <p className="text-[15px] text-tx-2 capitalize mt-1">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Coluna larga */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title={`O dia — ${prazosCount} prazo${prazosCount === 1 ? "" : "s"}, ${audienciasCount} audiência${audienciasCount === 1 ? "" : "s"}`}
              action={
                <Link href="/agenda" className="text-xs font-semibold text-acao hover:text-acao-hover flex items-center gap-1">
                  Ver agenda <ArrowRight size={13} strokeWidth={1.5} />
                </Link>
              }
            />
            <div className="divide-y divide-regua">
              {dayQueueVisible.length === 0 && <EmptyState title="Nada vencido ou agendado para os próximos dias" />}
              {dayQueueVisible.map((item) => (
                <DayQueueRow key={item.id} item={item} />
              ))}
            </div>
            {dayQueueRestCount > 0 && (
              <Link href="/agenda" className="block text-center text-xs font-semibold text-acao hover:text-acao-hover px-5 py-3 border-t border-regua">
                Ver os outros {dayQueueRestCount}
              </Link>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Publicações não lidas — ${unreadGroups.length}`}
              action={
                <Link href="/publicacoes" className="text-xs font-semibold text-acao hover:text-acao-hover flex items-center gap-1">
                  Triar <ArrowRight size={13} strokeWidth={1.5} />
                </Link>
              }
            />
            <div className="divide-y divide-regua">
              {unreadPreview.length === 0 && <EmptyState title="Nenhuma publicação pendente de triagem" />}
              {unreadPreview.map((g) => (
                <div key={g.key} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-tx-2">{g.primary.source}</span>
                    {g.primary.processNumberRaw && <ProcessNumberChip processNumber={g.primary.processNumberRaw} />}
                  </div>
                  {g.primary.case?.title && <p className="text-xs text-tx-2 mt-0.5 truncate">{g.primary.case.title}</p>}
                  <p className="text-sm text-tx mt-0.5 line-clamp-1">{g.primary.content}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Coluna estreita */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <PendingListModal
            label="Minhas atrasadas"
            value={String(myOverdueTasks.length)}
            accentClassName="border-t-urgente"
            valueClassName="text-[34px] leading-none font-extrabold text-urgente"
            title="Minhas Atrasadas"
            icon={<Clock size={15} strokeWidth={1.5} />}
            iconClassName="bg-urgente-bg text-urgente"
          >
            <div className="divide-y divide-regua">
              {myOverdueTasks.length === 0 && <EmptyState title="Nenhum prazo atrasado" />}
              {myOverdueTasks.map((t) => (
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

          {hasFinanceAccess && (
            <>
              <PendingListModal
                label="A receber · 7 dias"
                value={formatCurrency(totalReceivableSoon)}
                title="A Receber — Próximos 7 Dias"
                icon={<ArrowDown size={15} strokeWidth={1.5} />}
                iconClassName="bg-gradient-to-br from-acao to-acao-hover text-acao-tx"
              >
                <div className="divide-y divide-regua">
                  {receivablesSoon.length === 0 && <EmptyState title="Nenhuma conta nos próximos 7 dias" />}
                  {receivablesSoon.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-tx truncate">{r.description}</p>
                        <p className="text-xs text-tx-3 mt-0.5">{r.dueDate < hoje ? "Venceu em " : "Vence em "}{formatDate(r.dueDate)}</p>
                        {r.case && (
                          <Link href={`/processos/${r.case.id}`} className="text-xs font-semibold text-acao hover:underline">
                            {r.case.processNumber || r.case.title}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-tx tabular-nums">
                          {formatCurrency(saldoEmAberto(r.amount, r.discount, r.surcharge, r.payments.reduce((s, x) => s + x.amount, 0)))}
                        </span>
                        <SettleButton
                          id={r.id}
                          kind="receivable"
                          liquido={valorLiquido(r.amount, r.discount, r.surcharge)}
                          alreadyPaid={r.payments.reduce((s, x) => s + x.amount, 0)}
                          status={r.status}
                          bankAccounts={bankAccounts}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PendingListModal>

              <PendingListModal
                label="A pagar · 7 dias"
                value={formatCurrency(totalPayableSoon)}
                title="A Pagar — Próximos 7 Dias"
                icon={<ArrowUp size={15} strokeWidth={1.5} />}
                iconClassName="bg-gradient-to-br from-acao to-acao-hover text-acao-tx"
              >
                <div className="divide-y divide-regua">
                  {payablesSoon.length === 0 && <EmptyState title="Nenhuma conta nos próximos 7 dias" />}
                  {payablesSoon.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-tx truncate">{p.description}</p>
                        <p className="text-xs text-tx-3 mt-0.5">{p.dueDate < hoje ? "Venceu em " : "Vence em "}{formatDate(p.dueDate)}</p>
                        {p.case && (
                          <Link href={`/processos/${p.case.id}`} className="text-xs font-semibold text-acao hover:underline">
                            {p.case.processNumber || p.case.title}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-tx tabular-nums">
                          {formatCurrency(saldoEmAberto(p.amount, p.discount, p.surcharge, p.payments.reduce((s, x) => s + x.amount, 0)))}
                        </span>
                        <SettleButton
                          id={p.id}
                          kind="payable"
                          liquido={valorLiquido(p.amount, p.discount, p.surcharge)}
                          alreadyPaid={p.payments.reduce((s, x) => s + x.amount, 0)}
                          status={p.status}
                          bankAccounts={bankAccounts}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PendingListModal>
            </>
          )}

          <div className="bg-sf border-t-2 border-regua-forte rounded-lg p-5">
            <div className="flex items-center gap-2.5">
              <span className="h-[30px] w-[30px] rounded-lg flex items-center justify-center shrink-0 bg-sf-apoio text-tx-2">
                <Filter size={15} strokeWidth={1.5} />
              </span>
              <p className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">Funil — {funilHoje.length} hoje</p>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {funilHoje.length === 0 && <p className="text-sm text-tx-2">Nenhum follow-up para hoje.</p>}
              {funilHoje.slice(0, 2).map((a) => (
                <p key={a.id} className="text-sm text-tx truncate">
                  {a.clientName} <span className="text-tx-3">· {stageLabels[a.stage] ?? a.stage}</span>
                </p>
              ))}
            </div>
            <Link href="/atendimento/funil" className="inline-flex items-center gap-1 text-xs font-semibold text-acao hover:text-acao-hover mt-2">
              Ver funil <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
