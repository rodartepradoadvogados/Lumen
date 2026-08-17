"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Badge, taskTypeLabels, taskTypeColors } from "@/components/ui";
import MobileTaskToggle from "@/components/mobile/MobileTaskToggle";
import TaskDetailModal from "@/components/TaskDetailModal";

// Mesma tradução tipo -> cor de filete de app/m/agenda/page.tsx (duplicada aqui de propósito:
// "use client" não pode importar de um Server Component, e o arquivo original não expunha essa
// tabela como export).
const TYPE_BORDER_COLORS: Record<string, string> = {
  slate: "border-l-tx-2",
  blue: "border-l-acao",
  gold: "border-l-marca",
  amber: "border-l-aviso",
  red: "border-l-urgente",
};
function taskTypeBorder(type: string): string {
  return TYPE_BORDER_COLORS[taskTypeColors[type] ?? "slate"] ?? "border-l-tx-3";
}

type MobileAgendaTask = {
  id: string;
  type: string;
  dueTime: string | null;
  title: string;
  status: string;
  caseTitle: string | null;
  responsibleName: string | null;
  completedByName: string | null;
  completedAt: string | null; // ISO — serializado no Server Component (ver comentário em AgendaView.tsx:TaskData)
};

// Toque no card abre o compromisso completo (TaskDetailModal) — mesma ideia de
// components/AgendaView.tsx:DayPanelTaskRow (desktop): editar título/tipo/prioridade/data/hora
// ("adiar")/responsável/reunião/descrição, concluir/reabrir e excluir, direto do app. Antes
// disso, o card do app só dava pra marcar como concluído (MobileTaskToggle) — sem editar nada.
export default function MobileAgendaTaskRow({ t }: { t: MobileAgendaTask }) {
  const [open, setOpen] = useState(false);
  const done = t.status === "CONCLUIDO";

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 border-l-[3px] ${taskTypeBorder(t.type)}`}>
      <div className="pt-0.5">
        <MobileTaskToggle taskId={t.id} done={done} />
      </div>
      <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <Badge color={taskTypeColors[t.type] ?? "slate"}>{taskTypeLabels[t.type] ?? t.type}</Badge>
          {t.dueTime && (
            <span className="flex items-center gap-1 text-xs font-semibold text-tx-2">
              <Clock size={12} /> {t.dueTime}
            </span>
          )}
        </div>
        <p className={`text-sm font-medium ${done ? "line-through text-tx-2" : "text-tx"}`}>{t.title}</p>
        {t.caseTitle && <p className="text-xs text-acao mt-0.5 truncate">{t.caseTitle}</p>}
        {t.responsibleName && <p className="text-xs text-tx-2 mt-0.5">{t.responsibleName}</p>}
        {done && t.completedByName && t.completedAt && (
          <p className="text-[11px] text-tx-3 mt-0.5">
            Concluído por {t.completedByName} em {new Date(t.completedAt).toLocaleDateString("pt-BR")} às{" "}
            {new Date(t.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </button>
      {open && <TaskDetailModal taskId={t.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
