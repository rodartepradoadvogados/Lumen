import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import { ArrowLeft, Users, Scale, Target, Newspaper, SlidersHorizontal, ChevronRight } from "lucide-react";
import { groupCasesByMateria } from "@/lib/caseMaterias";
import { STAGES, stageLabels, stageColor, CASE_STATUS_ORDER, caseStatusLabels, caseStatusColor, triageLabels, triageColor } from "@/lib/relatoriosLabels";

export const dynamic = "force-dynamic";

// Versão mobile simplificada de 4 das 5 seções do BI consolidado do desktop
// (`app/(app)/relatorios/page.tsx`): Produtividade, Processos, Funil Comercial e
// Publicações — listas simples com contagens, sem gráficos elaborados. A seção
// Financeiro fica de fora: já existe dedicada em `/m/financeiro/relatorios`.
// Regras de acesso: nenhuma daquelas 4 seções é restrita no desktop (só o
// Financeiro exige financeAccess/isAdmin), então esta página não faz gate algum.
//
// A 5ª seção, "Personalizado", não é resumida aqui — é o único bloco onde a pessoa MONTA a
// pergunta (filtros, modelos salvos, exportar em Word/PDF), então vira uma tela própria
// (/m/relatorios/personalizado) em vez de um card de resumo, com o mesmo componente do site.

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(d: Date) {
  return `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function parseMeses(v?: string): 3 | 6 | 12 {
  if (v === "3") return 3;
  if (v === "12") return 12;
  return 6;
}

// STAGES/stageLabels/stageColor, CASE_STATUS_ORDER/caseStatusLabels/caseStatusColor e
// triageLabels/triageColor vêm de lib/relatoriosLabels.ts, compartilhado com o desktop
// (app/(app)/relatorios/page.tsx) — antes cada tela tinha a própria cópia e elas divergiram sem
// ninguém notar, inclusive pintando ARQUIVADO de vermelho aqui, que o desktop proíbe (achado A47
// da revisão gauntlet).

const periodOptions: { value: 3 | 6 | 12; label: string }[] = [
  { value: 3, label: "3m" },
  { value: 6, label: "6m" },
  { value: 12, label: "12m" },
];

export default async function MobileRelatorios({ searchParams }: { searchParams: { meses?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const meses = parseMeses(searchParams.meses);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (meses - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [doneTasks, attendances, publications, activeCases, casesByStatus] = await Promise.all([
    prisma.task.findMany({
      where: { officeId: viewer.officeId, status: "CONCLUIDO", completedAt: { gte: start, lt: end }, responsibleId: { not: null } },
      include: { responsible: { select: { id: true, name: true, color: true } } },
    }),
    prisma.attendance.findMany({
      where: { officeId: viewer.officeId, status: { not: "ARQUIVADO" }, createdAt: { gte: start, lt: end } },
      select: { stage: true },
    }),
    prisma.publication.findMany({
      where: { officeId: viewer.officeId, publishedAt: { gte: start, lt: end } },
      select: { triageStatus: true },
    }),
    prisma.case.findMany({ where: { officeId: viewer.officeId, status: "ATIVO" }, select: { materias: true } }),
    prisma.case.groupBy({ by: ["status"], where: { officeId: viewer.officeId }, _count: { _all: true } }),
  ]);

  // ---------- PRODUTIVIDADE ----------
  const prodByUser = new Map<string, { user: { id: string; name: string; color: string }; points: number; count: number }>();
  for (const t of doneTasks) {
    if (!t.responsible) continue;
    let row = prodByUser.get(t.responsible.id);
    if (!row) {
      row = { user: t.responsible, points: 0, count: 0 };
      prodByUser.set(t.responsible.id, row);
    }
    row.points += t.points;
    row.count += 1;
  }
  const prodRanking = Array.from(prodByUser.values())
    .sort((a, b) => b.points - a.points || b.count - a.count)
    .slice(0, 5);

  // ---------- PROCESSOS ----------
  // Um processo com mais de uma matéria conta em cada grupo — totalActiveCases é o total real de
  // processos ativos, não a soma dos grupos (ver mesmo padrão em app/(app)/relatorios/page.tsx).
  const areaRows = groupCasesByMateria(activeCases).map((r) => ({ label: r.label, value: r.count }));
  const totalActiveCases = activeCases.length;

  const statusCounts: Record<string, number> = {};
  for (const s of CASE_STATUS_ORDER) statusCounts[s] = 0;
  for (const r of casesByStatus) {
    if (CASE_STATUS_ORDER.includes(r.status)) statusCounts[r.status] = r._count._all;
  }

  // ---------- FUNIL COMERCIAL ----------
  const stageCounts = STAGES.map((s) => ({
    stage: s,
    count: attendances.filter((a) => (STAGES.includes(a.stage) ? a.stage : "NOVO") === s).length,
  }));
  const closed = stageCounts.find((s) => s.stage === "FECHADO")?.count ?? 0;
  const lost = stageCounts.find((s) => s.stage === "PERDIDO")?.count ?? 0;
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  // ---------- PUBLICAÇÕES ----------
  const triageRows = ["PENDENTE", "EM_ANALISE", "TRATADA"].map((s) => ({
    status: s,
    value: publications.filter((p) => p.triageStatus === s).length,
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-tx">Relatórios</h1>
          <p className="text-sm text-tx-2">
            {monthLabel(start)} a {monthLabel(now)}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-sf-apoio border border-regua rounded-lg p-1">
          {periodOptions.map((opt) => (
            <Link
              key={opt.value}
              href={`/m/relatorios?meses=${opt.value}`}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                meses === opt.value ? "bg-tx text-sf" : "text-tx-2"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      <Link href="/m/relatorios/personalizado" className="block">
        <Card className="flex items-center gap-3 px-4 py-3.5">
          <span className="h-9 w-9 rounded-lg bg-acao-bg text-acao flex items-center justify-center shrink-0">
            <SlidersHorizontal size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-tx">Relatório Personalizado</p>
            <p className="text-xs text-tx-2">Monte a pergunta: filtros, modelos salvos, Word e PDF</p>
          </div>
          <ChevronRight size={16} className="text-tx-3 shrink-0" />
        </Card>
      </Link>

      {/* PRODUTIVIDADE */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <Users size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm">Produtividade</h3>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-b border-regua">
          <span className="text-xs text-tx-2">Tarefas concluídas no período</span>
          <span className="text-lg font-bold tabular-nums text-tx">{doneTasks.length}</span>
        </div>
        {prodRanking.length === 0 ? (
          <EmptyState title="Nenhuma tarefa concluída no período" />
        ) : (
          <div className="divide-y divide-regua">
            {prodRanking.map((r, i) => (
              <div key={r.user.id} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: `${r.user.color}22`, color: r.user.color }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-tx truncate">{r.user.name}</span>
                <span className="text-sm font-semibold tabular-nums text-tx shrink-0">{r.points} pts</span>
                <span className="text-xs text-tx-2 shrink-0">{r.count} tarefa(s)</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PROCESSOS */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <Scale size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm">Processos</h3>
        </div>
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">
            Por área/matéria (processos ativos)
          </p>
        </div>
        {areaRows.length === 0 ? (
          <EmptyState title="Nenhum processo ativo" />
        ) : (
          <div className="divide-y divide-regua">
            {areaRows.map((r) => (
              <div key={r.label} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-tx-2 truncate">{r.label}</span>
                <span className="text-sm font-semibold tabular-nums text-tx shrink-0">
                  {r.value} · {totalActiveCases > 0 ? ((r.value / totalActiveCases) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 pt-3 pb-1 border-t border-regua mt-1">
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">
            Por status (todos os processos)
          </p>
        </div>
        <div className="divide-y divide-regua">
          {CASE_STATUS_ORDER.map((s) => (
            <div key={s} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm text-tx-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: caseStatusColor[s] }} />
                {caseStatusLabels[s]}
              </span>
              <span className="text-sm font-semibold tabular-nums text-tx shrink-0">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* FUNIL COMERCIAL */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <Target size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm flex-1">Funil Comercial</h3>
          <span className="text-xs text-tx-2">
            Conversão:{" "}
            {conversionRate !== null ? (
              <span className="font-semibold text-concluido">{conversionRate.toFixed(0)}%</span>
            ) : (
              <span className="text-tx-2">—</span>
            )}
          </span>
        </div>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento no período" />
        ) : (
          <div className="divide-y divide-regua">
            {stageCounts.map((s) => (
              <div key={s.stage} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm text-tx-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor[s.stage] }} />
                  {stageLabels[s.stage]}
                </span>
                <span className="text-sm font-semibold tabular-nums text-tx shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PUBLICAÇÕES */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <Newspaper size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm">Publicações</h3>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-b border-regua">
          <span className="text-xs text-tx-2">Volume no período</span>
          <span className="text-lg font-bold tabular-nums text-tx">{publications.length}</span>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-2">
            Pendências de triagem
          </p>
          <div className="grid grid-cols-3 gap-3">
            {triageRows.map((t) => (
              <div
                key={t.status}
                className="rounded-lg bg-sf-apoio border border-regua p-3 text-center"
              >
                <p className="font-bold text-lg tabular-nums text-tx">{t.value}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: triageColor[t.status] }} />
                  <span className="text-[10px] text-tx-2">{triageLabels[t.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
