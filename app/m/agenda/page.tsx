import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState, taskTypeLabels, taskTypeColors } from "@/components/ui";
import MobileTaskToggle from "@/components/mobile/MobileTaskToggle";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s?: string) {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export default async function MobileAgenda({ searchParams }: { searchParams: { d?: string } }) {
  const day = parseDate(searchParams.d);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const prev = new Date(start);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = start.getTime() === today.getTime();

  const tasks = await prisma.task.findMany({
    where: { dueDate: { gte: start, lte: end }, status: { not: "CANCELADO" } },
    include: { case: true, responsible: true },
    orderBy: [{ dueTime: "asc" }, { createdAt: "asc" }],
  });

  const label = start.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/m/agenda?d=${toISODate(prev)}`}
          className="h-9 w-9 rounded-lg bg-white border border-navy-800/10 flex items-center justify-center text-navy-800/60"
          aria-label="Dia anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="text-center min-w-0 flex-1">
          <p className="font-serif font-bold text-navy-900 text-sm capitalize truncate">{label}</p>
          {!isToday && (
            <Link href="/m/agenda" className="text-[11px] font-semibold text-gold-700">
              Voltar para hoje
            </Link>
          )}
          {isToday && <p className="text-[11px] font-semibold text-gold-700">Hoje</p>}
        </div>
        <Link
          href={`/m/agenda?d=${toISODate(next)}`}
          className="h-9 w-9 rounded-lg bg-white border border-navy-800/10 flex items-center justify-center text-navy-800/60"
          aria-label="Próximo dia"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card>
        {tasks.length === 0 ? (
          <EmptyState title="Nenhuma tarefa neste dia" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {tasks.map((t) => {
              const done = t.status === "CONCLUIDO";
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="pt-0.5">
                    <MobileTaskToggle taskId={t.id} done={done} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge color={taskTypeColors[t.type] ?? "slate"}>{taskTypeLabels[t.type] ?? t.type}</Badge>
                      {t.dueTime && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-navy-800/55">
                          <Clock size={12} /> {t.dueTime}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-medium ${done ? "line-through text-navy-800/40" : "text-navy-900"}`}>
                      {t.title}
                    </p>
                    {t.case && <p className="text-xs text-gold-700 mt-0.5 truncate">{t.case.title}</p>}
                    {t.responsible && <p className="text-xs text-navy-800/40 mt-0.5">{t.responsible.name}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
