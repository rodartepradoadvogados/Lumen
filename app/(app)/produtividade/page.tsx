import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserHistory } from "@/lib/timesheet";
import { PageHeader, Card, Badge, EmptyState, formatDate, taskTypeLabels, taskTypeColors } from "@/components/ui";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import DelegateTaskForm from "@/components/DelegateTaskForm";

export const dynamic = "force-dynamic";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Interpreta ?mes=YYYY-MM; se inválido, usa o mês corrente.
function parseMonth(mes?: string): { year: number; month: number } {
  const now = new Date();
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-navy-900 text-white"
          : "bg-white dark:bg-navy-800 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: { mes?: string; aba?: string; responsibleId?: string };
}) {
  const aba = searchParams.aba === "timesheet" ? "timesheet" : searchParams.aba === "delegar" ? "delegar" : "historico";
  const viewer = await getCurrentUser();

  const tabs = (
    <div className="flex items-center gap-2 flex-wrap">
      <TabLink label="Histórico" href={`/produtividade${searchParams.mes ? `?mes=${searchParams.mes}` : ""}`} active={aba === "historico"} />
      <TabLink label="Timesheet" href="/produtividade?aba=timesheet" active={aba === "timesheet"} />
      <TabLink label="Delegar" href="/produtividade?aba=delegar" active={aba === "delegar"} />
    </div>
  );

  if (aba === "delegar") {
    const delegateUsers = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    return (
      <div className="p-6 max-w-[700px] mx-auto animate-fade-in space-y-6">
        <PageHeader title="Produtividade" subtitle="Delegue tarefas e compromissos para outros membros da equipe" />
        {tabs}

        <Card>
          <DelegateTaskForm users={delegateUsers} />
        </Card>
      </div>
    );
  }

  if (aba === "timesheet") {
    const history = viewer ? await getUserHistory(viewer.id, 30) : [];

    return (
      <div className="p-6 max-w-[1000px] mx-auto animate-fade-in space-y-6">
        <PageHeader title="Produtividade" subtitle="Acompanhamento de tarefas concluídas e tempo de uso do sistema" />
        {tabs}

        <Card>
          <div className="px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
            <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">
              {viewer ? `Timesheet — ${viewer.name}` : "Meu Timesheet"}
            </h3>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Acompanhe seu tempo de uso do sistema nos últimos 30 dias.</p>
          </div>
          {history.length === 0 ? (
            <EmptyState title="Nenhum registro de acesso" subtitle="Assim que você usar o sistema, seu tempo aparecerá aqui." />
          ) : (
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {history.map((day) => (
                <div key={day.date} className="flex items-center gap-3 px-5 py-3">
                  <Clock size={14} className="text-navy-800/30 dark:text-cream-50/30 shrink-0" />
                  <p className="text-sm text-navy-900 dark:text-cream-50 flex-1">{formatDate(new Date(`${day.date}T00:00:00`))}</p>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 w-32 text-right">
                    1º login {new Date(day.firstLogin).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 w-24 text-right">{formatHMS(day.seconds)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  const { year, month } = parseMonth(searchParams.mes);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const prevParam = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
  const nextParam = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
  const label = `${MESES[month]} de ${year}`;

  const responsibleId = searchParams.responsibleId || undefined;

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: "CONCLUIDO",
        completedAt: { gte: start, lt: end },
        responsibleId: responsibleId ?? { not: null },
      },
      include: {
        responsible: { select: { id: true, name: true, color: true } },
        case: { select: { id: true, title: true } },
      },
      orderBy: { completedAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  type Row = {
    user: { id: string; name: string; color: string };
    count: number;
    points: number;
    tasks: { id: string; title: string; type: string; completedAt: Date | null; dueDate: Date; points: number; caseTitle: string | null }[];
  };

  const byUser = new Map<string, Row>();
  for (const t of tasks) {
    if (!t.responsible) continue;
    let row = byUser.get(t.responsible.id);
    if (!row) {
      row = { user: t.responsible, count: 0, points: 0, tasks: [] };
      byUser.set(t.responsible.id, row);
    }
    row.count += 1;
    row.points += t.points;
    row.tasks.push({
      id: t.id,
      title: t.title,
      type: t.type,
      completedAt: t.completedAt,
      dueDate: t.dueDate,
      points: t.points,
      caseTitle: t.case?.title ?? null,
    });
  }

  const rows = Array.from(byUser.values()).sort((a, b) => b.points - a.points || b.count - a.count);

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <PageHeader
        title="Produtividade"
        subtitle="Histórico de tarefas concluídas por membro da equipe"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/produtividade?mes=${prevParam}${responsibleId ? `&responsibleId=${responsibleId}` : ""}`}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-white dark:bg-navy-800 border border-navy-800/10 dark:border-white/10 text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/5"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="text-sm font-semibold text-navy-900 dark:text-cream-50 min-w-[150px] text-center capitalize">{label}</span>
            <Link
              href={`/produtividade?mes=${nextParam}${responsibleId ? `&responsibleId=${responsibleId}` : ""}`}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-white dark:bg-navy-800 border border-navy-800/10 dark:border-white/10 text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/5"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        }
      />

      {tabs}

      <Card>
        <form className="p-4 flex flex-wrap items-end gap-3">
          {searchParams.mes && <input type="hidden" name="mes" value={searchParams.mes} />}
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Responsável</label>
            <select
              name="responsibleId"
              defaultValue={responsibleId ?? ""}
              className="border border-navy-800/12 dark:border-white/15 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Filtrar
          </button>
          {responsibleId && (
            <Link
              href={`/produtividade${searchParams.mes ? `?mes=${searchParams.mes}` : ""}`}
              className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2"
            >
              Limpar filtro
            </Link>
          )}
        </form>
      </Card>

      <Card>
        <div className="px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">Histórico</h3>
          <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Clique em um nome para ver as tarefas concluídas no mês</p>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma tarefa concluída neste período" subtitle="As tarefas concluídas com responsável definido aparecem aqui." />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {rows.map((row) => (
              <details key={row.user.id} className="group">
                <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-cream-50 dark:hover:bg-white/5 list-none">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: row.user.color }}
                  >
                    {initials(row.user.name)}
                  </span>
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50 flex-1">{row.user.name}</p>
                  <span className="text-xs text-navy-800/45 dark:text-cream-50/45">{row.count} tarefa(s)</span>
                  <span className="text-xs font-semibold text-navy-900 dark:text-cream-50">{row.points} pts</span>
                  <ChevronRight size={14} className="text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-90" />
                </summary>
                <div className="bg-cream-50/60 dark:bg-white/5 px-5 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/40 dark:text-cream-50/40">
                        <th className="py-1.5 font-semibold">Tarefa</th>
                        <th className="py-1.5 font-semibold">Tipo</th>
                        <th className="py-1.5 font-semibold">Concluída em</th>
                        <th className="py-1.5 font-semibold text-right">Pontos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
                      {row.tasks.map((t) => (
                        <tr key={t.id}>
                          <td className="py-1.5 pr-2 text-navy-900 dark:text-cream-50">
                            {t.title}
                            {t.caseTitle && <span className="block text-[11px] text-navy-800/40 dark:text-cream-50/40 truncate">{t.caseTitle}</span>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                          </td>
                          <td className="py-1.5 pr-2 text-navy-800/60 dark:text-cream-50/60">{t.completedAt ? formatDate(t.completedAt) : "—"}</td>
                          <td className="py-1.5 text-right font-semibold text-navy-900 dark:text-cream-50">{t.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
