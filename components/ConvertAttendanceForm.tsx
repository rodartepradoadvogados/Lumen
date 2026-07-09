"use client";

import { useState, useTransition } from "react";
import { convertAttendanceToCase } from "@/lib/actions/attendance";

export default function ConvertAttendanceForm({ attendanceId }: { attendanceId: string }) {
  const [mode, setMode] = useState<"none" | "CASO" | "JUDICIAL">("none");
  const [pending, startTransition] = useTransition();

  function handleSubmitCaso() {
    startTransition(async () => {
      await convertAttendanceToCase(attendanceId, { type: "ATENDIMENTO" });
    });
  }

  function handleSubmitJudicial(formData: FormData) {
    startTransition(async () => {
      await convertAttendanceToCase(attendanceId, {
        type: "JUDICIAL",
        processNumber: String(formData.get("processNumber") || ""),
        court: String(formData.get("court") || ""),
      });
    });
  }

  if (mode === "none") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSubmitCaso}
          disabled={pending}
          className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {pending ? "Convertendo..." : "Transformar em Caso"}
        </button>
        <button
          onClick={() => setMode("JUDICIAL")}
          className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Transformar em Processo Judicial
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmitJudicial} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-navy-800/60">Número do processo</label>
          <input name="processNumber" required className="cvt-input" placeholder="0000000-00.2026.8.09.0051" />
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60">Vara/Comarca</label>
          <input name="court" className="cvt-input" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
          {pending ? "Convertendo..." : "Confirmar Processo Judicial"}
        </button>
        <button type="button" onClick={() => setMode("none")} className="px-3 text-xs font-semibold text-navy-800/50 hover:text-navy-900">
          Cancelar
        </button>
      </div>
      <style jsx global>{`
        .cvt-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cvt-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </form>
  );
}
