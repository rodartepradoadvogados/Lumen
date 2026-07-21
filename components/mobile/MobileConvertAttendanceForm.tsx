"use client";

import { useState, useTransition } from "react";
import { convertAttendanceToCase } from "@/lib/actions/attendance";

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

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
          className="w-full bg-navy-900 hover:bg-navy-800 dark:bg-cream-50/10 dark:hover:bg-cream-50/15 text-white dark:text-cream-50 text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? "Convertendo..." : "Transformar em Caso"}
        </button>
        <button
          onClick={() => setMode("JUDICIAL")}
          disabled={pending}
          className="w-full bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
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
          className="flex-1 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors"
        >
          {pending ? "Convertendo..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setMode("none")}
          className="px-4 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
