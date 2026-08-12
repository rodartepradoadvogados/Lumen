"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { updateAttendanceSubject } from "@/lib/actions/attendance";

// Edição inline do assunto do atendimento — mesmo espírito do "Editar" de ParecerFolderRow
// (sem modal, expande no lugar), só que aqui é o texto inteiro que vira input, não um form à
// parte, porque é o único campo editado.
export default function EditAttendanceSubject({ attendanceId, subject }: { attendanceId: string; subject: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(subject);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function salvar() {
    setError("");
    startTransition(async () => {
      const result = await updateAttendanceSubject(attendanceId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancelar() {
    setValue(subject);
    setError("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-sm text-tx-3 hover:text-tx group"
        title="Editar assunto"
      >
        {subject}
        <Pencil size={11} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") cancelar();
        }}
        disabled={pending}
        className="text-sm border border-regua rounded-lg px-2 py-1 bg-sf text-tx min-w-0 flex-1 max-w-sm"
      />
      <button type="button" onClick={salvar} disabled={pending} className="p-1 text-concluido hover:opacity-80 disabled:opacity-50" title="Salvar">
        <Check size={15} />
      </button>
      <button type="button" onClick={cancelar} disabled={pending} className="p-1 text-tx-3 hover:text-atencao disabled:opacity-50" title="Cancelar">
        <X size={15} />
      </button>
      {error && <span className="text-[11px] text-urgente">{error}</span>}
    </div>
  );
}
