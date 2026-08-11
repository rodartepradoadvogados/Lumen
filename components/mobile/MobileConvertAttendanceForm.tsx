"use client";

import { useState, useTransition } from "react";
import { convertAttendanceToCase } from "@/lib/actions/attendance";

const inputClass =
  "w-full mt-1 border border-regua rounded-lg px-3 py-2 text-sm text-tx bg-sf focus:outline-none focus:ring-2 focus:ring-acao/40";
const labelClass = "text-xs font-medium text-tx-2";

// Versão mobile do conversor de atendimento em Caso/Processo Judicial. Reaproveita a mesma
// server action do desktop (convertAttendanceToCase), mas informa "/m/processos" como base de
// redirecionamento — o app mobile nunca pode navegar para uma rota do site desktop.
export default function MobileConvertAttendanceForm({ attendanceId }: { attendanceId: string }) {
  const [mode, setMode] = useState<"none" | "JUDICIAL">("none");
  const [pending, startTransition] = useTransition();

  function handleCaso() {
    startTransition(async () => {
      await convertAttendanceToCase(attendanceId, { type: "ATENDIMENTO" }, "/m/processos");
    });
  }

  function handleJudicial(formData: FormData) {
    startTransition(async () => {
      await convertAttendanceToCase(
        attendanceId,
        {
          type: "JUDICIAL",
          processNumber: String(formData.get("processNumber") || ""),
          court: String(formData.get("court") || ""),
        },
        "/m/processos"
      );
    });
  }

  if (mode === "none") {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={handleCaso}
          disabled={pending}
          className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? "Convertendo..." : "Transformar em Caso"}
        </button>
        <button
          onClick={() => setMode("JUDICIAL")}
          disabled={pending}
          className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          Transformar em Processo Judicial
        </button>
      </div>
    );
  }

  return (
    <form action={handleJudicial} className="space-y-3">
      <div>
        <label className={labelClass}>Número do processo</label>
        <input name="processNumber" required className={inputClass} placeholder="0000000-00.2026.8.09.0051" />
      </div>
      <div>
        <label className={labelClass}>Vara/Comarca</label>
        <input name="court" className={inputClass} />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? "Convertendo..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setMode("none")}
          className="px-4 text-xs font-semibold text-tx-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
