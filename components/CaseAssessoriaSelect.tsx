"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCaseAssessoria } from "@/lib/actions/assessoria";

type Option = { id: string; clientName: string };

export default function CaseAssessoriaSelect({
  caseId,
  assessoriaId,
  assessorias,
}: {
  caseId: string;
  assessoriaId: string | null;
  assessorias: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (assessorias.length === 0 && !assessoriaId) return null;

  return (
    <select
      value={assessoriaId || ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setCaseAssessoria(caseId, e.target.value || null);
          router.refresh();
        })
      }
      title="Vincular a uma assessoria"
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${
        assessoriaId
          ? "bg-gold-500/10 text-gold-800 border-gold-500/25 dark:bg-gold-400/10 dark:text-gold-400 dark:border-gold-400/25"
          : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-cream-50/60 dark:border-white/15"
      }`}
    >
      <option value="">Vincular a uma assessoria</option>
      {assessorias.map((a) => (
        <option key={a.id} value={a.id}>
          {a.clientName}
        </option>
      ))}
    </select>
  );
}
