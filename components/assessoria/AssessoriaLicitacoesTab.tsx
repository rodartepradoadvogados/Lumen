"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addLicitacao,
  updateLicitacao,
  updateLicitacaoStatus,
  addLicitacaoTask,
  type getAssessoriaDetail,
} from "@/lib/actions/assessoria";
import { Badge, EmptyState, formatCurrency, formatCalendarDate, formatDate } from "@/components/ui";
import { authorDisplayName } from "@/lib/authorDisplay";
import { Plus, Pencil, X, ChevronRight, Paperclip } from "lucide-react";
import MoneyInput from "@/components/MoneyInput";
import AttachmentList from "@/components/AttachmentList";
import CommentBox from "@/components/CommentBox";
import SlideDrawer from "@/components/motion/SlideDrawer";
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
function toAttachmentData(a: {
  id: string;
  name: string;
  driveUrl: string;
  docType: string;
  createdAt: string | Date;
  uploadedBy: { name: string } | null;
  taskId?: string | null;
}) {
  return {
    id: a.id,
    name: a.name,
    driveUrl: a.driveUrl,
    docType: a.docType,
    createdAt: new Date(a.createdAt).toISOString(),
    uploadedBy: a.uploadedBy ? { name: a.uploadedBy.name } : null,
    taskId: a.taskId ?? null,
  };
}

