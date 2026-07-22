"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskResponsible } from "@/lib/actions/tasks";

type UserOption = { id: string; name: string };

// Troca inline o responsável de uma tarefa, direto na lista de Atividades do Processo —
// antes só dava pra definir o responsável na criação (NewTaskModal); não havia como
// alterar depois sem editar a tarefa em outra tela.
export default function TaskResponsibleSelect({
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
      className="mt-0.5 text-xs text-navy-800/60 dark:text-cream-50/60 bg-transparent border-none p-0 focus:outline-none focus:underline cursor-pointer disabled:opacity-50"
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
