"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceStatus } from "@/lib/actions/attendance";

const options = ["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"];

const colors: Record<string, string> = {
  NOVO: "bg-amber-100 text-amber-700 border-amber-200",
  EM_TRIAGEM: "bg-blue-100 text-blue-700 border-blue-200",
  CONVERTIDO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ARQUIVADO: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function AttendanceStatusSelect({ attendanceId, status }: { attendanceId: string; status: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <select
      value={status}
      onChange={(e) =>
        startTransition(async () => {
          await updateAttendanceStatus(attendanceId, e.target.value);
          router.refresh();
        })
      }
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${colors[status]}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
