"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { approveDeletion, rejectDeletion } from "@/lib/actions/deletion";

type Req = {
  id: string;
  entityType: string;
  entityLabel: string;
  createdAt: string;
  requestedBy: { name: string };
};

const entityLabels: Record<string, string> = { TASK: "Tarefa/Evento", CASE: "Processo/Caso", ATTENDANCE: "Atendimento" };

export default function DeletionRequestsPanel({ requests }: { requests: Req[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle(id: string, action: "approve" | "reject") {
    startTransition(async () => {
      if (action === "approve") await approveDeletion(id);
      else await rejectDeletion(id);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-navy-800/5">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-navy-800/40 uppercase tracking-wide">{entityLabels[r.entityType] ?? r.entityType}</p>
            <p className="text-sm font-medium text-navy-900 mt-0.5 truncate">{r.entityLabel}</p>
            <p className="text-xs text-navy-800/45 mt-0.5">Solicitado por {r.requestedBy.name}</p>
          </div>
          <button
            onClick={() => handle(r.id, "approve")}
            disabled={pending}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Check size={12} /> Aprovar
          </button>
          <button
            onClick={() => handle(r.id, "reject")}
            disabled={pending}
            className="flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-900 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
          >
            <X size={12} /> Recusar
          </button>
        </div>
      ))}
    </div>
  );
}
