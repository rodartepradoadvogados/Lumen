"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import { Plus } from "lucide-react";
import ModalShell from "@/components/ModalShell";

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
  const [error, setError] = useState("");
  const [type, setType] = useState("TAREFA");
  const [meetingType, setMeetingType] = useState("PRESENCIAL");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    const pointsRaw = String(formData.get("points") || "").trim();
    try {
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
        strategy: String(formData.get("strategy") || ""),
        points: pointsRaw === "" ? undefined : Number(pointsRaw),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
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
        <ModalShell size="cheio" title="Nova Tarefa / Evento / Prazo" onClose={() => setOpen(false)}>
          <form action={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              {/* Duas colunas a partir de md — a janela agora tem 80% da tela de largura, então
                  os campos se distribuem lado a lado em vez de ficarem esticados de ponta a ponta. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Título</label>
                    <input name="title" required className="input" placeholder="Ex: Audiência de instrução" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo</label>
                      <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="TAREFA">Tarefa</option>
                        <option value="EVENTO">Evento / Reunião</option>
                        <option value="AUDIENCIA">Audiência</option>
                        <option value="PERICIA">Perícia</option>
                        <option value="PRAZO">Prazo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Prioridade</label>
                      <select name="priority" className="input" defaultValue="MEDIA">
                        <option value="BAIXA">Baixa</option>
                        <option value="MEDIA">Média</option>
                        <option value="ALTA">Alta</option>
                        <option value="URGENTE">Urgente</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Data</label>
                      <input type="date" name="dueDate" required defaultValue={defaultDate} className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Hora (opcional)</label>
                      <input type="time" name="dueTime" className="input" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Processo/Caso vinculado</label>
                    <select name="caseId" className="input" defaultValue={defaultCaseId ?? ""}>
                      <option value="">Nenhum</option>
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Responsável</label>
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
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Coluna do Kanban</label>
                      <select name="columnId" className="input" defaultValue={defaultColumnId}>
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Pontos (opcional)</label>
                    <input
                      type="number"
                      name="points"
                      min={0}
                      step={1}
                      className="input"
                      placeholder="Padrão do tipo de tarefa"
                    />
                    <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-1">Deixe em branco para usar a pontuação padrão configurada para o tipo escolhido.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(type === "EVENTO" || type === "AUDIENCIA") && (
                    <div className="rounded-lg border border-gold-500/25 bg-gold-500/5 p-3 space-y-3">
                      <p className="text-xs font-semibold text-gold-800 dark:text-gold-400 uppercase tracking-wide">
                        {type === "AUDIENCIA" ? "Local da Audiência (opcional)" : "Reunião"}
                      </p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50">
                          <input
                            type="radio"
                            name="meetingType"
                            value="PRESENCIAL"
                            checked={meetingType === "PRESENCIAL"}
                            onChange={() => setMeetingType("PRESENCIAL")}
                          />
                          Presencial
                        </label>
                        <label className="flex items-center gap-1.5 text-sm text-navy-800 dark:text-cream-50">
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
                          <input name="location" className="input" placeholder="Ex: Rua X, nº 123, Sala 4 - Goiânia/GO" />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">{type === "AUDIENCIA" ? "Link da audiência (opcional)" : "Link da reunião (opcional)"}</label>
                          <input name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/..." />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição (opcional)</label>
                    <textarea name="description" rows={type === "AUDIENCIA" ? 3 : 6} className="input" />
                  </div>

                  {type === "AUDIENCIA" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Estratégia (opcional)</label>
                      <textarea name="strategy" rows={4} className="input" placeholder="Teses, pontos de atenção, preparo para a audiência..." />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex items-center justify-end gap-3 bg-cream-50/60 dark:bg-white/5">
              {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2 flex-1">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="bg-bordo-700 hover:bg-bordo-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Criar"}
              </button>
            </div>
          </form>
        </ModalShell>
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
          background: #fff;
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(198, 160, 92, 0.4);
        }
        .dark .input {
          border-color: rgba(255, 255, 255, 0.15);
          background: #0f1f3d;
          color: #fbfaf7;
        }
      `}</style>
    </>
  );
}
