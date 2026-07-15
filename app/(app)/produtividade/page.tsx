import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState, formatDate, taskTypeLabels, taskTypeColors } from "@/components/ui";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

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

export default async function ProdutividadePage({ searchParams }: { searchParams: { mes?: string } }) {
  const { year, month } = parseMonth(searchParams.mes);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const prevParam = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
  const nextParam = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
  const label = `${MESES[month]} de ${year}`;

  const tasks = await prisma.task.findMany({
    where: {
      status: "CONCLUIDO",
      completedAt: { gte: start, lt: end },
      responsibleId: { not: null },
    },
    include: {
      responsible: { select: { id: true, name: true, color: true } },
      case: { select: { id: true, title: true } },
    },
    orderBy: { completedAt: "desc" },
  });

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

  const ranking = Array.from(byUser.values()).sort((a, b) => b.points - a.points || b.count - a.count);

  const totalPoints = ranking.reduce((s, r) => s + r.points, 0);
  const totalTasks = ranking.reduce((s, r) => s + r.count, 0);

  function initials(name: string) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <PageHeader
        title="Produtividade"
        subtitle="Ranking de pontos (TaskScore) por tarefas concluídas no mês"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={`/produtividade?mes=${prevParam}`}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-navy-800/10 text-navy-800/60 hover:bg-cream-100"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="text-sm font-semibold text-navy-900 min-w-[150px] text-center capitalize">{label}</span>
            <Link
              href={`/produtividade?mes=${nextParam}`}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-navy-800/10 text-navy-800/60 hover:bg-cream-100"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        }
      />

      <Card>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-navy-800/8">
          <Trophy size={18} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 text-base flex-1">Ranking do Mês</h3>
          <span className="text-xs text-navy-800/50">
            {totalTasks} tarefa(s) · {totalPoints} ponto(s)
          </span>
        </div>
        {ranking.length === 0 ? (
          <EmptyState title="Nenhuma tarefa concluída neste mês" subtitle="As tarefas concluídas com responsável definido aparecem aqui." />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {ranking.map((row, i) => (
              <div key={row.user.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`w-7 text-center font-serif font-bold ${i === 0 ? "text-gold-700" : "text-navy-800/40"}`}>
                  {i + 1}º
                </span>
                <span
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: row.user.color }}
                >
                  {initials(row.user.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900 truncate">{row.user.name}</p>
                    {i === 0 && <Badge color="gold">1º lugar</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45">{row.count} tarefa(s) concluída(s)</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-serif font-bold text-lg text-navy-900">{row.points}</p>
                  <p className="text-[11px] text-navy-800/40 uppercase tracking-wide">pontos</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {ranking.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-navy-800/8">
            <h3 className="font-serif font-bold text-navy-900 text-base">Detalhe por pessoa</h3>
            <p className="text-xs text-navy-800/50 mt-0.5">Clique em um nome para ver as tarefas concluídas no mês</p>
          </div>
          <div className="divide-y divide-navy-800/5">
            {ranking.map((row) => (
              <details key={row.user.id} className="group">
                <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-cream-50 list-none">
                  <span
                    className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: row.user.color }}
                  >
                    {initials(row.user.name)}
                  </span>
                  <p className="text-sm font-medium text-navy-900 flex-1">{row.user.name}</p>
                  <span className="text-xs text-navy-800/45">{row.count} tarefa(s)</span>
                  <span className="text-xs font-semibold text-navy-900">{row.points} pts</span>
                  <ChevronRight size={14} className="text-navy-800/30 transition-transform group-open:rotate-90" />
                </summary>
                <div className="bg-cream-50/60 px-5 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/40">
                        <th className="py-1.5 font-semibold">Tarefa</th>
                        <th className="py-1.5 font-semibold">Tipo</th>
                        <th className="py-1.5 font-semibold">Concluída em</th>
                        <th className="py-1.5 font-semibold text-right">Pontos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/5">
                      {row.tasks.map((t) => (
                        <tr key={t.id}>
                          <td className="py-1.5 pr-2 text-navy-900">
                            {t.title}
                            {t.caseTitle && <span className="block text-[11px] text-navy-800/40 truncate">{t.caseTitle}</span>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                          </td>
                          <td className="py-1.5 pr-2 text-navy-800/60">{t.completedAt ? formatDate(t.completedAt) : "—"}</td>
                          <td className="py-1.5 text-right font-semibold text-navy-900">{t.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
