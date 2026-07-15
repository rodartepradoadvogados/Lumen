"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAttendanceStage } from "@/lib/actions/attendance";

export const stageOptions = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

export const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

const colors: Record<string, string> = {
  NOVO: "bg-amber-100 text-amber-700 border-amber-200",
  QUALIFICACAO: "bg-blue-100 text-blue-700 border-blue-200",
  PROPOSTA: "bg-gold-500/15 text-gold-800 border-gold-500/30",
  FECHADO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PERDIDO: "bg-red-100 text-red-700 border-red-200",
};

export default function FunnelStageSelect({
  attendanceId,
  stage,
  className,
}: {
  attendanceId: string;
  stage: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    let lostReason: string | undefined;
    if (next === "PERDIDO") {
      const motivo = window.prompt("Motivo da perda (opcional):", "");
      if (motivo === null) {
        // usuário cancelou — reverte o select para o valor atual
        e.target.value = stage;
        return;
      }
      lostReason = motivo.trim() || undefined;
    }
    startTransition(async () => {
      await setAttendanceStage(attendanceId, next, lostReason);
      router.refresh();
    });
  }

  return (
    <select
      value={stage}
      disabled={pending}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50 ${colors[stage] || colors.NOVO} ${className || ""}`}
    >
      {stageOptions.map((o) => (
        <option key={o} value={o}>
          {stageLabels[o]}
        </option>
      ))}
    </select>
  );
}
