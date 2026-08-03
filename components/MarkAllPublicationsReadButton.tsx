"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllPublicationsRead, markAllPublicationsReadForCase } from "@/lib/actions/publications";

export default function MarkAllPublicationsReadButton({ count, caseId }: { count: number; caseId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    // "count" agora é número de GRUPOS (por processo) pendentes, não de linhas — a ação por trás
    // (markAllPublicationsRead/markAllPublicationsReadForCase) continua marcando toda publicação
    // não lida, inclusive as demais fontes agrupadas dentro de cada card (ver
    // lib/publicationGrouping.ts) — só a mensagem de confirmação fala em "pendência" em vez de
    // "publicação" pra não subestimar o que será marcado.
    if (!window.confirm(`Marcar todas as ${count} pendência(s) não lida(s) como lida(s)?`)) return;
    startTransition(async () => {
      if (caseId) await markAllPublicationsReadForCase(caseId);
      else await markAllPublicationsRead();
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-1.5 text-xs font-semibold text-navy-800/70 hover:text-navy-900 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 disabled:opacity-50"
    >
      <CheckCheck size={14} /> {pending ? "Marcando..." : "Marcar todas como lidas"}
    </button>
  );
}
