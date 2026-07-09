"use client";

import { useState, useTransition } from "react";
import { convertAttendanceToCase } from "@/lib/actions/attendance";

export default function ConvertAttendanceForm({ attendanceId }: { attendanceId: string }) {
  const [type, setType] = useState("ATENDIMENTO");
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await convertAttendanceToCase(attendanceId, {
        type: String(formData.get("type")),
        processNumber: String(formData.get("processNumber") || ""),
        court: String(formData.get("court") || ""),
      });
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-navy-800/60">Tipo</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="cvt-input">
          <option value="ATENDIMENTO">Caso (extrajudicial / consultivo)</option>
          <option value="JUDICIAL">Processo Judicial</option>
          <option value="EXTRAJUDICIAL">Extrajudicial</option>
          <option value="CONSULTIVO">Consultivo</option>
        </select>
      </div>
      {type === "JUDICIAL" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60">Número do processo</label>
            <input name="processNumber" className="cvt-input" placeholder="0000000-00.2026.8.09.0051" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60">Vara/Comarca</label>
            <input name="court" className="cvt-input" />
          </div>
        </div>
      )}
      <button type="submit" disabled={pending} className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
        {pending ? "Convertendo..." : "Transformar"}
      </button>
      <style jsx global>{`
        .cvt-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cvt-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </form>
  );
}
