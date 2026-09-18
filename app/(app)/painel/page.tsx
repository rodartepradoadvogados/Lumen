import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { stageLabels } from "@/lib/funil";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";
import { getAlertsCount } from "@/lib/alerts";
import {
  Card,
  CardHeader,
  EmptyState,
  formatCurrency,
} from "@/components/ui";
import { classificarPrazo } from "@/lib/dueStatus";
import { formatRelativeDueDate } from "@/lib/formatRelativeDueDate";
import { ArrowRight, Clock, ArrowDown, ArrowUp, Filter } from "lucide-react";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import PendingListModal from "@/components/PendingListModal";
import SettleButton from "@/components/SettleButton";
import OverdueTaskRow from "@/components/OverdueTaskRow";
import DayQueueRow, { type DayQueueItem } from "@/components/DayQueueRow";
import Regua from "@/components/Regua";

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
    totalAlertas,
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
    // A Central inteira — mesma função e mesmos quatro argumentos do sino (TopBarActions e
    // app/m/layout.tsx). A tarja abaixo precisa dela para se declarar como o RECORTE que é, em
    // vez de ser um terceiro número solto na tela. Roda em paralelo com as outras consultas
    // desta tela, então não custa latência nova — só contagens indexadas.
    getAlertsCount(viewer.officeId, hasFinanceAccess, viewer.id, viewer.isAdmin)
  ]);

  const totalReceivableSoon = receivablesSoon.reduce((s, r) => s + saldoEmAberto(r.amount, r.discount, r.surcharge, r.payments.reduce((a, x) => a + x.amount, 0)), 0);
  const totalPayableSoon = payablesSoon.reduce((s, p) => s + saldoEmAberto(p.amount, p.discount, p.surcharge, p.payments.reduce((a, x) => a + x.amount, 0)), 0);

  // A home mede o ESCRITÓRIO, não o usuário logado. Este era o defeito nº 1 do diagnóstico: o
  // cartão "Minhas atrasadas" filtrava por `responsibleId === viewer.id` enquanto
  // `overdueTasksList` — que já traz o escritório inteiro — era buscado e descartado. O usuário
  // prioritário declarado é o sócio dono, e a pergunta que ele faz ao abrir o sistema é "o que
  // corre risco AGORA?". Quantas são as MINHAS continua visível, como segunda linha.
  const minhasAtrasadas = overdueTasksList.filter((t) => t.responsibleId === viewer.id).length;

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

  // Rótulo em linguagem de pessoa (proposta "Movimento & Prazos", apartado item 3) — mesmo
  // helper usado em Agenda/Kanban, só em minúsculas pra manter a voz já usada nesta fila
  // ("venceu em...", "hoje", "amanhã").
  function timeLabel(task: { dueDate: Date; dueTime: string | null }): string {
    const rel = formatRelativeDueDate(task.dueDate).toLowerCase();
    const urgencia = classificarPrazo(task.dueDate);
    if (urgencia === "vencida") return `venceu ${rel}`;
    if ((rel === "hoje" || rel === "amanhã") && task.dueTime) return `${rel} ${task.dueTime}`;
    return rel;
  }

  const dayQueueSource = [...overdueTasksList, ...upcomingTasks];
  const dayQueueSorted = dayQueueSource
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b) || a.dueDate.getTime() - b.dueDate.getTime());

  const dayQueueItems: DayQueueItem[] = dayQueueSorted.map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    subtitle: t.case?.title ?? null,
    timeLabel: timeLabel(t),
    urgencia: classificarPrazo(t.dueDate),
    caseId: t.case?.id ?? null,
    // SÓ o número do processo — nunca o título como reserva.
    //
    // Era `processNumber || title`, e o `subtitle` logo acima JÁ é `case.title`. Num caso sem
    // número (consultivo, extrajudicial, atendimento convertido), a reserva devolvia exatamente a
    // mesma string do subtítulo, e a linha exibia a mesma frase duas vezes, uma embaixo da outra.
    //
    // Achado em 18/09/2026, na primeira navegação do produto com banco de verdade neste ambiente.
    // Nenhuma verificação anterior podia pegá-lo: só aparece quando existe um caso SEM número, e
    // o dado que eu inventava nos harness sempre tinha número. É o tipo exato de defeito que a
    // conferência do dono vinha encontrando por mim.
    //
    // Sem número, a etiqueta não existe: o título já está dito, e repeti-lo não acrescenta nada.
    caseLabel: t.case?.processNumber ?? null,
  }));

  // "O dia" somava prazo vencido e prazo futuro no MESMO número, então a tela não dizia quantos
  // estavam vencidos — outro achado do diagnóstico. Agora as duas contagens são separadas.
  const prazosVencidos = overdueTasksList.filter((t) => t.type === "PRAZO").length;
  const prazosSemana = upcomingTasks.filter((t) => t.type === "PRAZO").length;
  const audienciasSemana = upcomingTasks.filter((t) => t.type === "AUDIENCIA").length;
  const compromissosHoje = upcomingTasks.filter((t) => t.dueDate <= fimHoje).length;

  // A TARJA: o número que a tela diz antes de qualquer navegação.
  //
  // Conta ITENS de risco, e só de dois tipos: compromisso vencido ou de hoje, e conta vencida.
  // Publicação não triada NÃO entra — ela já tem contador próprio no rail, e somá-la aqui seria
  // repetir exatamente o erro que o dono mandou corrigir no badge da Agenda (o mesmo item
  // contado duas vezes, em dois lugares).
  const contasVencidas = [...receivablesSoon, ...payablesSoon].filter((c) => c.dueDate < hoje).length;
  const emRiscoAgora = overdueTasksList.length + compromissosHoje + contasVencidas;
  const composicao = [
    overdueTasksList.length > 0 ? `${overdueTasksList.length} vencido${overdueTasksList.length === 1 ? "" : "s"}` : null,
    compromissosHoje > 0 ? `${compromissosHoje} para hoje` : null,
    contasVencidas > 0 ? `${contasVencidas} conta${contasVencidas === 1 ? "" : "s"} vencida${contasVencidas === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  const dayQueueVisible = dayQueueItems.slice(0, 8);
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
    <div className="tela">
      {/* A tela abria direto na tarja, sem <h1>: navegação por títulos pulava a home inteira e o
          leitor de tela não anunciava onde estava. O título é visualmente oculto de propósito — a
          tarja JÁ é o título visual, e repeti-la em texto seria dizer a mesma coisa duas vezes. */}
      <h1 className="sr-only">Painel do escritório</h1>
      {/* A TARJA — a primeira coisa que a tela diz, e ela fala do ESCRITÓRIO.
          Antes este espaço era uma saudação com o nome do usuário, gastando o maior tipo da
          página, o único gradiente e a única textura do produto. O contrato de direção "Guias"
          é explícito: o tipo é matéria, o número É o bloco, e existe um por tela. */}
      <div className="bg-campo-risco border-t-2 border-marca-tx px-5 py-4 flex items-baseline gap-4 flex-wrap">
        <span className="font-display text-tarja leading-none font-bold tabular-nums text-marca-tx">{emRiscoAgora}</span>
        <span className="text-destaque font-semibold leading-tight text-tx">
          em risco agora,<br />no escritório inteiro
        </span>
        {/* OS DOIS NÚMEROS, LADO A LADO — retorno do dono de 2026-09-17: "tem vários números
            diferentes. Compatibilize e me mostre."
            A tarja e o sino respondem perguntas diferentes e vão continuar diferindo: a tarja
            conta RISCO IMEDIATO (vencido ou de hoje, mais conta vencida) e o sino conta a
            Central inteira (que inclui menção não lida, parcela sem vencimento, delegação sem
            ciência, inconsistência de Drive...). O erro não era serem dois — era a tela mostrar
            um sem nunca nomear o outro, deixando a pessoa achar que um dos dois estava errado.
            Agora a tarja diz do que é feita E diz quantos alertas existem ao todo, com o caminho
            até eles. Deliberadamente NÃO escrito como fração ("14 de 22"): a tarja conta também
            o que vence hoje, que a Central não conta, então a contenção não é garantida e a
            fração poderia virar mentira num dia movimentado. */}
        <div className="ml-auto self-center text-right flex flex-col gap-1">
          <span className="text-etiqueta font-semibold uppercase tracking-[.09em] text-tx-2">
            {composicao || "nada vencido"}
          </span>
          <Link
            href="/alertas?tab=pendentes"
            className="text-etiqueta font-semibold uppercase tracking-[.09em] text-marca-tx hover:text-tx inline-flex items-center gap-1 justify-end"
          >
            Central de Alertas · <span className="tabular-nums">{totalAlertas}</span> pendente{totalAlertas === 1 ? "" : "s"}
            <ArrowRight size={12} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
      <p className="text-etiqueta font-semibold text-tx-3 uppercase tracking-[.09em] mt-2 mb-5">
        {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Coluna larga */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title={
                prazosVencidos > 0
                  ? `Por severidade — ${prazosVencidos} prazo${prazosVencidos === 1 ? "" : "s"} vencido${prazosVencidos === 1 ? "" : "s"}`
                  : `Por severidade — nenhum prazo vencido`
              }
              action={
                <Link href="/agenda" className="text-xs font-semibold text-marca-tx hover:text-tx flex items-center gap-1">
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
              <Link href="/agenda" className="block text-center text-xs font-semibold text-marca-tx hover:text-tx px-5 py-3 border-t border-regua">
                Ver os outros {dayQueueRestCount}
              </Link>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Publicações não lidas — ${unreadGroups.length}`}
              action={
                <div className="flex items-center gap-3">
                  {/* Indicador "ao vivo" (Portal Noturno, DESIGN.md) — único glow do sistema,
                      reservado a este ponto: publicações chegam sozinhas (DJEN/Datajud), então é
                      o lugar certo pra dramatizar "isto está acontecendo agora", não decoração. */}
                  {unreadGroups.length > 0 && (
                    <span className="live-dot" aria-hidden="true" title="Publicações chegam automaticamente" />
                  )}
                  <Link href="/publicacoes" className="text-xs font-semibold text-marca-tx hover:text-tx flex items-center gap-1">
                    Triar <ArrowRight size={13} strokeWidth={1.5} />
                  </Link>
                </div>
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
          {/* A semana em régua graduada, não em rosca de pizza: a graduação diz quanto falta e o
              número diz quanto é (contrato de direção "Guias"). A cor é sempre seção ou risco. */}
          <Card>
            <CardHeader title="A semana" />
            <div className="px-5 py-4 grid gap-4">
              <Regua
                valor={String(prazosSemana)}
                rotulo={`prazo${prazosSemana === 1 ? "" : "s"} até ${soon.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`}
                nota={prazosVencidos > 0 ? `${prazosVencidos} vencido${prazosVencidos === 1 ? "" : "s"}` : undefined}
                preenchido={prazosSemana / Math.max(1, prazosSemana + prazosVencidos)}
                cor="var(--faixa-ardosia)"
                href="/agenda"
              />
              <Regua
                valor={String(audienciasSemana)}
                rotulo={`audiência${audienciasSemana === 1 ? "" : "s"} na semana`}
                preenchido={audienciasSemana / Math.max(1, upcomingTasks.length)}
                cor="var(--faixa-ocre)"
                href="/agenda"
              />
              <Regua
                valor={String(unreadGroups.length)}
                rotulo="publicações na fila"
                nota="triagem"
                preenchido={unreadGroups.length > 0 ? Math.min(1, unreadGroups.length / 50) : 0}
                cor="var(--faixa-oliva)"
                href="/publicacoes"
              />
              {hasFinanceAccess && (
                <Regua
                  valor={formatCurrency(totalReceivableSoon)}
                  rotulo="a receber em 7 dias"
                  nota={contasVencidas > 0 ? `${contasVencidas} vencida${contasVencidas === 1 ? "" : "s"}` : "em dia"}
                  preenchido={totalReceivableSoon > 0 ? totalReceivableSoon / Math.max(totalReceivableSoon, totalPayableSoon) : 0}
                  cor={contasVencidas > 0 ? "var(--risco-vencido)" : "var(--risco-em-dia)"}
                  href="/financeiro"
                />
              )}
            </div>
          </Card>

          <PendingListModal
            label="Atrasadas do escritório"
            value={String(overdueTasksList.length)}
            nota={minhasAtrasadas > 0 ? `${minhasAtrasadas} ${minhasAtrasadas === 1 ? "é sua" : "são suas"}` : "nenhuma é sua"}
            accentClassName="border-t-urgente"
            valueClassName="font-display text-autuacao leading-none font-extrabold text-urgente"
            title="Atrasadas do escritório"
            icon={<Clock size={15} strokeWidth={1.5} />}
            iconClassName="bg-urgente-bg text-urgente"
          >
            <div className="divide-y divide-regua">
              {overdueTasksList.length === 0 && <EmptyState title="Nenhum prazo atrasado no escritório" />}
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
                    // Mesma correção da fila do dia, acima — ver a nota longa lá.
                    caseLabel: t.case?.processNumber ?? null,
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
                  {receivablesSoon.map((r) => {
                    const urgencia = classificarPrazo(r.dueDate);
                    return (
                    <div key={r.id} className={`flex items-center justify-between gap-3 px-5 py-3 border-l-[3px] ${urgencia === "vencida" ? "border-urgente" : urgencia === "vencendo" ? "border-aviso" : "border-regua-forte"}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-tx truncate">{r.description}</p>
                        <p className={`text-xs mt-0.5 ${urgencia === "vencida" ? "text-urgente" : urgencia === "vencendo" ? "text-aviso" : "text-tx-3"}`}>
                          {urgencia === "vencida" ? "Venceu " : "Vence "}{formatRelativeDueDate(r.dueDate)}
                        </p>
                        {r.case && (
                          <Link href={`/processos/${r.case.id}`} className="text-xs font-semibold text-marca-tx hover:underline">
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
                  );})}
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
                  {payablesSoon.map((p) => {
                    const urgencia = classificarPrazo(p.dueDate);
                    return (
                    <div key={p.id} className={`flex items-center justify-between gap-3 px-5 py-3 border-l-[3px] ${urgencia === "vencida" ? "border-urgente" : urgencia === "vencendo" ? "border-aviso" : "border-regua-forte"}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-tx truncate">{p.description}</p>
                        <p className={`text-xs mt-0.5 ${urgencia === "vencida" ? "text-urgente" : urgencia === "vencendo" ? "text-aviso" : "text-tx-3"}`}>
                          {urgencia === "vencida" ? "Venceu " : "Vence "}{formatRelativeDueDate(p.dueDate)}
                        </p>
                        {p.case && (
                          <Link href={`/processos/${p.case.id}`} className="text-xs font-semibold text-marca-tx hover:underline">
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
                  );})}
                </div>
              </PendingListModal>
            </>
          )}

          <div className="bg-sf border-t-2 border-regua-forte p-5">
            <div className="flex items-center gap-2.5">
              <span className="h-[30px] w-[30px] rounded-lg flex items-center justify-center shrink-0 bg-sf-apoio text-tx-2">
                <Filter size={15} strokeWidth={1.5} />
              </span>
              <p className="font-display text-etiqueta font-semibold text-tx-2 uppercase tracking-[.12em]">Funil — {funilHoje.length} hoje</p>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {funilHoje.length === 0 && <p className="text-sm text-tx-2">Nenhum follow-up para hoje.</p>}
              {funilHoje.slice(0, 2).map((a) => (
                <p key={a.id} className="text-sm text-tx truncate">
                  {a.clientName} <span className="text-tx-3">· {stageLabels[a.stage] ?? a.stage}</span>
                </p>
              ))}
            </div>
            <Link href="/atendimento/funil" className="inline-flex items-center gap-1 text-xs font-semibold text-marca-tx hover:text-tx mt-2">
              Ver funil <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
