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
        done
          ? "bg-concluido border-concluido text-white"
          : "border-regua-forte text-transparent hover:border-concluido"
      } ${pending ? "opacity-50" : ""}`}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
