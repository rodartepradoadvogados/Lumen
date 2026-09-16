"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceStatus } from "@/lib/actions/attendance";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";

const options = ["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"];

const colors: Record<string, string> = {
  NOVO: "bg-aviso-bg text-aviso border-aviso",
  EM_TRIAGEM: "bg-sf-apoio text-fonte-pje border-fonte-pje",
  CONVERTIDO: "bg-concluido-bg text-concluido border-concluido",
  ARQUIVADO: "bg-sf-apoio text-tx-2 border-regua",
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
          {attendanceStatusLabels[o] ?? o}
        </option>
      ))}
    </select>
  );
}
