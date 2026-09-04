"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Undo2, X } from "lucide-react";
import PendenciasEditor, { type PendenciaRow } from "@/components/PendenciasEditor";
import { pendenciaKindLabel, PENDENCIA_DIRECTION_LABELS } from "@/lib/pendencias";
import { classificarPrazo } from "@/lib/dueStatus";
import { formatRelativeDueDate } from "@/lib/formatRelativeDueDate";
import clsx from "clsx";
import {
  createAttendancePendencias,
  completeAttendancePendencia,
  reopenAttendancePendencia,
  deleteAttendancePendencia,
} from "@/lib/actions/attendancePendencias";

export type PendenciaData = {
  id: string;
  direction: string;
  kind: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  responsible: { name: string } | null;
};

export default function AttendancePendenciasPanel({
  attendanceId,
  users,
  pendencias,
}: {
  attendanceId: string;
  users: { id: string; name: string }[];
  pendencias: PendenciaData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newRows, setNewRows] = useState<PendenciaRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const abertas = pendencias.filter((p) => p.status === "PENDENTE");
  const concluidas = pendencias.filter((p) => p.status !== "PENDENTE");

  function handleComplete(id: string) {
    startTransition(async () => {
      await completeAttendancePendencia(id);
      router.refresh();
    });
  }
  function handleReopen(id: string) {
    startTransition(async () => {
      await reopenAttendancePendencia(id);
      router.refresh();
    });
  }
  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta pendência?")) return;
    setError("");
    startTransition(async () => {
      const result = await deleteAttendancePendencia(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function handleSaveNew() {
    if (newRows.length === 0) {
      setAdding(false);
      return;
    }
    setSaving(true);
    await createAttendancePendencias(
      attendanceId,
      newRows.map((r) => ({
        direction: r.direction,
        kind: r.kind,
        description: r.description.trim() || undefined,
        responsibleId: r.responsibleId || undefined,
        dueDate: r.dueDate || undefined,
      }))
    );
    setSaving(false);
    setAdding(false);
    setNewRows([]);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-urgente">{error}</p>}
      {abertas.length === 0 && !adding && <p className="text-sm text-tx-2">Nenhuma pendência em aberto.</p>}

      {abertas.length > 0 && (
        <div className="space-y-2 stagger-in">
          {abertas.map((p) => {
            // Urgência de prazo (proposta "Movimento & Prazos") — antes comparava dueDate contra
            // a hora cheia (mesmo bug de "vencimento hoje conta como atrasado" já corrigido em
            // Kanban/Agenda). classificarPrazo já normaliza isso.
            const urgencia = p.dueDate ? classificarPrazo(p.dueDate) : "a-vencer";
            return (
              <div
                key={p.id}
                className={clsx(
                  "flex items-start justify-between gap-3 border rounded-md px-3 py-2",
                  urgencia === "vencida"
                    ? "border-urgente/40 bg-urgente-bg motion-safe:animate-attention-pulse"
                    : urgencia === "vencendo"
                      ? "border-aviso/40 bg-aviso-bg"
                      : "border-regua bg-sf-apoio"
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-tx-2 mr-1.5">
                      {PENDENCIA_DIRECTION_LABELS[p.direction as "SOLICITAR" | "ENVIAR"] || p.direction}
                    </span>
                    {pendenciaKindLabel(p.direction, p.kind)}
                  </p>
                  {p.description && <p className="text-xs text-tx-2">{p.description}</p>}
                  <p className="text-[11px] text-tx-3 mt-0.5">
                    {p.responsible?.name ? `${p.responsible.name} · ` : ""}
                    {p.dueDate ? (urgencia === "vencida" ? `Vencida ${formatRelativeDueDate(p.dueDate)}` : `Prazo: ${formatRelativeDueDate(p.dueDate)}`) : "Sem prazo"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleComplete(p.id)}
                    disabled={pending}
                    title="Concluir"
                    className="p-1.5 text-tx-3 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={pending}
                    title="Excluir"
                    className="p-1.5 text-tx-3 hover:text-atencao hover:bg-atencao/10 rounded-md"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {concluidas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-tx-2">
            {concluidas.length} concluída(s)
          </summary>
          <div className="mt-2 space-y-1.5">
            {concluidas.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-tx-2">
                <span className="line-through">
                  {PENDENCIA_DIRECTION_LABELS[p.direction as "SOLICITAR" | "ENVIAR"] || p.direction} · {pendenciaKindLabel(p.direction, p.kind)}
                </span>
                <button onClick={() => handleReopen(p.id)} disabled={pending} className="flex items-center gap-1 text-marca-tx hover:underline shrink-0">
                  <Undo2 size={11} /> Reabrir
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {adding ? (
        <div className="space-y-3 border-t border-regua pt-3">
          <PendenciasEditor rows={newRows} onChange={setNewRows} users={users} compact />
          <div className="flex gap-2">
            <button
              onClick={handleSaveNew}
              disabled={saving}
              className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar pendência(s)"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewRows([]);
              }}
              className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-2.5 py-1.5 hover:bg-sf-apoio"
        >
          <Plus size={13} /> Adicionar pendência
        </button>
      )}
    </div>
  );
}
