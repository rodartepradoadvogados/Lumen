import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import { ArrowLeft, Users, Scale, Target, Newspaper } from "lucide-react";

export const dynamic = "force-dynamic";

// Versão mobile simplificada de 4 das 5 seções do BI consolidado do desktop
// (`app/(app)/relatorios/page.tsx`): Produtividade, Processos, Funil Comercial e
// Publicações — listas simples com contagens, sem gráficos elaborados. A seção
// Financeiro fica de fora: já existe dedicada em `/m/financeiro/relatorios`.
// Regras de acesso: nenhuma daquelas 4 seções é restrita no desktop (só o
// Financeiro exige financeAccess/isAdmin), então esta página não faz gate algum.

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(d: Date) {
  return `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function parseMeses(v?: string): 3 | 6 | 12 {
  if (v === "3") return 3;
  if (v === "12") return 12;
  return 6;
}

const STAGES = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];
const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};
const stageColor: Record<string, string> = {
  NOVO: "#f59e0b",
  QUALIFICACAO: "#3b82f6",
  PROPOSTA: "#c6a05c",
  FECHADO: "#10b981",
  PERDIDO: "#ef4444",
};

const CASE_STATUS_ORDER = ["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"];
const caseStatusLabels: Record<string, string> = {
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
  ARQUIVADO: "Arquivado",
};
const caseStatusColor: Record<string, string> = {
  ATIVO: "#10b981",
  SUSPENSO: "#f59e0b",
  ENCERRADO: "#64748b",
  ARQUIVADO: "#ef4444",
};

const triageLabels: Record<string, string> = { PENDENTE: "Pendente", EM_ANALISE: "Em análise", TRATADA: "Tratada" };
const triageColor: Record<string, string> = { PENDENTE: "#f59e0b", EM_ANALISE: "#3b82f6", TRATADA: "#10b981" };

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

  const [doneTasks, attendances, publications, casesByArea, casesByStatus] = await Promise.all([
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
    prisma.case.groupBy({ by: ["area"], where: { officeId: viewer.officeId, status: "ATIVO" }, _count: { _all: true } }),
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
  const areaRows = casesByArea
    .map((r) => ({ label: r.area ?? "Sem área", value: r._count._all }))
    .sort((a, b) => b.value - a.value);
  const totalActiveCases = areaRows.reduce((s, r) => s + r.value, 0);

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
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Início
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Relatórios</h1>
          <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
            {monthLabel(start)} a {monthLabel(now)}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white dark:bg-navy-800 border border-navy-800/10 dark:border-white/10 rounded-lg p-1">
          {periodOptions.map((opt) => (
            <Link
              key={opt.value}
              href={`/m/relatorios?meses=${opt.value}`}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
                meses === opt.value ? "bg-navy-900 text-white" : "text-navy-800/60 dark:text-cream-50/60"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* PRODUTIVIDADE */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Users size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Produtividade</h3>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-b border-navy-800/5 dark:border-white/10">
          <span className="text-xs text-navy-800/50 dark:text-cream-50/50">Tarefas concluídas no período</span>
          <span className="text-lg font-serif font-bold text-navy-900 dark:text-cream-50">{doneTasks.length}</span>
        </div>
        {prodRanking.length === 0 ? (
          <EmptyState title="Nenhuma tarefa concluída no período" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {prodRanking.map((r, i) => (
              <div key={r.user.id} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: `${r.user.color}22`, color: r.user.color }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{r.user.name}</span>
                <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{r.points} pts</span>
                <span className="text-xs text-navy-800/45 dark:text-cream-50/45 shrink-0">{r.count} tarefa(s)</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PROCESSOS */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Scale size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Processos</h3>
        </div>
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide">
            Por área/matéria (processos ativos)
          </p>
        </div>
        {areaRows.length === 0 ? (
          <EmptyState title="Nenhum processo ativo" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {areaRows.map((r) => (
              <div key={r.label} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-sm text-navy-800 dark:text-cream-50/85 truncate">{r.label}</span>
                <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">
                  {r.value} · {totalActiveCases > 0 ? ((r.value / totalActiveCases) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 pt-3 pb-1 border-t border-navy-800/8 dark:border-white/10 mt-1">
          <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide">
            Por status (todos os processos)
          </p>
        </div>
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {CASE_STATUS_ORDER.map((s) => (
            <div key={s} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50/85">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: caseStatusColor[s] }} />
                {caseStatusLabels[s]}
              </span>
              <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* FUNIL COMERCIAL */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Target size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm flex-1">Funil Comercial</h3>
          <span className="text-xs text-navy-800/50 dark:text-cream-50/50">
            Conversão:{" "}
            {conversionRate !== null ? (
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{conversionRate.toFixed(0)}%</span>
            ) : (
              <span className="text-navy-800/40 dark:text-cream-50/40">—</span>
            )}
          </span>
        </div>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento no período" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {stageCounts.map((s) => (
              <div key={s.stage} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50/85">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor[s.stage] }} />
                  {stageLabels[s.stage]}
                </span>
                <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* PUBLICAÇÕES */}
      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Newspaper size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Publicações</h3>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-b border-navy-800/5 dark:border-white/10">
          <span className="text-xs text-navy-800/50 dark:text-cream-50/50">Volume no período</span>
          <span className="text-lg font-serif font-bold text-navy-900 dark:text-cream-50">{publications.length}</span>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">
            Pendências de triagem
          </p>
          <div className="grid grid-cols-3 gap-3">
            {triageRows.map((t) => (
              <div
                key={t.status}
                className="rounded-lg bg-cream-100/70 dark:bg-navy-800/70 border border-navy-800/8 dark:border-white/10 p-3 text-center"
              >
                <p className="font-serif font-bold text-lg text-navy-900 dark:text-cream-50">{t.value}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: triageColor[t.status] }} />
                  <span className="text-[10px] text-navy-800/55 dark:text-cream-50/55">{triageLabels[t.status]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
