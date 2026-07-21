"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import { Plus, X } from "lucide-react";

export default function MobileNewTaskForm({
  caseId,
  defaultType = "TAREFA",
  defaultOpen = false,
  onCreated,
}: {
  // Opcional: quando ausente, cria um compromisso avulso (não vinculado a processo) —
  // usado no fluxo de criação rápida da agenda (/m/agenda?novo=1&tipo=...).
  caseId?: string;
  defaultType?: string;
  defaultOpen?: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(defaultType);
  const [meetingType, setMeetingType] = useState("PRESENCIAL");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    await createTask({
      title: String(formData.get("title")),
      type: String(formData.get("type")),
      dueDate: String(formData.get("dueDate")),
      dueTime: String(formData.get("dueTime") || ""),
      priority: "MEDIA",
      caseId,
      meetingType: String(formData.get("meetingType") || ""),
      location: String(formData.get("location") || ""),
      meetingUrl: String(formData.get("meetingUrl") || ""),
    });
    setLoading(false);
    setOpen(false);
    setType(defaultType);
    setMeetingType("PRESENCIAL");
    if (onCreated) {
      onCreated();
    } else {
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-navy-900 hover:bg-navy-800 dark:bg-gold-600 dark:hover:bg-gold-700 text-cream-50 text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Agendar Compromisso
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-100 dark:bg-white/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Agendar Compromisso</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-navy-800/40 dark:text-cream-50/40"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      <form action={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Título</label>
          <input name="title" required className="mobile-input" placeholder="Ex: Audiência de instrução" />
        </div>

        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo</label>
          <select name="type" className="mobile-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="TAREFA">Tarefa</option>
            <option value="EVENTO">Evento / Reunião</option>
            <option value="AUDIENCIA">Audiência</option>
            <option value="PERICIA">Perícia</option>
            <option value="PRAZO">Prazo</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Data</label>
            <input type="date" name="dueDate" required className="mobile-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Hora (opcional)</label>
            <input type="time" name="dueTime" className="mobile-input" />
          </div>
        </div>

        {(type === "EVENTO" || type === "AUDIENCIA") && (
          <div className="rounded-lg border border-gold-500/25 dark:border-gold-400/25 bg-gold-500/5 dark:bg-gold-400/5 p-3 space-y-2.5">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50/85">
                <input
                  type="radio"
                  name="meetingType"
                  value="PRESENCIAL"
                  checked={meetingType === "PRESENCIAL"}
                  onChange={() => setMeetingType("PRESENCIAL")}
                />
                Presencial
              </label>
              <label className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50/85">
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
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Endereço (opcional)</label>
                <input name="location" className="mobile-input" placeholder="Ex: Rua X, nº 123 - Goiânia/GO" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">
                  {type === "AUDIENCIA" ? "Link da audiência" : "Link da reunião"} (opcional)
                </label>
                <input name="meetingUrl" type="url" className="mobile-input" placeholder="https://meet.google.com/..." />
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar"}
        </button>
      </form>

      <style jsx global>{`
        .mobile-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid rgba(15, 31, 61, 0.12);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #14213d;
          background: white;
        }
        .mobile-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
        :global(html.dark) .mobile-input {
          border-color: rgba(255, 255, 255, 0.12);
          color: #fbfaf7;
          background: #0b1730;
        }
      `}</style>
    </div>
  );
}
