"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle, X } from "lucide-react";
import { getPendingPublicationsForDistribution, submitPublicationDistribution, type DistributionRow } from "@/lib/actions/publications";
import ProcessNumberChip from "@/components/ProcessNumberChip";

type UserOption = { id: string; name: string };
type RowState = { userIds: string[]; dueDate: string; requireConfirmation: boolean };

export default function DistributePublicationsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DistributionRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError("");
    const result = await getPendingPublicationsForDistribution();
    setLoading(false);
    if (result.error || !result.rows) {
      setError(result.error || "Erro ao carregar publicações pendentes.");
      return;
    }
    setRows(result.rows);
    setUsers(result.users || []);
    const initial: Record<string, RowState> = {};
    for (const r of result.rows) {
      initial[r.id] = { userIds: r.suggestedUserId ? [r.suggestedUserId] : [], dueDate: "", requireConfirmation: false };
    }
    setRowState(initial);
  }

  function toggleUser(rowId: string, userId: string) {
    setRowState((s) => {
      const current = s[rowId]?.userIds ?? [];
      const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
      return { ...s, [rowId]: { ...s[rowId], userIds: next } };
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    const items = rows.map((r) => ({
      publicationId: r.id,
      userIds: rowState[r.id]?.userIds ?? [],
      dueDate: rowState[r.id]?.dueDate ?? "",
      requireConfirmation: rowState[r.id]?.requireConfirmation ?? false,
    }));
    const result = await submitPublicationDistribution(items);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const readyCount = rows.filter((r) => (rowState[r.id]?.userIds.length ?? 0) > 0 && rowState[r.id]?.dueDate).length;

  return (
    <div>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Shuffle size={15} /> Distribuir pendentes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl2 shadow-pop w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <div>
                <h2 className="font-serif font-bold text-lg text-navy-900 dark:text-cream-50">Distribuir publicações pendentes</h2>
                <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">
                  Revise cada uma, escolha o(s) advogado(s) responsável(is), o prazo e se precisa de confirmação antes de distribuir.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-navy-800/40 dark:text-cream-50/40 hover:bg-cream-100 dark:hover:bg-white/10 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loading ? (
                <p className="text-sm text-navy-800/50 dark:text-cream-50/50 p-6 text-center">Carregando publicações pendentes...</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-navy-800/50 dark:text-cream-50/50 p-6 text-center">
                  {error || "Nenhuma publicação pendente sem responsável no momento."}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-cream-50 dark:bg-navy-800 z-10">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">
                      <th className="px-4 py-2.5 font-semibold w-[42%]">Processo / do que se trata</th>
                      <th className="px-4 py-2.5 font-semibold">Advogado(s)</th>
                      <th className="px-4 py-2.5 font-semibold">Prazo</th>
                      <th className="px-4 py-2.5 font-semibold text-center">Confirmação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
                    {rows.map((r) => {
                      const state = rowState[r.id] ?? { userIds: [], dueDate: "", requireConfirmation: false };
                      const selectedNames = users.filter((u) => state.userIds.includes(u.id)).map((u) => u.name);
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="px-4 py-3">
                            {r.processNumber && <ProcessNumberChip processNumber={r.processNumber} />}
                            <p className="text-sm font-medium text-navy-900 dark:text-cream-50 mt-1">{r.title}</p>
                            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5 line-clamp-2">{r.content}</p>
                          </td>
                          <td className="px-4 py-3">
                            <details className="group">
                              <summary className="cursor-pointer list-none text-xs border border-navy-800/12 dark:border-white/15 rounded-lg px-2.5 py-1.5 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50 min-h-[32px] [&::-webkit-details-marker]:hidden">
                                {selectedNames.length > 0 ? selectedNames.join(", ") : "Selecionar advogado(s)"}
                              </summary>
                              <div className="relative">
                                <div className="absolute z-20 mt-1 w-56 max-h-52 overflow-y-auto scrollbar-thin bg-white dark:bg-navy-800 border border-navy-800/12 dark:border-white/15 rounded-lg shadow-pop">
                                  {users.length === 0 && (
                                    <p className="text-xs text-navy-800/45 dark:text-cream-50/45 px-2.5 py-2">Nenhum advogado/sócio ativo.</p>
                                  )}
                                  {users.map((u) => (
                                    <label
                                      key={u.id}
                                      className="flex items-center gap-2 text-xs px-2.5 py-1.5 hover:bg-cream-100 dark:hover:bg-white/5 text-navy-900 dark:text-cream-50 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={state.userIds.includes(u.id)}
                                        onChange={() => toggleUser(r.id, u.id)}
                                        className="h-3.5 w-3.5 accent-gold-600"
                                      />
                                      {u.name}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </details>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={state.dueDate}
                              onChange={(e) => setRowState((s) => ({ ...s, [r.id]: { ...s[r.id], dueDate: e.target.value } }))}
                              className="text-xs border border-navy-800/12 dark:border-white/15 rounded-lg px-2 py-1.5 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={state.requireConfirmation}
                              onChange={(e) =>
                                setRowState((s) => ({ ...s, [r.id]: { ...s[r.id], requireConfirmation: e.target.checked } }))
                              }
                              className="h-4 w-4 accent-gold-600"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {error && rows.length > 0 && <p className="text-xs font-medium text-bordo-600 dark:text-bordo-400 px-5 pt-2 shrink-0">{error}</p>}

            <div className="flex items-center justify-between px-5 py-4 border-t border-navy-800/8 dark:border-white/10 shrink-0">
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50">
                {readyCount} de {rows.length} pronta(s) para distribuir
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting || readyCount === 0}
                className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50"
              >
                {submitting ? "Distribuindo..." : `Distribuir${readyCount > 0 ? ` (${readyCount})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
