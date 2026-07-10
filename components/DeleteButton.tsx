"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteButton({
  id,
  confirmMessage,
  action,
}: {
  id: string;
  confirmMessage: string;
  action: (id: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="relative">
      <button
        onClick={handleClick}
        disabled={pending}
        data-tip="Excluir"
        className="p-1.5 rounded-lg text-navy-800/30 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
      {error && (
        <span className="absolute right-0 top-full mt-1 z-10 w-64 text-[11px] bg-red-50 text-red-700 border border-red-200 rounded-lg px-2.5 py-1.5 shadow-pop">
          {error}
        </span>
      )}
    </span>
  );
}
