"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskResponsible } from "@/lib/actions/tasks";

type UserOption = { id: string; name: string };

// Faltava, no app mobile, qualquer jeito de definir/trocar o advogado responsável por uma
// tarefa já existente — só dava pra escolher na criação (MobileNewTaskForm, e olhe lá).
export default function MobileTaskResponsibleSelect({
  taskId,
  responsibleId,
  users,
}: {
  taskId: string;
  responsibleId: string | null;
  users: UserOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={responsibleId || ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setTaskResponsible(taskId, e.target.value);
          router.refresh();
        })
      }
      className="mt-1 text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2 py-1 disabled:opacity-50"
    >
      <option value="">Sem responsável</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
