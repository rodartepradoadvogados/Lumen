"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveTask, toggleTaskDone } from "@/lib/actions/tasks";
import { Badge, ConclusionChip, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import TaskDetailModal from "@/components/TaskDetailModal";
import { classificarPrazo, PRAZO_URGENCIA_BORDER, PRAZO_URGENCIA_TEXT } from "@/lib/dueStatus";
import { formatRelativeDueDate } from "@/lib/formatRelativeDueDate";
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
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
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
              // Coluna: fundo de apoio + régua; o card branco é a única coisa clara dentro dela —
              // é isso que comunica que ele é o que se pega (DESIGN-SYSTEM.md §12).
              "w-80 shrink-0 bg-sf-apoio border flex flex-col max-h-full",
              dragOverCol === col.id ? "border-acao bg-acao-bg" : "border-regua"
            )}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-regua sticky top-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="font-semibold text-sm text-tx">{col.name}</h3>
              </div>
              <span className="text-xs font-semibold text-tx-2 bg-sf border border-regua rounded-full px-2 py-0.5">
                {colTasks.length}
              </span>
            </div>
            <div className="p-2.5 space-y-2 overflow-y-auto scrollbar-thin flex-1 stagger-in">
              {colTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={() => startTransition(async () => { await toggleTaskDone(task.id); router.refresh(); })} />
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-center text-tx-3 py-6">Arraste um card para cá</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onToggle }: { task: TaskCardData; onToggle: () => void }) {
  const done = task.status === "CONCLUIDO";
  // Urgência (não mais tipo) no filete — proposta "Movimento & Prazos", setembro/2026 (apartado,
  // item 1: "tipo no chip, tempo no filete"). Concluído nunca é "vencido" pra fins de cor/pulso,
  // mesmo que a data já tenha passado — daí o `done &&` curto-circuitando pra "a-vencer" (neutro).
  const urgencia = done ? "a-vencer" : classificarPrazo(task.dueDate);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Pop no check ao concluir (proposta "Slide & Sumir") — mesmo raciocínio de TaskActivityRow.tsx.
  const [justCompleted, setJustCompleted] = useState(false);
  const completedTip =
    done && task.completedBy && task.completedAt
      ? `Concluído por ${task.completedBy.name} em ${new Date(task.completedAt).toLocaleDateString("pt-BR")} às ${new Date(task.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      data-delete-row
      className={clsx(
        // Card: fundo --sf-superficie, borda 1px --regua, filete esquerdo de 3px na cor de
        // URGÊNCIA (não mais do tipo — o tipo continua no Badge logo abaixo). Sombra + leve
        // levantada (Movimento 2 · arrastar) enquanto está sendo arrastado; volta ao normal em
        // 200ms ao soltar (a própria `transition-all` cobre os dois sentidos). Concluído leva
        // opacidade 72% + riscado (DESIGN-SYSTEM.md §12).
        "bg-sf border p-3 cursor-grab active:cursor-grabbing border-l-[3px] transition-all duration-200",
        PRAZO_URGENCIA_BORDER[urgencia],
        dragging ? "shadow-arrasto scale-[1.02] duration-150" : "shadow-none scale-100",
        done && "opacity-[.72]",
        urgencia === "vencida" && "animate-attention-pulse"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        {done ? <ConclusionChip>{taskConclusionLabel(task.type)}</ConclusionChip> : <Badge color={taskTypeColors[task.type]}>{taskTypeLabels[task.type]}</Badge>}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (!done) setJustCompleted(true);
              onToggle();
            }}
            data-tip={done ? completedTip || "Reabrir" : "Concluir"}
            className={clsx(
              "h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
              done ? "bg-concluido border-concluido text-white" : "border-regua-forte text-transparent hover:border-concluido",
              justCompleted && "animate-check-pop"
            )}
          >
            <Check size={12} strokeWidth={3} />
          </button>
          <DeleteEntityButton entityType="TASK" entityId={task.id} entityLabel={task.title} confirmMessage={`Excluir "${task.title}"?`} />
        </div>
      </div>
      {/* Clicar no título abre o card completo (TaskDetailModal), com a conversa em
          comentários — mesmo card usado em Central de Alertas/Atividades do processo. Só o
          título é clicável (não o card inteiro), pra não atrapalhar o drag-and-drop entre colunas. */}
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <p className={clsx("text-sm font-medium text-tx leading-snug", done && "line-through")}>{task.title}</p>
      </button>
      {task.case && <p className="text-xs text-tx-3 mt-1 truncate">{task.case.title}</p>}

      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          {!done && <Badge color={priorityColors[task.priority]}>{task.priority}</Badge>}
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-tx-3">
              <MessageSquare size={11} /> {task._count.comments}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={clsx("text-[11px] font-semibold", done ? "text-tx-3" : PRAZO_URGENCIA_TEXT[urgencia])}>
            {formatRelativeDueDate(task.dueDate)}
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
      {open && <TaskDetailModal taskId={task.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
