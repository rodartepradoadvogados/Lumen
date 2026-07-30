"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check } from "lucide-react";
import { getTaskDetail, updateTask, toggleTaskDone, TaskDetail } from "@/lib/actions/tasks";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import CommentBox from "@/components/CommentBox";
import { formatDate } from "@/components/ui";

// "Card do compromisso": mostra e permite editar uma tarefa/evento/audiência/perícia/prazo, com
// uma conversa em comentários dentro do próprio card (estilo Trello) — reaproveita o mesmo
// Comment/CommentBox já usado na aba Comentários do processo, só que ligado à tarefa (taskId) em
// vez de ao processo (caseId); @menções nos comentários seguem surgindo na Central de Alertas
// normalmente (ver lib/alerts.ts, MENCAO não distingue comentário de tarefa ou de processo).
// Aberto a partir da Central de Alertas (prazo vencido/delegação), da listagem de prazos
// atrasados do painel, ou da aba Atividades do processo (ver components/TaskActivityRow.tsx).
export default function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState("TAREFA");
  const [meetingType, setMeetingType] = useState("PRESENCIAL");

  useEffect(() => {
    let active = true;
    getTaskDetail(taskId).then((res) => {
      if (!active) return;
      if (res.task) {
        setTask(res.task);
        setType(res.task.type);
        setMeetingType(res.task.meetingType || "PRESENCIAL");
      }
      setUsers(res.users);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [taskId]);

  // Recarrega só os comentários (sem passar por "Carregando..." de novo) depois que
  // CommentBox salva um novo — ver onSubmitted abaixo.
  async function reloadComments() {
    const res = await getTaskDetail(taskId);
    if (res.task) setTask((prev) => (prev ? { ...prev, comments: res.task!.comments } : res.task));
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    await updateTask(taskId, {
      title: String(formData.get("title")),
      type: String(formData.get("type")),
      dueDate: String(formData.get("dueDate")),
      dueTime: String(formData.get("dueTime") || ""),
      priority: String(formData.get("priority")),
      responsibleId: String(formData.get("responsibleId") || ""),
      description: String(formData.get("description") || ""),
      meetingType: String(formData.get("meetingType") || ""),
      location: String(formData.get("location") || ""),
      meetingUrl: String(formData.get("meetingUrl") || ""),
      strategy: String(formData.get("strategy") || ""),
    });
    setSaving(false);
    router.refresh();
    onClose();
  }

  async function handleToggleDone() {
    setSaving(true);
    await toggleTaskDone(taskId);
    setSaving(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
          <h3 className="font-serif font-bold text-navy-900">Compromisso</h3>
          <button onClick={onClose} className="text-navy-800/40 hover:text-navy-900">
            <X size={18} />
          </button>
        </div>

        {loading || !task ? (
          <div className="p-5 text-sm text-navy-800/50">Carregando...</div>
        ) : (
          <form action={handleSubmit} className="p-5 space-y-3">
            {task.case && (
              <Link href={`/processos/${task.case.id}`} className="text-xs font-semibold text-gold-700 hover:underline block">
                {task.case.processNumber || task.case.title}
              </Link>
            )}
            <div>
              <label className="text-xs font-medium text-navy-800/60">Título</label>
              <input name="title" defaultValue={task.title} required className="input" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <select name="priority" className="input" defaultValue={task.priority}>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Data</label>
                <input type="date" name="dueDate" required defaultValue={task.dueDate.slice(0, 10)} className="input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Hora (opcional)</label>
                <input type="time" name="dueTime" defaultValue={task.dueTime || ""} className="input" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-navy-800/60">Responsável</label>
              <select name="responsibleId" className="input" defaultValue={task.responsibleId || ""}>
                <option value="">Não definido</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {(type === "EVENTO" || type === "AUDIENCIA") && (
              <div className="rounded-lg border border-gold-500/25 bg-gold-500/5 p-3 space-y-3">
                <p className="text-xs font-semibold text-gold-800 uppercase tracking-wide">
                  {type === "AUDIENCIA" ? "Local da Audiência (opcional)" : "Reunião"}
                </p>
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
                    <label className="text-xs font-medium text-navy-800/60">Endereço (opcional)</label>
                    <input name="location" defaultValue={task.location || ""} className="input" placeholder="Ex: Rua X, nº 123, Sala 4 - Goiânia/GO" />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">
                      {type === "AUDIENCIA" ? "Link da audiência (opcional)" : "Link da reunião (opcional)"}
                    </label>
                    <input name="meetingUrl" type="url" defaultValue={task.meetingUrl || ""} className="input" placeholder="https://meet.google.com/..." />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-navy-800/60">Descrição (opcional)</label>
              <textarea name="description" rows={2} defaultValue={task.description || ""} className="input" />
            </div>

            {type === "AUDIENCIA" && (
              <div>
                <label className="text-xs font-medium text-navy-800/60">Estratégia (opcional)</label>
                <textarea
                  name="strategy"
                  rows={2}
                  defaultValue={task.strategy || ""}
                  className="input"
                  placeholder="Teses, pontos de atenção, preparo para a audiência..."
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                onClick={handleToggleDone}
                disabled={saving}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2.5 rounded-lg disabled:opacity-50"
              >
                <Check size={14} /> {task.status === "CONCLUIDO" ? "Reabrir" : "Marcar como concluída"}
              </button>
              <DeleteEntityButton
                entityType="TASK"
                entityId={task.id}
                entityLabel={task.title}
                confirmMessage={`Excluir o compromisso "${task.title}"?`}
                onDone={(result) => {
                  if (!result.error && !result.pending) onClose();
                }}
              />
            </div>
          </form>
        )}

        {!loading && task && (
          <div className="px-5 pb-5 pt-1 border-t border-navy-800/8 space-y-3">
            <p className="text-xs font-semibold text-navy-800/50 uppercase tracking-wide">Conversa</p>
            {task.comments.length === 0 ? (
              <p className="text-sm text-navy-800/40">Nenhum comentário ainda.</p>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-thin">
                {task.comments.map((cm) => (
                  <div key={cm.id} className="flex gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {cm.authorName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold text-navy-900">{cm.authorName}</span>{" "}
                        <span className="text-[11px] text-navy-800/40">{formatDate(cm.createdAt)}</span>
                      </p>
                      <p className="text-sm text-navy-800/80 mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <CommentBox taskId={task.id} users={users} onSubmitted={reloadComments} />
          </div>
        )}
      </div>
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
    </div>
  );
}
