"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addLicitacao,
  updateLicitacaoStatus,
  addLicitacaoTask,
  type getAssessoriaDetail,
} from "@/lib/actions/assessoria";
import { Badge, EmptyState, formatCurrency, formatCalendarDate, formatDate } from "@/components/ui";
import { authorDisplayName } from "@/lib/authorDisplay";
import { Plus, Paperclip, ChevronDown, ChevronRight } from "lucide-react";
import MoneyInput from "@/components/MoneyInput";
import AttachmentList from "@/components/AttachmentList";
import CommentBox from "@/components/CommentBox";
import { EnviarDocumentosButton, HistoricoEnvios, type Envio } from "@/components/DocumentoEnvios";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";

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

// Formata um Attachment (Prisma) no shape que AttachmentList espera (createdAt como string ISO)
// — mesmo ajuste que app/(app)/processos/[id]/page.tsx faz para os anexos do Processo.
function toAttachmentData(a: { id: string; name: string; driveUrl: string; docType: string; createdAt: string | Date; uploadedBy: { name: string } | null }) {
  return {
    id: a.id,
    name: a.name,
    driveUrl: a.driveUrl,
    docType: a.docType,
    createdAt: new Date(a.createdAt).toISOString(),
    uploadedBy: a.uploadedBy ? { name: a.uploadedBy.name } : null,
  };
}

// Ordenação da tabela de licitações — critérios próprios (prazo/valor/objeto), diferente do
// SORT_OPTIONS de lib/attachmentControls.ts (feito para listas de documento, com data de envio e
// tipo de documento, que não existem aqui).
type LicitacaoSort = "recente" | "prazo_asc" | "prazo_desc" | "valor_desc" | "valor_asc" | "nome_asc";
const LICITACAO_SORT_OPTIONS: { value: LicitacaoSort; label: string }[] = [
  { value: "recente", label: "Mais recente primeiro" },
  { value: "prazo_asc", label: "Prazo mais próximo" },
  { value: "prazo_desc", label: "Prazo mais distante" },
  { value: "valor_desc", label: "Maior valor estimado" },
  { value: "valor_asc", label: "Menor valor estimado" },
  { value: "nome_asc", label: "Nome (A→Z)" },
];

