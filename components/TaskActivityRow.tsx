"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TaskDetailModal from "@/components/TaskDetailModal";
import TaskResponsibleSelect from "@/components/TaskResponsibleSelect";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { Badge, formatDate, taskTypeColors, taskTypeLabels, priorityColors } from "@/components/ui";
import { Check, MessageSquare } from "lucide-react";

// Linha da aba Atividades do processo, em estilo "card Trello": clicar no título abre o mesmo
// card de compromisso (TaskDetailModal) usado no resto do site — com a conversa em comentários
// dentro dele (ver TaskDetailModal). O botão de concluir e o resto da linha ficam FORA do botão
// que abre o modal (irmãos, não aninhados), mesmo padrão de components/OverdueTaskRow.tsx.
export default function TaskActivityRow({
  task,
  users,
}: {
  task: {
    id: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    dueDate: string;
    responsibleId: string | null;
    commentCount: number;
  };
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await toggleTaskDone(task.id);
          router.refresh();
          setLoading(false);
        }}
        className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center disabled:opacity-50 ${
          task.status === "CONCLUIDO" ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 dark:border-white/20 hover:border-emerald-500"
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color={taskTypeColors[task.type]}>{taskTypeLabels[task.type]}</Badge>
            <Badge color={priorityColors[task.priority]}>{task.priority}</Badge>
            <p
              className={`text-sm font-medium text-navy-900 dark:text-cream-50 ${
                task.status === "CONCLUIDO" ? "line-through text-navy-800/40 dark:text-cream-50/40" : ""
              }`}
            >
              {task.title}
            </p>
            {task.commentCount > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-navy-800/40 dark:text-cream-50/40">
                <MessageSquare size={11} /> {task.commentCount}
              </span>
            )}
          </div>
        </button>
        <TaskResponsibleSelect taskId={task.id} responsibleId={task.responsibleId} users={users} />
      </div>
      <p className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 shrink-0">{formatDate(task.dueDate)}</p>
      <DeleteEntityButton entityType="TASK" entityId={task.id} entityLabel={task.title} confirmMessage={`Excluir a atividade "${task.title}"?`} />
      {open && <TaskDetailModal taskId={task.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
