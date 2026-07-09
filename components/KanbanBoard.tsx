"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveTask, toggleTaskDone } from "@/lib/actions/tasks";
import { Badge, taskTypeLabels, taskTypeColors, priorityColors, formatDate } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import { Check, MessageSquare } from "lucide-react";
import clsx from "clsx";

export type TaskCardData = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueDate: string;
  dueTime: string | null;
  columnId: string | null;
  case: { id: string; title: string } | null;
  responsible: { id: string; name: string; color: string } | null;
  _count: { comments: number };
};

export type ColumnData = {
  id: string;
  name: string;
  color: string;
  isDoneCol: boolean;
  tasks: TaskCardData[];
};

export default function KanbanBoard({ columns }: { columns: ColumnData[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  function handleDrop(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;
    setOptimistic((o) => ({ ...o, [taskId]: columnId }));
    const targetCol = columns.find((c) => c.id === columnId);
    const order = targetCol ? targetCol.tasks.length : 0;
    startTransition(async () => {
      await moveTask(taskId, columnId, order);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full items-start">
      {columns.map((col) => {
        const colTasks = col.tasks.filter((t) => (optimistic[t.id] ?? t.columnId) === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.id);
            }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={(e) => handleDrop(e, col.id)}
            className={clsx(
              "w-80 shrink-0 rounded-xl bg-cream-100/70 border flex flex-col max-h-full",
              dragOverCol === col.id ? "border-gold-500 bg-gold-500/5" : "border-navy-800/8"
            )}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-navy-800/8 sticky top-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="font-semibold text-sm text-navy-900">{col.name}</h3>
              </div>
              <span className="text-xs font-semibold text-navy-800/40 bg-white rounded-full px-2 py-0.5">
                {colTasks.length}
              </span>
            </div>
            <div className="p-2.5 space-y-2 overflow-y-auto scrollbar-thin flex-1">
              {colTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={() => startTransition(async () => { await toggleTaskDone(task.id); router.refresh(); })} />
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-center text-navy-800/30 py-6">Arraste um card para cá</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onToggle }: { task: TaskCardData; onToggle: () => void }) {
  const overdue = new Date(task.dueDate) < new Date() && task.status !== "CONCLUIDO";
  const done = task.status === "CONCLUIDO";

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className={clsx(
        "bg-white rounded-lg border p-3 shadow-card cursor-grab active:cursor-grabbing transition-shadow hover:shadow-pop",
        done ? "border-emerald-200 opacity-60" : overdue ? "border-red-300" : "border-navy-800/8"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Badge color={taskTypeColors[task.type]}>{taskTypeLabels[task.type]}</Badge>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            title={done ? "Reabrir" : "Concluir"}
            className={clsx(
              "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
              done ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 text-transparent hover:border-emerald-500"
            )}
          >
            <Check size={12} strokeWidth={3} />
          </button>
          <DeleteEntityButton entityType="TASK" entityId={task.id} entityLabel={task.title} confirmMessage={`Excluir "${task.title}"?`} />
        </div>
      </div>
      <p className={clsx("text-sm font-medium text-navy-900 leading-snug", done && "line-through")}>{task.title}</p>
      {task.case && <p className="text-xs text-navy-800/45 mt-1 truncate">{task.case.title}</p>}

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          <Badge color={priorityColors[task.priority]}>{task.priority}</Badge>
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-navy-800/40">
              <MessageSquare size={11} /> {task._count.comments}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={clsx("text-[11px] font-semibold", overdue ? "text-red-600" : "text-navy-800/50")}>
            {formatDate(task.dueDate)}
          </span>
          {task.responsible && (
            <span
              title={task.responsible.name}
              className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
              style={{ backgroundColor: task.responsible.color }}
            >
              {task.responsible.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
