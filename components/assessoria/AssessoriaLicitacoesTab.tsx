"use client";

import { useState, useTransition } from "react";
import {
  addLicitacao,
  updateLicitacaoStatus,
  addLicitacaoTask,
  type getAssessoriaDetail,
} from "@/lib/actions/assessoria";
import { Badge, formatCurrency, formatCalendarDate } from "@/components/ui";
import { Plus } from "lucide-react";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type UserOption = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "EM_ANALISE", label: "Em análise", color: "slate" as const },
  { value: "PARTICIPANDO", label: "Participando", color: "amber" as const },
  { value: "VENCEDORA", label: "Vencedora", color: "green" as const },
  { value: "PERDIDA", label: "Perdida", color: "bordo" as const },
  { value: "CANCELADA", label: "Cancelada", color: "slate" as const },
];
const statusMeta = (status: string) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

export default function AssessoriaLicitacoesTab({ assessoria, users }: { assessoria: Assessoria; users: UserOption[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(assessoria.licitacoes[0]?.id || null);
  const [formOpen, setFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = assessoria.licitacoes.find((l) => l.id === selectedId) || null;

  function handleNewLicitacao(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addLicitacao(assessoria.id, {
        objeto: String(formData.get("objeto") || ""),
        orgao: String(formData.get("orgao") || ""),
        modalidade: String(formData.get("modalidade") || "") || undefined,
        dataAbertura: String(formData.get("dataAbertura") || "") || undefined,
        prazoFinal: String(formData.get("prazoFinal") || "") || undefined,
        valorEstimado: String(formData.get("valorEstimado") || "") || undefined,
        editalUrl: String(formData.get("editalUrl") || "") || undefined,
      });
      if (result.error) setError(result.error);
      else setFormOpen(false);
    });
  }

  function handleStatusChange(licitacaoId: string, status: string) {
    startTransition(async () => {
      await updateLicitacaoStatus(licitacaoId, status);
    });
  }

  function handleNewTask(formData: FormData) {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await addLicitacaoTask(selected.id, {
        title: String(formData.get("title") || ""),
        dueDate: String(formData.get("dueDate") || ""),
        dueTime: String(formData.get("dueTime") || "") || undefined,
        responsibleId: String(formData.get("responsibleId") || "") || undefined,
      });
      if (result.error) setError(result.error);
      else setTaskFormOpen(false);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-tx-2">
          {assessoria.licitacoes.length} licitaç{assessoria.licitacoes.length === 1 ? "ão" : "ões"}
        </p>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-acao hover:text-acao-hover px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Nova licitação
        </button>
      </div>

      {formOpen && (
        <form action={handleNewLicitacao} className="mb-4 p-4 rounded-lg border border-regua bg-sf-apoio space-y-3">
          <input name="objeto" required placeholder="Objeto (ex: Fornecimento de insumos)" className="lic-input" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="orgao" required placeholder="Órgão" className="lic-input" />
            <input name="modalidade" placeholder="Modalidade (ex: Pregão 045/2026)" className="lic-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-tx-2">Abertura</label>
              <input name="dataAbertura" type="date" className="lic-input" />
            </div>
            <div>
              <label className="text-[11px] text-tx-2">Prazo final</label>
              <input name="prazoFinal" type="date" className="lic-input" />
            </div>
            <div>
              <label className="text-[11px] text-tx-2">Valor estimado (R$)</label>
              <input name="valorEstimado" type="number" step="0.01" className="lic-input" />
            </div>
          </div>
          <input name="editalUrl" type="url" placeholder="Link do edital no Google Drive" className="lic-input" />
          {error && <p className="text-xs text-urgente">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Cadastrar"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="text-xs font-semibold text-tx-2">Cancelar</button>
          </div>
          <style>{`.lic-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.3125rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
        </form>
      )}

      {assessoria.licitacoes.length === 0 ? (
        <p className="text-sm text-tx-3 py-8 text-center">Nenhuma licitação cadastrada ainda.</p>
      ) : (
        <>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-tx-2 border-b border-regua">
                  <th className="pb-2 pr-3">Objeto / Órgão</th>
                  <th className="pb-2 pr-3">Modalidade</th>
                  <th className="pb-2 pr-3">Prazo final</th>
                  <th className="pb-2 pr-3">Valor estimado</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {assessoria.licitacoes.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={`cursor-pointer ${selectedId === l.id ? "bg-acao-bg" : "hover:bg-sf-apoio"}`}
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-tx">{l.objeto}</p>
                      <p className="text-xs text-tx-2">{l.orgao}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-tx-2">{l.modalidade || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{l.prazoFinal ? formatCalendarDate(l.prazoFinal) : "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{l.valorEstimado ? formatCurrency(l.valorEstimado) : "—"}</td>
                    <td className="py-2.5"><Badge color={statusMeta(l.status).color}>{statusMeta(l.status).label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2">
                {selected.modalidade || selected.objeto} — detalhe
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-sf rounded-lg border border-regua p-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Dados da licitação</h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-tx-2">Órgão</span><span className="text-tx">{selected.orgao}</span></div>
                    <div className="flex justify-between"><span className="text-tx-2">Modalidade</span><span className="text-tx">{selected.modalidade || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-tx-2">Valor estimado</span><span className="text-tx tabular-nums">{selected.valorEstimado ? formatCurrency(selected.valorEstimado) : "—"}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-tx-2">Edital</span>
                      {selected.editalUrl ? (
                        <a href={selected.editalUrl} target="_blank" rel="noopener noreferrer" className="text-acao hover:text-acao-hover font-semibold">↗ Abrir no Drive</a>
                      ) : (
                        <span className="text-tx-3">Não anexado</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-tx-2">Status</span>
                      <select
                        value={selected.status}
                        onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                        disabled={pending}
                        className="text-xs font-semibold border border-regua-forte bg-sf text-tx rounded-lg px-2 py-1"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-sf rounded-lg border border-regua p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Tarefas &amp; Prazos</h4>
                    <button onClick={() => setTaskFormOpen((v) => !v)} className="text-xs font-semibold text-acao hover:text-acao-hover">
                      + Nova tarefa
                    </button>
                  </div>

                  {taskFormOpen && (
                    <form action={handleNewTask} className="mb-3 p-3 rounded-lg bg-sf-apoio space-y-2">
                      <input name="title" required placeholder="Título da tarefa" className="lic-input" />
                      <div className="grid grid-cols-2 gap-2">
                        <input name="dueDate" type="date" required className="lic-input" />
                        <input name="dueTime" type="time" className="lic-input" />
                      </div>
                      <select name="responsibleId" defaultValue="" className="lic-input">
                        <option value="">Sem responsável</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
                          Adicionar
                        </button>
                        <button type="button" onClick={() => setTaskFormOpen(false)} className="text-xs font-semibold text-tx-2">Cancelar</button>
                      </div>
                    </form>
                  )}

                  {selected.tasks.length === 0 ? (
                    <p className="text-sm text-tx-3">Nenhuma tarefa cadastrada.</p>
                  ) : (
                    <div className="divide-y divide-regua">
                      {selected.tasks.map((t) => (
                        <div key={t.id} className="flex justify-between gap-3 py-2 text-sm">
                          <span className={t.status === "CONCLUIDO" ? "line-through text-tx-3" : "text-tx"}>{t.title}</span>
                          <span className="text-tx-2 whitespace-nowrap tabular-nums">
                            {formatCalendarDate(t.dueDate)}{t.responsible ? ` · ${t.responsible.name.split(" ")[0]}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
