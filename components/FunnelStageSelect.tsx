"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAttendanceStage } from "@/lib/actions/attendance";
import AttendanceLostReasonModal from "@/components/AttendanceLostReasonModal";
// stageOptions/stageLabels vivem em lib/funil.ts, não aqui: a página do Funil é Server Component
// e importar constante de um arquivo "use client" quebra em produção — ver lib/funil.ts.
import { stageOptions, stageLabels } from "@/lib/funil";

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
  // Motivo da perda passou a ser OBRIGATÓRIO (Fase 5) — em vez do antigo window.prompt opcional,
  // abre um modal com opções fechadas + "Outro" (ver AttendanceLostReasonModal.tsx). O <select>
  // continua mostrando o estágio ANTIGO enquanto o modal está aberto, só avança de verdade depois
  // de confirmado — não dá pra "escapar" do motivo fechando o prompt sem preencher nada.
  const [askingLostReason, setAskingLostReason] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === "PERDIDO") {
      setAskingLostReason(true);
      return;
    }
    startTransition(async () => {
      await setAttendanceStage(attendanceId, next);
      router.refresh();
    });
  }

  function confirmLostReason(reason: string) {
    setAskingLostReason(false);
    startTransition(async () => {
      await setAttendanceStage(attendanceId, "PERDIDO", reason);
      router.refresh();
    });
  }

  return (
    <>
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
      {askingLostReason && <AttendanceLostReasonModal onConfirm={confirmLostReason} onCancel={() => setAskingLostReason(false)} />}
    </>
  );
}
