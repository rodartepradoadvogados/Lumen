"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string };

export default function NewTaskModal({
  cases,
  users,
  columns,
  defaultDate,
  defaultColumnId,
  defaultCaseId,
  defaultAttendanceId,
  label,
}: {
  cases: Option[];
  users: Option[];
  columns: Option[];
  defaultDate?: string;
  defaultColumnId?: string;
  defaultCaseId?: string;
  defaultAttendanceId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("TAREFA");
  const [meetingType, setMeetingType] = useState("PRESENCIAL");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    await createTask({
      title: String(formData.get("title")),
      type: String(formData.get("type")),
      dueDate: String(formData.get("dueDate")),
      dueTime: String(formData.get("dueTime") || ""),
      priority: String(formData.get("priority")),
      caseId: String(formData.get("caseId") || ""),
      attendanceId: defaultAttendanceId,
      responsibleId: String(formData.get("responsibleId") || ""),
      columnId: String(formData.get("columnId") || ""),
      description: String(formData.get("description") || ""),
      meetingType: String(formData.get("meetingType") || ""),
      location: String(formData.get("location") || ""),
      meetingUrl: String(formData.get("meetingUrl") || ""),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {label ?? "Nova Tarefa"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Nova Tarefa / Evento / Prazo</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form action={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Título</label>
                <input name="title" required className="input" placeholder="Ex: Audiência de instrução" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Tipo</label>
                  <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="TAREFA">Tarefa</option>
                    <option value="EVENTO">Evento / Reunião</option>
                    <option value="AUDIENCIA">Audiência</option>
                    <option value="PERICIA">Perícia</option>
                    <option value="PRAZO">Prazo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Prioridade</label>
                  <select name="priority" className="input" defaultValue="MEDIA">
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Data</label>
                  <input type="date" name="dueDate" required defaultValue={defaultDate} className="input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Hora (opcional)</label>
                  <input type="time" name="dueTime" className="input" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-navy-800/60">Processo/Caso vinculado</label>
                <select name="caseId" className="input" defaultValue={defaultCaseId ?? ""}>
                  <option value="">Nenhum</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Responsável</label>
                  <select name="responsibleId" className="input">
                    <option value="">Não definido</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Coluna do Kanban</label>
                  <select name="columnId" className="input" defaultValue={defaultColumnId}>
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {type === "EVENTO" && (
                <div className="rounded-lg border border-gold-500/25 bg-gold-500/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-gold-800 uppercase tracking-wide">Reunião</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-sm text-navy-800">
                      <input
                        type="radio"
                        name="meetingType"
                        value="PRESENCIAL"
                        checked={meetingType === "PRESENCIAL"}
                        onChange={() => setMeetingType("PRESENCIAL")}
                      />
                      Presencial
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-navy-800">
                      <input
                        type="radio"
                        name="meetingType"
                        value="ONLINE"
                        checked={meetingType === "ONLINE"}
                        onChange={() => setMeetingType("ONLINE")}
                      />
                      Online
                    </label>
                  </div>
                  {meetingType === "PRESENCIAL" ? (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Endereço</label>
                      <input name="location" className="input" placeholder="Ex: Rua X, nº 123, Sala 4 - Goiânia/GO" />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Link da reunião</label>
                      <input name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/..." />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60">Descrição (opcional)</label>
                <textarea name="description" rows={2} className="input" />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Criar"}
              </button>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid rgba(15, 31, 61, 0.12);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #14213d;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
      `}</style>
    </>
  );
}
