"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import TaskDetailModal from "@/components/TaskDetailModal";

// Linha da fila "O dia" do Painel (documento 03 do handoff do redesenho Modernist) — cada
// compromisso (tarefa/evento/audiência/perícia/prazo) vencido ou dos próximos dias, com filete de
// 4px na cor do tipo (§7 do manual) e um botão "Abrir" que abre o card do compromisso direto
// (mesmo TaskDetailModal usado em components/OverdueTaskRow.tsx), sem passar pela Agenda.
const TYPE_FILETE_CLASS: Record<string, string> = {
  TAREFA: "border-l-tx-2",
  EVENTO: "border-l-acao",
  AUDIENCIA: "border-l-marca",
  PERICIA: "border-l-aviso",
  PRAZO: "border-l-urgente",
};

export type DayQueueItem = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  timeLabel: string;
  urgent: boolean;
  caseId: string | null;
  caseLabel: string | null;
};

export default function DayQueueRow({ item }: { item: DayQueueItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={clsx("flex items-center gap-3 pl-3 pr-5 py-2.5 border-l-4", TYPE_FILETE_CLASS[item.type] ?? "border-l-tx-2")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-tx truncate">{item.title}</p>
        {item.subtitle && <p className="text-xs text-tx-2 truncate mt-0.5">{item.subtitle}</p>}
        {item.caseId && (
          <Link href={`/processos/${item.caseId}`} className="inline-block mt-0.5 text-xs font-semibold text-marca-tx hover:underline">
            {item.caseLabel}
          </Link>
        )}
      </div>
      <span className={clsx("shrink-0 text-xs font-semibold whitespace-nowrap", item.urgent ? "text-urgente" : "text-tx-2")}>
        {item.timeLabel}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center justify-start h-[30px] rounded-md border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx font-semibold text-xs px-3 transition-colors"
      >
        Abrir
      </button>
      {open && <TaskDetailModal taskId={item.id} onClose={() => setOpen(false)} />}
    </div>
  );
}
