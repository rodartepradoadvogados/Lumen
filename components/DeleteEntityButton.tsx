"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requestDeletion } from "@/lib/actions/deletion";

export default function DeleteEntityButton({
  entityType,
  entityId,
  entityLabel,
  confirmMessage,
  onDone,
}: {
  entityType: "TASK" | "CASE" | "ATTENDANCE" | "PAYABLE" | "RECEIVABLE";
  entityId: string;
  entityLabel: string;
  confirmMessage: string;
  onDone?: (result: { error?: string; pending?: boolean }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setMsg(null);
    startTransition(async () => {
      const result = await requestDeletion(entityType, entityId, entityLabel);
      if (result.error) {
        setMsg({ type: "error", text: result.error });
      } else if (result.pending) {
        setMsg({ type: "info", text: "Solicitação de exclusão enviada. Aguardando aprovação de Jairo ou Rodrigo." });
      }
      onDone?.(result);
      router.refresh();
    });
  }

  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleClick}
        disabled={pending}
        data-tip="Excluir"
        className="p-1.5 rounded-lg text-navy-800/30 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
      {msg && (
        <span
          className={`absolute right-0 top-full mt-1 z-10 w-64 text-[11px] rounded-lg px-2.5 py-1.5 shadow-pop border ${
            msg.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
          }`}
        >
          {msg.text}
        </span>
      )}
    </span>
  );
}
