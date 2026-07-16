"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { Check } from "lucide-react";

export default function MobileTaskToggle({ taskId, done }: { taskId: string; done: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleTaskDone(taskId);
          router.refresh();
        })
      }
      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
      className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
        done ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/25 text-transparent hover:border-emerald-500"
      } ${pending ? "opacity-50" : ""}`}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
