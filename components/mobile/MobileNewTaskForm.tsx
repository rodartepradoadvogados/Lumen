"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import { Plus, X } from "lucide-react";

export default function MobileNewTaskForm({
  caseId,
  defaultType = "TAREFA",
  defaultOpen = false,
  defaultResponsibleId,
  onCreated,
}: {
  // Opcional: quando ausente, cria um compromisso avulso (não vinculado a processo) —
  // usado no fluxo de criação rápida da agenda (/m/agenda?novo=1&tipo=...).
  caseId?: string;
  defaultType?: string;
  defaultOpen?: boolean;
  // Sem &lt;select&gt; de responsável neste formulário (versão enxuta do modal desktop) — os
  // chamadores passam o autor (viewer.id) como padrão implícito, senão o compromisso nascia sem
  // responsável e ficava fora do push "Agenda do dia" e do ranking de Produtividade (achado A57
  // da revisão gauntlet).
  defaultResponsibleId?: string;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState(defaultType);
  const [meetingType, setMeetingType] = useState("PRESENCIAL");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      await createTask({
        title: String(formData.get("title")),
        type: String(formData.get("type")),
        dueDate: String(formData.get("dueDate")),
        dueTime: String(formData.get("dueTime") || ""),
        priority: "MEDIA",
        caseId,
        responsibleId: defaultResponsibleId,
        description: String(formData.get("description") || ""),
        meetingType: String(formData.get("meetingType") || ""),
        location: String(formData.get("location") || ""),
        meetingUrl: String(formData.get("meetingUrl") || ""),
        strategy: String(formData.get("strategy") || ""),
      });
      setOpen(false);
      setType(defaultType);
      setMeetingType("PRESENCIAL");
      if (onCreated) {
        onCreated();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Agendar Compromisso
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-regua bg-sf-apoio p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-tx">Agendar Compromisso</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-tx-2"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>

      <form action={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-tx-2">Título</label>
          <input name="title" required className="mobile-input" placeholder="Ex: Audiência de instrução" />
        </div>

        <div>
          <label className="text-xs font-medium text-tx-2">Tipo</label>
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
            <label className="text-xs font-medium text-tx-2">Data</label>
            <input type="date" name="dueDate" required className="mobile-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Hora (opcional)</label>
            <input type="time" name="dueTime" className="mobile-input" />
          </div>
        </div>

        {(type === "EVENTO" || type === "AUDIENCIA") && (
          <div className="rounded-lg border border-regua bg-sf-apoio p-3 space-y-2.5">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-tx-2">
                <input
                  type="radio"
                  name="meetingType"
                  value="PRESENCIAL"
                  checked={meetingType === "PRESENCIAL"}
                  onChange={() => setMeetingType("PRESENCIAL")}
                />
                Presencial
              </label>
              <label className="flex items-center gap-1.5 text-sm text-tx-2">
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
                <label className="text-xs font-medium text-tx-2">Endereço (opcional)</label>
                <input name="location" className="mobile-input" placeholder="Ex: Rua X, nº 123 - Goiânia/GO" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-tx-2">
                  {type === "AUDIENCIA" ? "Link da audiência" : "Link da reunião"} (opcional)
                </label>
                <input name="meetingUrl" type="url" className="mobile-input" placeholder="https://meet.google.com/..." />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-tx-2">Descrição (opcional)</label>
          <textarea name="description" rows={2} className="mobile-input" />
        </div>

        {type === "AUDIENCIA" && (
          <div>
            <label className="text-xs font-medium text-tx-2">Estratégia (opcional)</label>
            <textarea name="strategy" rows={2} className="mobile-input" placeholder="Teses, pontos de atenção, preparo para a audiência..." />
          </div>
        )}

        {error && <p className="text-[11px] text-urgente bg-urgente-bg rounded-lg px-2.5 py-1.5">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar"}
        </button>
      </form>

      <style jsx global>{`
        .mobile-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background-color: var(--sf-superficie);
          color: var(--tx);
        }
        .mobile-input:focus {
          outline: none;
          border-color: var(--acao);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent);
        }
      `}</style>
    </div>
  );
}
