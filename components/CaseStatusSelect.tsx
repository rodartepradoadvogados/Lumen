"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCaseStatus } from "@/lib/actions/cases";

const options = ["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"];

const colors: Record<string, string> = {
  ATIVO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  SUSPENSO: "bg-amber-100 text-amber-700 border-amber-200",
  ENCERRADO: "bg-slate-100 text-slate-600 border-slate-200",
  ARQUIVADO: "bg-red-100 text-red-700 border-red-200",
};

export default function CaseStatusSelect({ caseId, status }: { caseId: string; status: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <select
      value={status}
      onChange={(e) =>
        startTransition(async () => {
          await updateCaseStatus(caseId, e.target.value);
          router.refresh();
        })
      }
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${colors[status]}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
