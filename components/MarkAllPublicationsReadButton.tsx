"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllPublicationsRead, markAllPublicationsReadForCase } from "@/lib/actions/publications";

export default function MarkAllPublicationsReadButton({ count, caseId }: { count: number; caseId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(`Marcar todas as ${count} publicações não lidas como lidas?`)) return;
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
