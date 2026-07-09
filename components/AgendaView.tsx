"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import clsx from "clsx";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { Badge, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";

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

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AgendaView({
  year,
  month, // 0-indexed
  tasks,
}: {
  year: number;
  month: number;
  tasks: TaskData[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const today = new Date();
  const [selected, setSelected] = useState<string>(ymd(today));

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

  const tasksByDay: Record<string, TaskData[]> = {};
  for (const t of tasks) {
    const key = ymd(new Date(t.dueDate));
    (tasksByDay[key] ||= []).push(t);
  }

  const prevMonthHref = `/agenda?year=${month === 0 ? year - 1 : year}&month=${month === 0 ? 11 : month - 1}`;
  const nextMonthHref = `/agenda?year=${month === 11 ? year + 1 : year}&month=${month === 11 ? 0 : month + 1}`;

  const selectedTasks = (tasksByDay[selected] || []).sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 flex-1 min-h-0">
      <div className="bg-white rounded-xl border border-navy-800/8 shadow-card flex flex-col min-h-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
          <h3 className="font-serif font-bold text-navy-900 text-lg">
            {MONTHS[month]} {year}
          </h3>
          <div className="flex items-center gap-1">
            <Link href={prevMonthHref} className="p-1.5 rounded-lg hover:bg-cream-100 text-navy-800">
              <ChevronLeft size={18} />
            </Link>
            <Link
              href={`/agenda?year=${today.getFullYear()}&month=${today.getMonth()}`}
              className="text-xs font-semibold text-gold-700 px-2 py-1 rounded-lg hover:bg-gold-500/10"
            >
              Hoje
            </Link>
            <Link href={nextMonthHref} className="p-1.5 rounded-lg hover:bg-cream-100 text-navy-800">
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-navy-800/8">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[11px] font-semibold text-navy-800/40 py-2 uppercase tracking-wide">
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
                  "border-b border-r border-navy-800/5 p-1.5 text-left flex flex-col min-h-[86px] transition-colors",
                  !inMonth && "bg-cream-50/60 text-navy-800/25",
                  isSelected && "bg-gold-500/10 ring-1 ring-inset ring-gold-500/40"
                )}
              >
                <span
                  className={clsx(
                    "text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full",
                    isToday ? "bg-navy-900 text-white" : "text-navy-800/70"
                  )}
                >
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-0.5 overflow-hidden">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className={clsx(
                        "text-[10px] px-1 py-0.5 rounded truncate font-medium",
                        t.status === "CONCLUIDO"
                          ? "bg-emerald-100 text-emerald-700 line-through"
                          : new Date(t.dueDate) < today
                          ? "bg-red-100 text-red-700"
                          : "bg-navy-900/10 text-navy-900"
                      )}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-[10px] text-navy-800/40 pl-1">+{dayTasks.length - 3} mais</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy-800/8 shadow-card flex flex-col min-h-0">
        <div className="px-5 py-4 border-b border-navy-800/8">
          <h3 className="font-serif font-bold text-navy-900">
            {new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
          <p className="text-xs text-navy-800/45 mt-0.5">{selectedTasks.length} item(ns) neste dia</p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-navy-800/5">
          {selectedTasks.length === 0 && (
            <p className="text-center text-sm text-navy-800/35 py-10">Nada agendado para este dia</p>
          )}
          {selectedTasks.map((t) => {
            const done = t.status === "CONCLUIDO";
            return (
              <div key={t.id} className="px-5 py-3.5 flex gap-3">
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await toggleTaskDone(t.id);
                      router.refresh();
                    })
                  }
                  className={clsx(
                    "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                    done ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 text-transparent hover:border-emerald-500"
                  )}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                    <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                    {t.dueTime && <span className="text-[11px] font-semibold text-navy-800/50">{t.dueTime}</span>}
                    <span className="ml-auto">
                      <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir "${t.title}" da agenda?`} />
                    </span>
                  </div>
                  <p className={clsx("text-sm font-medium text-navy-900 mt-1", done && "line-through text-navy-800/40")}>
                    {t.title}
                  </p>
                  {t.case && (
                    <Link href={`/processos/${t.case.id}`} className="text-xs text-gold-700 hover:underline mt-0.5 block truncate">
                      {t.case.title}
                    </Link>
                  )}
                  {t.responsible && <p className="text-[11px] text-navy-800/40 mt-1">Responsável: {t.responsible.name}</p>}
                  {t.meetingType === "PRESENCIAL" && t.location && (
                    <p className="text-[11px] text-navy-800/50 mt-1">📍 {t.location}</p>
                  )}
                  {t.meetingType === "ONLINE" && t.meetingUrl && (
                    <a href={t.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline mt-1 block truncate">
                      🔗 {t.meetingUrl}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
