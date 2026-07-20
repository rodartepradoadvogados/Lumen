import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState, taskTypeLabels, taskTypeColors } from "@/components/ui";
import MobileTaskToggle from "@/components/mobile/MobileTaskToggle";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

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

export default async function MobileAgenda({
  searchParams,
}: {
  searchParams: { d?: string; view?: string };
}) {
  const view = searchParams.view === "week" ? "week" : "day";
  const day = parseDate(searchParams.d);

  if (view === "week") {
    return <WeekView day={day} />;
  }

  return <DayView day={day} />;
}

async function DayView({ day }: { day: Date }) {
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
      <ViewToggle view="day" d={toISODate(start)} />

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

async function WeekView({ day }: { day: Date }) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  // Domingo como início da semana (padrão pt-BR usado no restante do app).
  start.setDate(start.getDate() - start.getDay());

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push(d);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);

  const prevWeek = new Date(start);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(start);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Uma única query para a semana toda, agrupando por tarefa e contando por dia no código
  // (SQLite/Prisma não agrupa direto por "dia" de um DateTime, então trazemos só dueDate + status
  // já filtrado pelo intervalo e contamos em memória, evitando 7 queries separadas).
  const tasks = await prisma.task.findMany({
    where: { dueDate: { gte: start, lte: end }, status: { not: "CANCELADO" } },
    select: { dueDate: true },
  });

  const countsByDay = new Map<string, number>();
  for (const t of tasks) {
    const key = toISODate(t.dueDate);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const monthLabel = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ViewToggle view="week" d={toISODate(day)} />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/m/agenda?view=week&d=${toISODate(prevWeek)}`}
          className="h-9 w-9 rounded-lg bg-white border border-navy-800/10 flex items-center justify-center text-navy-800/60"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </Link>
        <p className="font-serif font-bold text-navy-900 text-sm capitalize text-center flex-1 truncate">{monthLabel}</p>
        <Link
          href={`/m/agenda?view=week&d=${toISODate(nextWeek)}`}
          className="h-9 w-9 rounded-lg bg-white border border-navy-800/10 flex items-center justify-center text-navy-800/60"
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((wd, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-navy-800/40">
              {wd}
            </div>
          ))}
          {weekDays.map((d) => {
            const key = toISODate(d);
            const isToday = d.getTime() === today.getTime();
            const count = countsByDay.get(key) ?? 0;
            return (
              <Link
                key={key}
                href={`/m/agenda?view=day&d=${key}`}
                className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 ${
                  isToday ? "bg-navy-900 border-navy-900" : "bg-cream-100 border-navy-800/8"
                }`}
              >
                <span className={`text-sm font-semibold ${isToday ? "text-cream-50" : "text-navy-900"}`}>
                  {d.getDate()}
                </span>
                {count > 0 && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isToday ? "bg-gold-400" : "bg-gold-600"}`}
                    aria-label={`${count} tarefa(s)`}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </Card>

      <p className="text-center text-xs text-navy-800/40">Toque em um dia para ver as atividades.</p>
    </div>
  );
}

function ViewToggle({ view, d }: { view: "day" | "week"; d: string }) {
  return (
    <div className="flex gap-1 bg-white border border-navy-800/10 rounded-lg p-1">
      <Link
        href={`/m/agenda?view=day&d=${d}`}
        className={`flex-1 text-center text-xs font-semibold py-1.5 rounded-md transition-colors ${
          view === "day" ? "bg-navy-900 text-cream-50" : "text-navy-800/50"
        }`}
      >
        Dia
      </Link>
      <Link
        href={`/m/agenda?view=week&d=${d}`}
        className={`flex-1 text-center text-xs font-semibold py-1.5 rounded-md transition-colors ${
          view === "week" ? "bg-navy-900 text-cream-50" : "text-navy-800/50"
        }`}
      >
        Semana
      </Link>
    </div>
  );
}
