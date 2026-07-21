"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceStatus } from "@/lib/actions/attendance";

const options = ["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"];

const labels: Record<string, string> = {
  NOVO: "Novo",
  EM_TRIAGEM: "Em Triagem",
  CONVERTIDO: "Convertido",
  ARQUIVADO: "Arquivado",
  RASCUNHO: "Rascunho",
};

const colors: Record<string, string> = {
  NOVO: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-400/15 dark:text-amber-400 dark:border-amber-400/20",
  EM_TRIAGEM: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-400/15 dark:text-blue-400 dark:border-blue-400/20",
  CONVERTIDO: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-400 dark:border-emerald-400/20",
  ARQUIVADO: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-cream-50/70 dark:border-white/10",
  RASCUNHO: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-cream-50/70 dark:border-white/10",
};

export default function MobileAttendanceStatusSelect({ attendanceId, status }: { attendanceId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Garante que o status atual sempre apareça como opção, mesmo se for um valor
  // (ex.: RASCUNHO) fora da lista normal de destino de mudança de status.
  const allOptions = options.includes(status) ? options : [status, ...options];

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateAttendanceStatus(attendanceId, e.target.value);
          router.refresh();
        })
      }
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50 ${colors[status] ?? colors.ARQUIVADO}`}
    >
      {allOptions.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? o.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
