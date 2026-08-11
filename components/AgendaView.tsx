"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check, Hourglass } from "lucide-react";
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
  safetyDueDate: string | null;
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
  case: { id: string; title: string } | null;
  responsible: { id: string; name: string; color: string } | null;
  meetingType: string | null;
  location: string | null;
  meetingUrl: string | null;
  // Preenchido só depois do agrupamento por dia (tasksByDay, logo abaixo): a mesma tarefa
  // aparece até duas vezes na Agenda quando tem prazo de segurança — uma entrada no dia do
  // prazo fatal ("fatal") e outra no dia do prazo de segurança, 24h antes ("seguranca") — cada
  // uma com estilo visual distinto pra indicar a urgência.
  entryKind?: "fatal" | "seguranca";
};

type Option = { id: string; name: string };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// A cor de cada compromisso representa o seu TIPO — tabela exata em DESIGN-SYSTEM.md §7. A
// mesma cor aparece em três formas: bolinha de legenda (10px, `dot`), chip de rótulo (`chip`,
// fundo+texto) e filete esquerdo de 3px no chip do calendário (`filete`) e no card do Kanban
// (reexportado daqui — ver components/KanbanBoard.tsx). Áudiência é a única exceção autorizada
// ao ouro fora da marca (ver §7); as demais batem 1:1 com um token semântico já existente.
export const typeMeta: Record<string, { dot: string; chip: string; filete: string }> = {
  TAREFA: { dot: "bg-tx-2", chip: "bg-sf-apoio text-tx-2", filete: "border-tx-2" },
  EVENTO: { dot: "bg-acao", chip: "bg-acao-bg text-acao", filete: "border-acao" },
  AUDIENCIA: { dot: "bg-marca", chip: "bg-marca-bg text-marca-tx", filete: "border-marca" },
  PERICIA: { dot: "bg-aviso", chip: "bg-aviso-bg text-aviso", filete: "border-aviso" },
  PRAZO: { dot: "bg-urgente", chip: "bg-urgente-bg text-urgente", filete: "border-urgente" },
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Rótulo discreto de auditoria (tooltip/texto pequeno) exibido nos itens já concluídos —
// null quando falta responsável ou data (ex.: dado legado de antes deste campo existir).
function completedLabel(t: TaskData): string | null {
  if (!t.completedBy || !t.completedAt) return null;
  const d = new Date(t.completedAt);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Concluído por ${t.completedBy.name} em ${date} às ${time}`;
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
    // t.dueDate/t.safetyDueDate chegam do servidor como ISO de meia-noite UTC (a data-calendário
    // do prazo, sem hora — ver computeSafetyDueDate em lib/actions/tasks.ts). Fazer
    // `new Date(iso).getDate()` leria essa meia-noite UTC no fuso LOCAL do navegador: em
    // Brasília (UTC-3) isso cai sempre um dia antes (ex.: 2026-08-10T00:00:00Z vira 09/08 às
    // 21h aqui), fazendo o prazo aparecer no dia errado na grade. Como o valor já É a data-
    // calendário certa nos 10 primeiros caracteres do ISO, extrair direto evita esse desvio.
    const fatalKey = t.dueDate.slice(0, 10);
    (tasksByDay[fatalKey] ||= []).push({ ...t, entryKind: "fatal" });
    if (t.safetyDueDate) {
      const safeKey = t.safetyDueDate.slice(0, 10);
      (tasksByDay[safeKey] ||= []).push({ ...t, entryKind: "seguranca" });
    }
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
      <div className="flex gap-1 bg-sf-apoio rounded-lg border border-regua p-1">
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
              visao === v.key
                ? "bg-acao text-acao-tx"
                : "text-tx-2 hover:bg-sf"
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <select
        value={responsibleId}
        onChange={(e) => onFilterChange("responsibleId", e.target.value)}
        className="text-xs font-medium border border-regua-forte rounded-lg px-2.5 py-2 bg-sf text-tx"
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
        className="text-xs font-medium border border-regua-forte rounded-lg px-2.5 py-2 bg-sf text-tx"
      >
        <option value="">Todos os tipos</option>
        {Object.keys(typeMeta).map((k) => (
          <option key={k} value={k}>
            {taskTypeLabels[k]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-3 flex-wrap ml-auto">
        <span className="text-[11px] font-semibold text-tx-3 uppercase tracking-wide">Cores por tipo:</span>
        {Object.entries(typeMeta).map(([k, m]) => (
          <span key={k} className="flex items-center gap-1.5 text-[11px] text-tx-2">
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

// Prazo de segurança usa uma cor de aviso FIXA, sempre diferente da cor por tipo — é a mesma
// tarefa do prazo fatal, mas o objetivo aqui é chamar atenção de urgência, não repetir a cor do
// tipo (que já aparece no dia do prazo fatal).
const safetyChip = "bg-aviso-bg text-aviso";

// Chip do calendário (mês/semana): filete esquerdo de 3px na cor do tipo — mesma régua usada no
// card do Kanban (DESIGN-SYSTEM.md §7/§12), em vez da bolinha (que fica só na legenda "Cores por
// tipo", 10px).
function EventChip({ t }: { t: TaskData }) {
  const done = t.status === "CONCLUIDO";
  const isSafety = t.entryKind === "seguranca";
  const meta = typeMeta[t.type] || typeMeta.TAREFA;
  const doneTip = done ? completedLabel(t) : null;
  return (
    <div
      data-tip={isSafety ? "Prazo de segurança — 24h antes do prazo fatal" : doneTip || undefined}
      className={clsx(
        "text-[10px] pl-1.5 pr-1 py-0.5 rounded-r truncate font-medium flex items-center gap-1 border-l-[3px]",
        isSafety ? clsx(safetyChip, "border-aviso") : clsx(meta.chip, meta.filete),
        done && "line-through opacity-60"
      )}
    >
      {isSafety && <Hourglass size={9} className="shrink-0" />}
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
    <div className="bg-sf rounded-xl border border-regua shadow-card flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
        <h3 className="font-bold text-tx text-lg">
          {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-1">
          <Link href={prevMonthHref} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx/80">
            <ChevronLeft size={18} />
          </Link>
          <Link href={buildHref({ year: String(today.getFullYear()), month: String(today.getMonth()) })} className="text-xs font-semibold text-acao px-2 py-1 rounded-lg hover:bg-acao-bg">
            Hoje
          </Link>
          <Link href={nextMonthHref} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx/80">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-regua">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold text-tx-3 py-2 uppercase tracking-wide">
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
                "border-b border-r border-regua p-1 sm:p-1.5 text-left flex flex-col min-h-[56px] sm:min-h-[86px] transition-colors",
                !inMonth && "bg-sf-apoio text-tx-3",
                isSelected && "bg-acao-bg ring-1 ring-inset ring-acao"
              )}
            >
              <span
                className={clsx(
                  "text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full",
                  isToday ? "bg-acao text-acao-tx" : "text-tx-2"
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map((t) => (
                  <EventChip key={t.id} t={t} />
                ))}
                {dayTasks.length > 3 && <p className="text-[10px] text-tx-3 pl-1">+{dayTasks.length - 3} mais</p>}
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
    <div className="bg-sf rounded-xl border border-regua shadow-card flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
        <h3 className="font-bold text-tx text-lg">Semana de {label}</h3>
        <div className="flex items-center gap-1">
          <Link href={buildHref({ week: ymd(prevWeek) })} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx/80">
            <ChevronLeft size={18} />
          </Link>
          <Link href={buildHref({ week: ymd(today) })} className="text-xs font-semibold text-acao px-2 py-1 rounded-lg hover:bg-acao-bg">
            Hoje
          </Link>
          <Link href={buildHref({ week: ymd(nextWeek) })} className="p-1.5 rounded-lg hover:bg-sf-apoio text-tx/80">
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
                "border-r border-regua last:border-r-0 p-1.5 text-left flex flex-col overflow-hidden transition-colors",
                isSelected && "bg-acao-bg"
              )}
            >
              <div className="flex flex-col items-center mb-1.5">
                <span className="text-[10px] font-semibold text-tx-3 uppercase">{WEEKDAYS[date.getDay()]}</span>
                <span
                  className={clsx(
                    "text-xs font-semibold h-6 w-6 flex items-center justify-center rounded-full",
                    isToday ? "bg-acao text-acao-tx" : "text-tx-2"
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
    <div className="bg-sf rounded-xl border border-regua shadow-card flex-1 min-h-0 overflow-y-auto scrollbar-thin">
      {days.length === 0 && <p className="text-center text-sm text-tx-3 py-16">Nada agendado nos próximos 30 dias</p>}
      {days.map((day) => {
        const items = tasksByDay[day].sort((a, b) => (a.dueTime || "").localeCompare(b.dueTime || ""));
        const date = new Date(day + "T00:00:00");
        return (
          <div key={day}>
            <div className="sticky top-0 bg-sf-apoio px-5 py-2 border-y border-regua">
              <p className="text-xs font-semibold text-tx capitalize">
                {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
            </div>
            <div className="divide-y divide-regua">
              {items.map((t) => {
                const done = t.status === "CONCLUIDO";
                const isSafety = t.entryKind === "seguranca";
                return (
                  <div key={`${t.id}-${t.entryKind}`} className="px-5 py-3 flex items-start gap-3">
                    {isSafety ? (
                      <Hourglass size={11} className="mt-1 shrink-0 text-aviso" />
                    ) : (
                      <span className={clsx("mt-1 h-2.5 w-2.5 rounded-full shrink-0", typeMeta[t.type]?.dot)} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                        {isSafety && <Badge color="gold">Prazo de segurança (24h antes)</Badge>}
                        {t.dueTime && <span className="text-[11px] font-semibold text-tx-3">{t.dueTime}</span>}
                      </div>
                      <p className={clsx("text-sm font-medium text-tx mt-1", done && "line-through text-tx-3")}>{t.title}</p>
                      {t.case && (
                        <Link href={`/processos/${t.case.id}`} className="text-xs text-acao hover:underline block truncate">
                          {t.case.title}
                        </Link>
                      )}
                      {t.responsible && <p className="text-[11px] text-tx-3 mt-0.5">Responsável: {t.responsible.name}</p>}
                      {done && completedLabel(t) && (
                        <p className="text-[11px] text-tx-3 mt-0.5">{completedLabel(t)}</p>
                      )}
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
    <div className="bg-sf rounded-xl border border-regua shadow-card flex flex-col min-h-0">
      <div className="px-5 py-4 border-b border-regua flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-tx">
            {new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h3>
          <p className="text-xs text-tx-3 mt-0.5">{selectedTasks.length} item(ns) neste dia</p>
        </div>
        <NewTaskModal key={selected} cases={cases} users={users} columns={columns} defaultDate={selected} label="+ Nova neste dia" />
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-regua">
        {selectedTasks.length === 0 && <p className="text-center text-sm text-tx-3 py-10">Nada agendado para este dia</p>}
        {selectedTasks.map((t) => {
          const done = t.status === "CONCLUIDO";
          const isSafety = t.entryKind === "seguranca";
          return (
            <div key={`${t.id}-${t.entryKind}`} className="px-5 py-3.5 flex gap-3">
              <button
                onClick={() => onToggle(t.id)}
                data-tip={done ? completedLabel(t) || undefined : undefined}
                className={clsx(
                  "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                  done ? "bg-emerald-500 border-emerald-500 text-white" : "border-regua-forte text-transparent hover:border-emerald-500"
                )}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                  <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                  {isSafety && (
                    <Badge color="gold">
                      <Hourglass size={10} className="inline -mt-0.5 mr-1" />
                      Prazo de segurança (24h antes)
                    </Badge>
                  )}
                  {t.dueTime && <span className="text-[11px] font-semibold text-tx-3">{t.dueTime}</span>}
                  <span className="ml-auto">
                    <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir "${t.title}" da agenda?`} />
                  </span>
                </div>
                <p className={clsx("text-sm font-medium text-tx mt-1", done && "line-through text-tx-3")}>{t.title}</p>
                {t.case && (
                  <Link href={`/processos/${t.case.id}`} className="text-xs text-acao hover:underline mt-0.5 block truncate">
                    {t.case.title}
                  </Link>
                )}
                {t.responsible && <p className="text-[11px] text-tx-3 mt-1">Responsável: {t.responsible.name}</p>}
                {t.meetingType === "PRESENCIAL" && t.location && <p className="text-[11px] text-tx-3 mt-1">📍 {t.location}</p>}
                {t.meetingType === "ONLINE" && t.meetingUrl && (
                  <a href={t.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-acao hover:underline mt-1 block truncate">
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