function dateInputValue(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

// Ordenação da lista de licitações — critérios próprios (prazo/valor/objeto), diferente do
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

// Filtro da seção Documentos, dentro da gaveta de uma licitação — "TODOS"/"GERAL" ou o id de uma
// demanda (Task). Correção do pedido "a tela de Documentos não pode ficar bagunçada": em vez de
// uma lista de anexos por demanda (accordion dentro de accordion), existe UMA lista só, que o
// clique numa demanda em "Tarefas & Prazos" (ou num chip aqui) filtra — ver AttachmentList.tsx,
// que também ganhou o campo "Atribuir a" para quem sobe um documento na visão "Todos"/"Geral".
type DocFilter = "TODOS" | "GERAL" | string;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState<DocFilter>("TODOS");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
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

  // Todos os documentos da licitação selecionada (gerais + de cada demanda — Attachment.taskId
  // não filtra aqui, ver comentário de DocFilter acima), no formato que AttachmentList espera.
  const selectedAllAttachments = useMemo(() => (selected?.attachments ?? []).map((a) => toAttachmentData(a)), [selected]);

  const selectedFilteredAttachments = useMemo(() => {
    if (docFilter === "TODOS") return selectedAllAttachments;
    if (docFilter === "GERAL") return selectedAllAttachments.filter((a) => !a.taskId);
    return selectedAllAttachments.filter((a) => a.taskId === docFilter);
  }, [selectedAllAttachments, docFilter]);

  const selectedTaskOptions = useMemo(() => (selected?.tasks ?? []).map((t) => ({ id: t.id, title: t.title })), [selected]);

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

  function openDrawer(id: string) {
    setSelectedId(id);
    setDocFilter("TODOS");
    setTaskFormOpen(false);
  }
  function closeDrawer() {
    setSelectedId(null);
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

  function handleSubmitModal(formData: FormData) {
    setError(null);
    const payload = {
      nome: String(formData.get("nome") || ""),
      objeto: String(formData.get("objeto") || ""),
      orgao: String(formData.get("orgao") || ""),
      modalidade: String(formData.get("modalidade") || "") || undefined,
      dataAbertura: String(formData.get("dataAbertura") || "") || undefined,
      prazoFinal: String(formData.get("prazoFinal") || "") || undefined,
      valorEstimado: String(formData.get("valorEstimado") || "") || undefined,
      editalUrl: String(formData.get("editalUrl") || "") || undefined,
    };
    startTransition(async () => {
      const result = modalMode === "edit" && selected ? await updateLicitacao(selected.id, payload) : await addLicitacao(assessoria.id, payload);
      if (result.error) setError(result.error);
      else setModalMode(null);
    });
  }

  function closeModal() {
    setModalMode(null);
    setError(null);
  }

  const docChips: { key: DocFilter; label: string }[] = selected
    ? [
        { key: "TODOS", label: `Todos (${selectedAllAttachments.length})` },
        { key: "GERAL", label: `Geral (${selectedAllAttachments.filter((a) => !a.taskId).length})` },
        ...selected.tasks.map((t) => ({
          key: t.id as DocFilter,
          label: `${t.title} (${selectedAllAttachments.filter((a) => a.taskId === t.id).length})`,
        })),
      ]
    : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-tx-2">
          {assessoria.licitacoes.length} licitaç{assessoria.licitacoes.length === 1 ? "ão" : "ões"}
        </p>
        <button
          onClick={() => {
            setError(null);
            setModalMode("create");
          }}
          className="flex items-center gap-1.5 text-sm font-semibold text-acao hover:text-acao-hover px-3 py-1.5 "
        >
          <Plus size={14} /> Nova licitação
        </button>
      </div>

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

          <div className="flex flex-col gap-2">
            {licitacoesExibidas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => openDrawer(l.id)}
                className="text-left border border-regua rounded-lg bg-sf p-3.5 hover:border-regua-forte transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-tx text-[14px] truncate">{l.nome || l.objeto}</p>
                    <p className="text-[11.5px] text-tx-2 mt-0.5 truncate">{l.orgao}</p>
                  </div>
                  <ChevronRight size={16} className="text-tx-3 shrink-0 mt-0.5" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2">
                  <CardField label="Modalidade" value={l.modalidade || "—"} />
                  <CardField label="Objeto" value={l.objeto} className="col-span-2 sm:col-span-1" clamp />
                  <CardField label="Prazo final" value={l.prazoFinal ? formatCalendarDate(l.prazoFinal) : "—"} tabular />
                  <CardField label="Valor estimado" value={l.valorEstimado ? formatCurrency(l.valorEstimado) : "—"} tabular />
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Status</p>
                    <Badge color={statusMeta(l.status).color}>{statusMeta(l.status).label}</Badge>
                  </div>
                </div>
              </button>
            ))}
            {licitacoesExibidas.length === 0 && (
              <p className="py-6 text-center text-xs text-tx-3">Nenhuma licitação com esse filtro.</p>
            )}
          </div>
        </>
      )}

      {selected && (
        <SlideDrawer
          title={selected.nome || selected.objeto}
          subtitle={selected.orgao}
          onClose={closeDrawer}
          widthClassName="w-[92vw] sm:w-[560px]"
          actions={
            <button
              type="button"
              onClick={() => {
                setError(null);
                setModalMode("edit");
              }}
              className="flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-acao px-1.5 py-1"
            >
              <Pencil size={13} /> Editar
            </button>
          }
        >
          <div className="p-5 flex flex-col gap-4">
            <div className="bg-sf-apoio border border-regua p-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Dados da licitação</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><span className="text-tx-2 shrink-0">Objeto</span><span className="text-tx text-right">{selected.objeto}</span></div>
                <div className="flex justify-between"><span className="text-tx-2">Órgão</span><span className="text-tx">{selected.orgao}</span></div>
                <div className="flex justify-between"><span className="text-tx-2">Modalidade</span><span className="text-tx">{selected.modalidade || "—"}</span></div>
                <div className="flex justify-between"><span className="text-tx-2">Abertura</span><span className="text-tx tabular-nums">{selected.dataAbertura ? formatCalendarDate(selected.dataAbertura) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-tx-2">Prazo final</span><span className="text-tx tabular-nums">{selected.prazoFinal ? formatCalendarDate(selected.prazoFinal) : "—"}</span></div>
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

            <div className="bg-sf-apoio border border-regua p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Tarefas &amp; Prazos</h4>
                <button onClick={() => setTaskFormOpen((v) => !v)} className="text-xs font-semibold text-acao hover:text-acao-hover">
                  + Nova tarefa
                </button>
              </div>

              {taskFormOpen && (
                <form action={handleNewTask} className="mb-3 p-3 bg-sf space-y-2">
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
                  {error && <p className="text-xs text-urgente">{error}</p>}
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
                    const count = selectedAllAttachments.filter((a) => a.taskId === t.id).length;
                    const active = docFilter === t.id;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => setDocFilter(active ? "TODOS" : t.id)}
                        className={`w-full flex items-center justify-between gap-3 text-sm py-2 px-1.5 -mx-1.5 text-left ${active ? "bg-acao-bg" : "hover:bg-sf"}`}
                        title="Filtrar Documentos por esta demanda"
                      >
                        <span className={t.status === "CONCLUIDO" ? "line-through text-tx-3" : "text-tx"}>{t.title}</span>
                        <span className="flex items-center gap-2 shrink-0 text-tx-2 text-xs">
                          <span className="tabular-nums whitespace-nowrap">
                            {formatCalendarDate(t.dueDate)}{t.responsible ? ` · ${t.responsible.name.split(" ")[0]}` : ""}
                          </span>
                          {count > 0 && (
                            <span className="inline-flex items-center gap-0.5 font-semibold">
                              <Paperclip size={11} /> {count}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-sf-apoio border border-regua p-4">
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
              {selected.tasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {docChips.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setDocFilter(c.key)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        docFilter === c.key ? "bg-acao text-acao-tx border-acao" : "border-regua text-tx-2 hover:border-regua-forte hover:text-tx"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              <AttachmentList
                key={docFilter}
                attachments={selectedFilteredAttachments}
                licitacaoId={selected.id}
                taskId={docFilter !== "TODOS" && docFilter !== "GERAL" ? docFilter : undefined}
                taskOptions={selectedTaskOptions}
                driveConnected={driveConnected}
              />
              <HistoricoEnvios
                entity={{ tipo: "LICITACAO", id: selected.id, titulo: selected.nome || selected.objeto }}
                envios={selectedEnvios}
              />
            </div>

            <div className="bg-sf-apoio border border-regua p-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Anotações</h4>
              <div className="space-y-4 mb-3 max-h-[360px] overflow-y-auto scrollbar-thin">
                {selected.comments.length === 0 && (
                  <EmptyState title="Nenhuma anotação ainda" subtitle="Use @ para mencionar alguém da equipe" />
                )}
                {selected.comments.map((cm) => {
                  const authorName = authorDisplayName(cm.author, viewerOfficeId);
                  return (
                    <div key={cm.id} className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-grafite-700 text-acao-tx flex items-center justify-center text-[11px] font-bold shrink-0">
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
          </div>
        </SlideDrawer>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-[60] bg-grafite-900/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-sf shadow-modal rounded-lg w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">{modalMode === "edit" ? "Editar dados da licitação" : "Nova licitação"}</h3>
              <button onClick={closeModal} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <form action={handleSubmitModal} className="p-5 space-y-3">
              <div>
                <label className="text-[11px] text-tx-2">Nome da licitação</label>
                <input
                  name="nome"
                  required
                  defaultValue={modalMode === "edit" ? selected?.nome || "" : ""}
                  placeholder="Ex: Pregão 014/2026 — Locação de Veículos"
                  className="lic-input"
                />
                <p className="text-[10.5px] text-tx-3 mt-0.5">
                  Nome curto para gestão — aparece no card e vira o nome da pasta no Drive.
                </p>
              </div>
              <div>
                <label className="text-[11px] text-tx-2">Objeto</label>
                <textarea
                  name="objeto"
                  required
                  rows={3}
                  defaultValue={modalMode === "edit" ? selected?.objeto || "" : ""}
                  placeholder="Objeto (texto completo do edital)"
                  className="lic-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-tx-2">Órgão</label>
                  <input name="orgao" required defaultValue={modalMode === "edit" ? selected?.orgao || "" : ""} className="lic-input" />
                </div>
                <div>
                  <label className="text-[11px] text-tx-2">Modalidade</label>
                  <input
                    name="modalidade"
                    defaultValue={modalMode === "edit" ? selected?.modalidade || "" : ""}
                    placeholder="Ex: Pregão Eletrônico 014/2026"
                    className="lic-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-tx-2">Abertura</label>
                  <input name="dataAbertura" type="date" defaultValue={modalMode === "edit" ? dateInputValue(selected?.dataAbertura) : ""} className="lic-input" />
                </div>
                <div>
                  <label className="text-[11px] text-tx-2">Prazo final</label>
                  <input name="prazoFinal" type="date" defaultValue={modalMode === "edit" ? dateInputValue(selected?.prazoFinal) : ""} className="lic-input" />
                </div>
                <div>
                  <label className="text-[11px] text-tx-2">Valor estimado (R$)</label>
                  <MoneyInput name="valorEstimado" defaultValue={modalMode === "edit" && selected?.valorEstimado != null ? String(selected.valorEstimado) : undefined} className="lic-input" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-tx-2">Link do edital (Drive)</label>
                <input name="editalUrl" type="url" defaultValue={modalMode === "edit" ? selected?.editalUrl || "" : ""} placeholder="https://..." className="lic-input" />
              </div>
              {error && <p className="text-xs text-urgente">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 disabled:opacity-50">
                  {pending ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={closeModal} className="text-xs font-semibold text-tx-2">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`.lic-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.3125rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
    </div>
  );
}

function CardField({ label, value, tabular, clamp, className }: { label: string; value: string; tabular?: boolean; clamp?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">{label}</p>
      <p className={`text-[12.5px] text-tx ${tabular ? "tabular-nums" : ""} ${clamp ? "truncate" : ""}`} title={value}>{value}</p>
    </div>
  );
}
