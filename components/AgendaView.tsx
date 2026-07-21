"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import clsx from "clsx";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { Badge, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import NewTaskModal from "@/components/NewTaskModal";

type TaskData = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueDate: string;
  dueTime: string | null;
  case: { id: string; title: string } | null;
  responsible: { id: string; name: string; color: string } | null;
  meetingType: string | null;
  location: string | null;
  meetingUrl: string | null;
};

type Option = { id: string; name: string };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// A cor de cada compromisso representa o seu TIPO.
const typeMeta: Record<string, { dot: string; chip: string }> = {
  TAREFA: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-cream-50/70" },
  EVENTO: { dot: "bg-blue-500", chip: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-400" },
  AUDIENCIA: { dot: "bg-gold-500", chip: "bg-gold-500/20 text-gold-800 dark:bg-gold-400/15 dark:text-gold-400" },
  PERICIA: { dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400" },
  PRAZO: { dot: "bg-red-500", chip: "bg-red-100 text-red-700 dark:bg-bordo-400/15 dark:text-bordo-400" },
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AgendaView({
  visao,
  year,
  month,
  weekStart,
  tasks,
  users,
  responsibleId,
  tipo,
  cases,
  columns,
}: {
  visao: string;
  year: number;
  month: number;
  weekStart: string;
  tasks: TaskData[];
  users: Option[];
  responsibleId: string;
  tipo: string;
  cases: Option[];
  columns: Option[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const today = new Date();
  const [selected, setSelected] = useState<string>(ymd(today));

  const tasksByDay: Record<string, TaskData[]> = {};
  for (const t of tasks) {
    const key = ymd(new Date(t.dueDate));
    (tasksByDay[key] ||= []).push(t);
  }

  // Preserva os filtros ativos ao trocar de visão/navegar.
  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = { visao, responsibleId, tipo, ...extra };
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/agenda${s ? `?${s}` : ""}`;
  }

  function onFilterChange(key: "responsibleId" | "tipo", value: string) {
    router.push(buildHref({ [key]: value || undefined }));
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="flex gap-1 bg-white dark:bg-navy-900 rounded-lg border border-navy-800/10 dark:border-white/10 p-1">
        {[
          { key: "mes", label: "Mês" },
          { key: "semana", label: "Semana" },
          { key: "lista", label: "Lista" },
        ].map((v) => (
          <Link
            key={v.key}
            href={buildHref({ visao: v.key === "mes" ? undefined : v.key })}
            className={clsx(
              "text-xs font-semibold px-3 py-1.5 rounded-md transition-colors",
              visao === v.key ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950" : "text-navy-800/60 dark:text-cream-50/60 hover:bg-cream-100 dark:hover:bg-white/5"
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <select
        value={responsibleId}
        onChange={(e) => onFilterChange("responsibleId", e.target.value)}
        className="text-xs font-medium border border-navy-800/12 dark:border-white/15 rounded-lg px-2.5 py-2 bg-white dark:bg-navy-800 dark:text-cream-50"
      >
        <option value="">Todos os responsáveis</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      <select
        value={tipo}
        onChange={(e) => onFilterChange("tipo", e.target.value)}
        className="text-xs font-medium border border-navy-800/12 dark:border-white/15 rounded-lg px-2.5 py-2 bg-white dark:bg-navy-800 dark:text-cream-50"
      >
        <option value="">Todos os tipos</option>
        {Object.keys(typeMeta).map((k) => (
          <option key={k} value={k}>
            {taskTypeLabels[k]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-3 flex-wrap ml-auto">
        <span className="text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">Cores por tipo:</span>
        {Object.entries(typeMeta).map(([k, m]) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px] text-navy-800/60 dark:text-cream-50/60">
            <span className={clsx("h-2.5 w-2.5 rounded-full", m.dot)} />
            {taskTypeLabels[k]}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {controls}
      {visao === "lista" ? (
        <ListView tasksByDay={tasksByDay} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 flex-1 min-h-0">
          {visao === "semana" ? (
            <WeekView
              weekStart={weekStart}
              tasksByDay={tasksByDay}
              selected={selected}
              setSelected={setSelected}
              today={today}
              buildHref={buildHref}
            />
          ) : (
            <MonthView
              year={year}
              month={month}
              tasksByDay={tasksByDay}
              selected={selected}
              setSelected={setSelected}
              today={today}
              buildHref={buildHref}
            />
          )}
          <DayPanel
            selected={selected}
            tasksByDay={tasksByDay}
            onToggle={(id) =>
              startTransition(async () => {
                await toggleTaskDone(id);
                router.refresh();
              })
            }
            cases={cases}
            users={users}
            columns={columns}
          />
        </div>
      )}
    </div>
  );
}

function EventChip({ t }: { t: TaskData }) {
  const done = t.status === "CONCLUIDO";
  const meta = typeMeta[t.type] || typeMeta.TAREFA;
  return (
    <div
      className={clsx(
        "text-[10px] px-1 py-0.5 rounded truncate font-medium flex items-center gap-1",
        meta.chip,
        done && "line-through opacity-60"
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full shrink-0", typeMeta[t.type]?.dot)} />
      {t.dueTime && <span className="opacity-70">{t.dueTime}</span>}
      <span className="truncate">{t.title}</span>
    </div>
  );
}

function MonthView({
  year,
  month,
  tasksByDay,
  selected,
  setSelected,
  today,
  buildHref,
}: {
  year: number;
  month: number;
  tasksByDay: Record<string, TaskData[]>;
  selected: string;
  setSelected: (v: string) => void;
  today: Date;
  buildHref: (extra: Record<string, string | undefined>) => string;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }

  const prevMonthHref = buildHref({ year: String(month === 0 ? year - 1 : year), month: String(month === 0 ? 11 : month - 1) });
  const nextMonthHref = buildHref({ year: String(month === 11 ? year + 1 : year), month: String(month === 11 ? 0 : month + 1) });

  return (
    <div className="bg-white dark:bg-navy-900 rounded-xl border border-navy-800/8 dark:border-white/10 shadow-card flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
        <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-lg">
          {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-1">
          <Link href={prevMonthHref} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 text-navy-800 dark:text-cream-50/80">
            <ChevronLeft size={18} />
          </Link>
          <Link href={buildHref({ year: String(today.getFullYear()), month: String(today.getMonth()) })} className="text-xs font-semibold text-gold-700 dark:text-gold-400 px-2 py-1 rounded-lg hover:bg-gold-500/10 dark:hover:bg-gold-400/10">
            Hoje
          </Link>
          <Link href={nextMonthHref} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 text-navy-800 dark:text-cream-50/80">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-navy-800/8 dark:border-white/10">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 py-2 uppercase tracking-wide">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {cells.map(({ date, inMonth }) => {
          const key = ymd(date);
          const dayTasks = tasksByDay[key] || [];
          const isToday = key === ymd(today);
          const isSelected = key === selected;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={clsx(
                "border-b border-r border-navy-800/5 dark:border-white/10 p-1 sm:p-1.5 text-left flex flex-col min-h-[56px] sm:min-h-[86px] transition-colors",
                !inMonth && "bg-cream-50/60 dark:bg-white/5 text-navy-800/25 dark:text-cream-50/20",
                isSelected && "bg-gold-500/10 dark:bg-gold-400/10 ring-1 ring-inset ring-gold-500/40 dark:ring-gold-400/40"
              )}
            >
              <span
                className={clsx(
                  "text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full",
                  isToday ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950" : "text-navy-800/70 dark:text-cream-50/70"
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map((t) => (
                  <EventChip key={t.id} t={t} />
                ))}
                {dayTasks.length > 3 && <p className="text-[10px] text-navy-800/40 dark:text-cream-50/40 pl-1">+{dayTasks.length - 3} mais</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  weekStart,
  tasksByDay,
  selected,
  setSelected,
  today,
  buildHref,
}: {
  weekStart: string;
  tasksByDay: Record<string, TaskData[]>;
  selected: string;
  setSelected: (v: string) => void;
  today: Date;
  buildHref: (extra: Record<string, string | undefined>) => string;
}) {
  const start = new Date(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const prevWeek = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
  const nextWeek = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const label = `${start.getDate()}/${String(start.getMonth() + 1).padStart(2, "0")} – ${days[6].getDate()}/${String(days[6].getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="bg-white dark:bg-navy-900 rounded-xl border border-navy-800/8 dark:border-white/10 shadow-card flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
        <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-lg">Semana de {label}</h3>
        <div className="flex items-center gap-1">
          <Link href={buildHref({ week: ymd(prevWeek) })} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 text-navy-800 dark:text-cream-50/80">
            <ChevronLeft size={18} />
          </Link>
          <Link href={buildHref({ week: ymd(today) })} className="text-xs font-semibold text-gold-700 dark:text-gold-400 px-2 py-1 rounded-lg hover:bg-gold-500/10 dark:hover:bg-gold-400/10">
            Hoje
          </Link>
          <Link href={buildHref({ week: ymd(nextWeek) })} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5 text-navy-800 dark:text-cream-50/80">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 flex-1 min-h-0">
        {days.map((date) => {
          const key = ymd(date);
          const dayTasks = (tasksByDay[key] || []).sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));
          const isToday = key === ymd(today);
          const isSelected = key === selected;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={clsx(
                "border-r border-navy-800/5 dark:border-white/10 last:border-r-0 p-1.5 text-left flex flex-col overflow-hidden transition-colors",
                isSelected && "bg-gold-500/10 dark:bg-gold-400/10"
              )}
            >
              <div className="flex flex-col items-center mb-1.5">
                <span className="text-[10px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase">{WEEKDAYS[date.getDay()]}</span>
                <span
                  className={clsx(
                    "text-xs font-semibold h-6 w-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950" : "text-navy-800/70 dark:text-cream-50/70"
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              <div className="space-y-1 overflow-y-auto scrollbar-thin flex-1">
                {dayTasks.map((t) => (
                  <EventChip key={t.id} t={t} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ tasksByDay }: { tasksByDay: Record<string, TaskData[]> }) {
  const days = Object.keys(tasksByDay).sort();

  return (
    <div className="bg-white dark:bg-navy-900 rounded-xl border border-navy-800/8 dark:border-white/10 shadow-card flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      {days.length === 0 && <p className="text-center text-sm text-navy-800/35 dark:text-cream-50/35 py-16">Nada agendado nos próximos 30 dias</p>}
      {days.map((day) => {
        const items = tasksByDay[day].sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));
        const date = new Date(day + "T00:00:00");
        return (
          <div key={day}>
            <div className="sticky top-0 bg-cream-50 dark:bg-navy-800 px-5 py-2 border-y border-navy-800/8 dark:border-white/10">
              <p className="text-xs font-semibold text-navy-900 dark:text-cream-50 capitalize">
                {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
            </div>
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {items.map((t) => {
                const done = t.status === "CONCLUIDO";
                return (
                  <div key={t.id} className="px-5 py-3 flex items-start gap-3">
                    <span className={clsx("mt-1 h-2.5 w-2.5 rounded-full shrink-0", typeMeta[t.type]?.dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                        {t.dueTime && <span className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50">{t.dueTime}</span>}
                      </div>
                      <p className={clsx("text-sm font-medium text-navy-900 dark:text-cream-50 mt-1", done && "line-through text-navy-800/40 dark:text-cream-50/40")}>{t.title}</p>
                      {t.case && (
                        <Link href={`/processos/${t.case.id}`} className="text-xs text-gold-700 dark:text-gold-400 hover:underline block truncate">
                          {t.case.title}
                        </Link>
                      )}
                      {t.responsible && <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-0.5">Responsável: {t.responsible.name}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayPanel({
  selected,
  tasksByDay,
  onToggle,
  cases,
  users,
  columns,
}: {
  selected: string;
  tasksByDay: Record<string, TaskData[]>;
  onToggle: (id: string) => void;
  cases: Option[];
  users: Option[];
  columns: Option[];
}) {
  const selectedTasks = (tasksByDay[selected] || []).sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));

  return (
    <div className="bg-white dark:bg-navy-900 rounded-xl border border-navy-800/8 dark:border-white/10 shadow-card flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-navy-800/8 dark:border-white/10 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">
            {new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
          <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">{selectedTasks.length} item(ns) neste dia</p>
        </div>
        <NewTaskModal key={selected} cases={cases} users={users} columns={columns} defaultDate={selected} label="+ Nova neste dia" />
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-navy-800/5 dark:divide-white/10">
        {selectedTasks.length === 0 && <p className="text-center text-sm text-navy-800/35 dark:text-cream-50/35 py-10">Nada agendado para este dia</p>}
        {selectedTasks.map((t) => {
          const done = t.status === "CONCLUIDO";
          return (
            <div key={t.id} className="px-5 py-3.5 flex gap-3">
              <button
                onClick={() => onToggle(t.id)}
                className={clsx(
                  "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                  done ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 dark:border-white/20 text-transparent hover:border-emerald-500"
                )}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                  <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                  {t.dueTime && <span className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50">{t.dueTime}</span>}
                  <span className="ml-auto">
                    <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir "${t.title}" da agenda?`} />
                  </span>
                </div>
                <p className={clsx("text-sm font-medium text-navy-900 dark:text-cream-50 mt-1", done && "line-through text-navy-800/40 dark:text-cream-50/40")}>{t.title}</p>
                {t.case && (
                  <Link href={`/processos/${t.case.id}`} className="text-xs text-gold-700 dark:text-gold-400 hover:underline mt-0.5 block truncate">
                    {t.case.title}
                  </Link>
                )}
                {t.responsible && <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-1">Responsável: {t.responsible.name}</p>}
                {t.meetingType === "PRESENCIAL" && t.location && <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-1">📍 {t.location}</p>}
                {t.meetingType === "ONLINE" && t.meetingUrl && (
                  <a href={t.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1 block truncate">
                    🔗 {t.meetingUrl}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