export default function AssessoriaLicitacoesTab({
  assessoria,
  users,
  driveConnected,
  storageMessage,
  viewerOfficeId,
}: {
  assessoria: Assessoria;
  users: UserOption[];
  driveConnected: boolean;
  storageMessage?: string;
  viewerOfficeId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(assessoria.licitacoes[0]?.id || null);
  const [formOpen, setFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [tableSort, setTableSort] = useState<LicitacaoSort>("recente");

  const selected = assessoria.licitacoes.find((l) => l.id === selectedId) || null;

  // `assessoria.licitacoes` já vem do servidor ordenada por createdAt desc (ver
  // getAssessoriaDetail) — "Mais recente primeiro" simplesmente não reordena.
  const licitacoesExibidas = useMemo(() => {
    const base = statusFilter === "TODOS" ? assessoria.licitacoes : assessoria.licitacoes.filter((l) => l.status === statusFilter);
    if (tableSort === "recente") return base;
    const arr = [...base];
    switch (tableSort) {
      case "prazo_asc":
      case "prazo_desc":
        arr.sort((a, b) => {
          if (!a.prazoFinal && !b.prazoFinal) return 0;
          if (!a.prazoFinal) return 1;
          if (!b.prazoFinal) return -1;
          const diff = new Date(a.prazoFinal).getTime() - new Date(b.prazoFinal).getTime();
          return tableSort === "prazo_asc" ? diff : -diff;
        });
        break;
      case "valor_desc":
        arr.sort((a, b) => (b.valorEstimado ?? -Infinity) - (a.valorEstimado ?? -Infinity));
        break;
      case "valor_asc":
        arr.sort((a, b) => (a.valorEstimado ?? Infinity) - (b.valorEstimado ?? Infinity));
        break;
      case "nome_asc":
        arr.sort((a, b) => (a.nome || a.objeto).localeCompare(b.nome || b.objeto, "pt-BR", { numeric: true }));
        break;
    }
    return arr;
  }, [assessoria.licitacoes, statusFilter, tableSort]);

  // Anexos GERAIS da licitação selecionada (sem taskId — os de uma demanda específica aparecem só
  // dentro dela, ver selected.tasks[].attachments abaixo), no formato que AttachmentList espera
  // (createdAt como string ISO) — mesmo ajuste que app/(app)/processos/[id]/page.tsx faz para os
  // anexos do Processo.
  const selectedAttachments = useMemo(
    () =>
      (selected?.attachments ?? [])
        .filter((a) => !a.taskId)
        .map((a) => toAttachmentData(a)),
    [selected]
  );

  const selectedAttachmentOptions = useMemo(
    () => (selected?.attachments ?? []).map((a) => ({ id: a.id, name: a.name, docType: a.docType, driveUrl: a.driveUrl })),
    [selected]
  );

  const selectedEnvios: Envio[] = useMemo(
    () =>
      (selected?.documentoEnvios ?? []).map((e) => ({
        id: e.id,
        metodo: e.metodo,
        destinatarioNome: e.destinatarioNome,
        destinatarioContato: e.destinatarioContato,
        enviadoEm: new Date(e.enviadoEm).toISOString(),
        enviadoPor: e.enviadoPor ? { name: e.enviadoPor.name } : null,
        itens: e.itens.map((i) => ({
          id: i.id,
          attachmentId: i.attachmentId,
          assessoriaDocumentoId: i.assessoriaDocumentoId,
          nomeSnapshot: i.nomeSnapshot,
          docTypeSnapshot: i.docTypeSnapshot,
        })),
      })),
    [selected]
  );

  function handleNewLicitacao(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addLicitacao(assessoria.id, {
        nome: String(formData.get("nome") || ""),
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
          className="flex items-center gap-1.5 text-sm font-semibold text-acao hover:text-acao-hover px-3 py-1.5 "
        >
          <Plus size={14} /> Nova licitação
        </button>
      </div>

      {formOpen && (
        <form action={handleNewLicitacao} className="mb-4 p-4 border border-regua bg-sf-apoio space-y-3">
          <div>
            <label className="text-[11px] text-tx-2">Nome da licitação</label>
            <input name="nome" required placeholder="Ex: Pregão 014/2026 — Locação de Veículos" className="lic-input" />
            <p className="text-[10.5px] text-tx-3 mt-0.5">
              Nome curto para gestão — aparece na lista e vira o nome da pasta no Drive. O objeto completo do edital
              continua abaixo.
            </p>
          </div>
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
              <MoneyInput name="valorEstimado" className="lic-input" />
            </div>
          </div>
          <input name="editalUrl" type="url" placeholder="Link do edital no Google Drive" className="lic-input" />
          {error && <p className="text-xs text-urgente">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 disabled:opacity-50">
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
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="flex items-center gap-1.5 text-[11px] text-tx-2">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-[11px] border border-regua bg-sf text-tx px-1.5 py-1"
              >
                <option value="TODOS">Todos</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-tx-2">
              Ordenar
              <select
                value={tableSort}
                onChange={(e) => setTableSort(e.target.value as LicitacaoSort)}
                className="text-[11px] border border-regua bg-sf text-tx px-1.5 py-1"
              >
                {LICITACAO_SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-tx-2 border-b border-regua">
                  <th className="pb-2 pr-3">Licitação</th>
                  <th className="pb-2 pr-3">Modalidade</th>
                  <th className="pb-2 pr-3">Prazo final</th>
                  <th className="pb-2 pr-3">Valor estimado</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {licitacoesExibidas.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={`cursor-pointer ${selectedId === l.id ? "bg-acao-bg" : "hover:bg-sf-apoio"}`}
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-tx">{l.nome || l.objeto}</p>
                      <p className="text-xs text-tx-2">{l.orgao}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-tx-2">{l.modalidade || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{l.prazoFinal ? formatCalendarDate(l.prazoFinal) : "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{l.valorEstimado ? formatCurrency(l.valorEstimado) : "—"}</td>
                    <td className="py-2.5"><Badge color={statusMeta(l.status).color}>{statusMeta(l.status).label}</Badge></td>
                  </tr>
                ))}
                {licitacoesExibidas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-tx-3">Nenhuma licitação com esse filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2">
                {selected.nome || selected.objeto} — detalhe
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-sf border border-regua p-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Dados da licitação</h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-tx-2 shrink-0">Objeto</span><span className="text-tx text-right">{selected.objeto}</span></div>
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
                        className="text-xs font-semibold border border-regua-forte bg-sf text-tx px-2 py-1"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-sf border border-regua p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Tarefas &amp; Prazos</h4>
                    <button onClick={() => setTaskFormOpen((v) => !v)} className="text-xs font-semibold text-acao hover:text-acao-hover">
                      + Nova tarefa
                    </button>
                  </div>

                  {taskFormOpen && (
                    <form action={handleNewTask} className="mb-3 p-3 bg-sf-apoio space-y-2">
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
                        <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
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
                      {selected.tasks.map((t) => {
                        const expanded = expandedTaskId === t.id;
                        const taskAttachments = (t.attachments ?? []).map((a) => toAttachmentData(a));
                        return (
                          <div key={t.id} className="py-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className={t.status === "CONCLUIDO" ? "line-through text-tx-3" : "text-tx"}>{t.title}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-tx-2 whitespace-nowrap tabular-nums">
                                  {formatCalendarDate(t.dueDate)}{t.responsible ? ` · ${t.responsible.name.split(" ")[0]}` : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedTaskId(expanded ? null : t.id)}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-acao px-1.5 py-0.5"
                                  title="Documentos desta demanda"
                                >
                                  <Paperclip size={11} />
                                  {taskAttachments.length > 0 && <span className="tabular-nums">{taskAttachments.length}</span>}
                                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>
                              </div>
                            </div>
                            {expanded && (
                              <div className="mt-2 ml-1 pl-3 border-l-2 border-regua">
                                <p className="text-[10.5px] font-bold uppercase tracking-wide text-tx-3 mb-1.5">Documentos desta demanda</p>
                                <AttachmentList
                                  attachments={taskAttachments}
                                  licitacaoId={selected.id}
                                  taskId={t.id}
                                  driveConnected={driveConnected}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-sf border border-regua p-4 mb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Documentos</h4>
                  <EnviarDocumentosButton
                    entity={{ tipo: "LICITACAO", id: selected.id, titulo: selected.nome || selected.objeto }}
                    attachments={selectedAttachmentOptions}
                  />
                </div>
                {!driveConnected && (
                  <div className="mb-2">
                    <StorageDisconnectedNotice message={storageMessage} />
                  </div>
                )}
                <AttachmentList
                  attachments={selectedAttachments}
                  licitacaoId={selected.id}
                  driveConnected={driveConnected}
                />
                <HistoricoEnvios
                  entity={{ tipo: "LICITACAO", id: selected.id, titulo: selected.nome || selected.objeto }}
                  envios={selectedEnvios}
                />
              </div>

              <div className="bg-sf border border-regua p-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Anotações</h4>
                <div className="space-y-4 mb-3 max-h-[360px] overflow-y-auto scrollbar-thin">
                  {selected.comments.length === 0 && (
                    <EmptyState title="Nenhuma anotação ainda" subtitle="Use @ para mencionar alguém da equipe" />
                  )}
                  {selected.comments.map((cm) => {
                    const authorName = authorDisplayName(cm.author, viewerOfficeId);
                    return (
                      <div key={cm.id} className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-grafite-700 text-ouro-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                          {authorName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <p className="text-sm">
                            <span className="font-semibold text-tx">{authorName}</span>{" "}
                            <span className="text-[11px] text-tx-2">{formatDate(cm.createdAt)}</span>
                          </p>
                          <p className="text-sm text-tx mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <CommentBox licitacaoId={selected.id} users={users} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
