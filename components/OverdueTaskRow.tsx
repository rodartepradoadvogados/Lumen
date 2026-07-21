"use client";

import { useState } from "react";
import Link from "next/link";
import TaskDetailModal from "@/components/TaskDetailModal";
import { Badge, formatDate, taskTypeColors, taskTypeLabels } from "@/components/ui";

// Linha de uma tarefa atrasada dentro do modal "Prazos Atrasados" do painel: clicar na
// linha abre o card do compromisso; o número do processo é um link separado (não aninhado
// dentro do botão, para não gerar <a> dentro de elemento clicável).
export default function OverdueTaskRow({
  task,
}: {
  task: {
    id: string;
    title: string;
    type: string;
    dueDate: string;
    responsibleName?: string | null;
    caseId?: string | null;
    caseLabel?: string | null;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-5 py-3 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={taskTypeColors[task.type] ?? "slate"}>{taskTypeLabels[task.type] ?? task.type}</Badge>
          <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{task.title}</p>
        </div>
        <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
          {task.responsibleName && <>Responsável: {task.responsibleName} · </>}
          Venceu em {formatDate(task.dueDate)}
        </p>
      </button>
      {task.caseId && (
        <Link href={`/processos/${task.caseId}`} className="inline-block mt-1 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline">
          {task.caseLabel}
        </Link>
      )}
      {open && <TaskDetailModal taskId={task.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
