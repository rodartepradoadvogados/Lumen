"use client";

import { useState } from "react";
import Link from "next/link";
import TaskDetailModal from "@/components/TaskDetailModal";
import { Badge, taskTypeColors, taskTypeLabels } from "@/components/ui";
import { formatRelativeDueDate } from "@/lib/formatRelativeDueDate";

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
    // Filete vermelho fixo (não classificarPrazo): esta linha só existe dentro do modal "Prazos
    // Atrasados", já pré-filtrado — toda linha aqui é, por definição, vencida. Sem pulso de
    // atenção (Movimento 6): repetir o "acende e assenta" em 20 linhas de uma vez é ruído, não
    // destaque — o próprio título do modal já concentra a atenção.
    <div className="px-5 py-3 border-l-[3px] border-urgente hover:bg-sf-apoio transition-colors">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={taskTypeColors[task.type] ?? "slate"}>{taskTypeLabels[task.type] ?? task.type}</Badge>
          <p className="text-sm font-medium text-tx">{task.title}</p>
        </div>
        <p className="text-xs text-urgente font-semibold mt-0.5">
          {task.responsibleName && <span className="text-tx-2 font-normal">Responsável: {task.responsibleName} · </span>}
          Venceu {formatRelativeDueDate(task.dueDate)}
        </p>
      </button>
      {task.caseId && (
        <Link href={`/processos/${task.caseId}`} className="inline-block mt-1 text-xs font-semibold text-marca-tx hover:underline">
          {task.caseLabel}
        </Link>
      )}
      {open && <TaskDetailModal taskId={task.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
