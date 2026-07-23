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
        setMsg({ type: "info", text: "Solicitação de exclusão enviada. Aguardando aprovação de um administrador." });
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
        className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10 transition-colors disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
      {msg && (
        <span
          className={`absolute right-0 top-full mt-1 z-10 w-64 text-[11px] rounded-lg px-2.5 py-1.5 shadow-pop border ${
            msg.type === "error"
              ? "bg-bordo-100 dark:bg-bordo-900/40 text-bordo-700 dark:text-bordo-400 border-bordo-100 dark:border-bordo-400/20"
              : "bg-blue-50 dark:bg-blue-400/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-400/20"
          }`}
        >
          {msg.text}
        </span>
      )}
    </span>
  );
}
