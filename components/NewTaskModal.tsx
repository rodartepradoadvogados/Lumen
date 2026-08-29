"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { createTask } from "@/lib/actions/tasks";
import { Plus } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { typeMeta } from "@/components/AgendaView";
import RichTextEditor from "@/components/RichTextEditor";

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
  tone = "secondary",
}: {
  cases: Option[];
  users: Option[];
  columns: Option[];
  defaultDate?: string;
  defaultColumnId?: string;
  defaultCaseId?: string;
  defaultAttendanceId?: string;
  label?: string;
  // "secondary" (padrão, DESIGN-SYSTEM.md §4: contorno neutro) em toda parte que reaproveita
  // este gatilho (Kanban, Processo, Atendimento) — "accent" (bordô cheio) só na Agenda, a
  // pedido explícito do dono do produto para "Nova Tarefa"/"Nova neste dia" nessa tela.
  tone?: "secondary" | "accent";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState("TAREFA");
  const [meetingType, setMeetingType] = useState("PRESENCIAL");
  const [description, setDescription] = useState("");

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
        description,
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
        onClick={() => {
          setDescription("");
          setOpen(true);
        }}
        className={clsx(
          "flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 transition-colors",
          tone === "accent"
            ? "bg-acao hover:bg-acao-hover text-acao-tx rounded-md"
            : "bg-sf border border-regua hover:bg-sf-apoio text-tx"
        )}
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
                    <label className="text-xs font-medium text-tx-2">Título</label>
                    <input name="title" required className="input" placeholder="Ex: Audiência de instrução" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">Tipo</label>
                      <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="TAREFA">Tarefa</option>
                        <option value="EVENTO">Evento / Reunião</option>
                        <option value="AUDIENCIA">Audiência</option>
                        <option value="PERICIA">Perícia</option>
                        <option value="PRAZO">Prazo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Prioridade</label>
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
                      <label className="text-xs font-medium text-tx-2">Data</label>
                      <input type="date" name="dueDate" required defaultValue={defaultDate} className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Hora (opcional)</label>
                      <input type="time" name="dueTime" className="input" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-tx-2">Processo/Caso vinculado</label>
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
                      <label className="text-xs font-medium text-tx-2">Responsável</label>
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
                      <label className="text-xs font-medium text-tx-2">Coluna do Kanban</label>
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
                    <label className="text-xs font-medium text-tx-2">Pontos (opcional)</label>
                    <input
                      type="number"
                      name="points"
                      min={0}
                      step={1}
                      className="input"
                      placeholder="Padrão do tipo de tarefa"
                    />
                    <p className="text-[11px] text-tx-3 mt-1">Deixe em branco para usar a pontuação padrão configurada para o tipo escolhido.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(type === "EVENTO" || type === "AUDIENCIA") && (
                    // Mesmo padrão das seções de formulário (DESIGN-SYSTEM.md §11): fundo de apoio
                    // + filete esquerdo de 3px na cor do tipo, em vez do fundo dourado cheio de antes.
                    <div className={`reuniao-panel border-l-[3px] ${(typeMeta[type] || typeMeta.EVENTO).filete} bg-sf-apoio p-3 space-y-3`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${type === "AUDIENCIA" ? "text-marca-tx" : "text-acao"}`}>
                        {type === "AUDIENCIA" ? "Local da Audiência (opcional)" : "Reunião"}
                      </p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-sm text-tx">
                          <input
                            type="radio"
                            name="meetingType"
                            value="PRESENCIAL"
                            checked={meetingType === "PRESENCIAL"}
                            onChange={() => setMeetingType("PRESENCIAL")}
                          />
                          Presencial
                        </label>
                        <label className="flex items-center gap-1.5 text-sm text-tx">
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
                          <input name="location" className="input" placeholder="Ex: Rua X, nº 123, Sala 4 - Goiânia/GO" />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-medium text-tx-2">{type === "AUDIENCIA" ? "Link da audiência (opcional)" : "Link da reunião (opcional)"}</label>
                          <input name="meetingUrl" type="url" className="input" placeholder="https://meet.google.com/..." />
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-tx-2">Descrição (opcional)</label>
                    <div className="mt-1">
                      <RichTextEditor value={description} onChange={setDescription} placeholder="Detalhes, orientações, checklist..." />
                    </div>
                  </div>

                  {type === "AUDIENCIA" && (
                    <div>
                      <label className="text-xs font-medium text-tx-2">Estratégia (opcional)</label>
                      <textarea name="strategy" rows={4} className="input" placeholder="Teses, pontos de atenção, preparo para a audiência..." />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-regua px-5 py-3 flex items-center justify-end gap-3 bg-sf-apoio">
              {error && <p className="text-[11px] text-urgente bg-urgente-bg rounded-md px-3 py-2 flex-1">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold px-5 py-2 transition-colors disabled:opacity-50"
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
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--tx);
          /* --sf-apoio, não --sf-superficie: o modal em si (ModalShell, bg-sf) já usa
             --sf-superficie — campo com o mesmo tom do fundo do modal é o que fazia os campos
             "sumirem" visualmente (DESIGN-SYSTEM.md, ajuste de contraste, agosto/2026). */
          background: var(--sf-apoio);
        }
        .input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--acao-bg);
        }
        /* Painel de reunião (.reuniao-panel) já é --sf-apoio — um campo também --sf-apoio dentro
           dele voltaria a "sumir" contra o próprio painel; aqui o campo recua um degrau para
           --sf-superficie em vez do padrão acima. */
        .reuniao-panel .input {
          background: var(--sf-superficie);
        }
      `}</style>
    </>
  );
}
