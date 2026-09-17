"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { updateLicitacaoStatus, addLicitacaoTask, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Card, Badge, EmptyState, formatCurrency, formatCalendarDate, formatDate } from "@/components/ui";
import { authorDisplayName } from "@/lib/authorDisplay";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { Pencil, Paperclip } from "lucide-react";
import CommentBox from "@/components/CommentBox";
import MobileLicitacaoDocumentUpload from "@/components/mobile/MobileLicitacaoDocumentUpload";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";
import { TiraDeGuias, GuiaBotao } from "@/components/mobile/GuiaMobile";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type Licitacao = Assessoria["licitacoes"][number];
type UserOption = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "EM_ANALISE", label: "Em análise", color: "slate" as const },
  { value: "PARTICIPANDO", label: "Participando", color: "amber" as const },
  { value: "VENCEDORA", label: "Vencedora", color: "green" as const },
  { value: "PERDIDA", label: "Perdida", color: "bordo" as const },
  { value: "CANCELADA", label: "Cancelada", color: "slate" as const },
];
const statusMeta = (status: string) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

type DocFilter = "TODOS" | "GERAL" | string;

export default function MobileLicitacaoDetail({
  assessoriaId,
  licitacao,
  users,
  driveConnected,
  storageMessage,
  viewerOfficeId,
}: {
  assessoriaId: string;
  licitacao: Licitacao;
  users: UserOption[];
  driveConnected: boolean;
  storageMessage?: string;
  viewerOfficeId: string;
}) {
  const [docFilter, setDocFilter] = useState<DocFilter>("TODOS");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const st = statusMeta(licitacao.status);

  const filteredDocs = useMemo(() => {
    if (docFilter === "TODOS") return licitacao.attachments;
    if (docFilter === "GERAL") return licitacao.attachments.filter((a) => !a.taskId);
    return licitacao.attachments.filter((a) => a.taskId === docFilter);
  }, [licitacao.attachments, docFilter]);

  const taskOptions = useMemo(() => licitacao.tasks.map((t) => ({ id: t.id, title: t.title })), [licitacao.tasks]);

  const docChips: { key: DocFilter; label: string }[] = [
    { key: "TODOS", label: `Todos (${licitacao.attachments.length})` },
    { key: "GERAL", label: `Geral (${licitacao.attachments.filter((a) => !a.taskId).length})` },
    ...licitacao.tasks.map((t) => ({
      key: t.id as DocFilter,
      label: `${t.title} (${licitacao.attachments.filter((a) => a.taskId === t.id).length})`,
    })),
  ];

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateLicitacaoStatus(licitacao.id, status);
    });
  }

  function handleNewTask(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addLicitacaoTask(licitacao.id, {
        title: String(formData.get("title") || ""),
        dueDate: String(formData.get("dueDate") || ""),
        responsibleId: String(formData.get("responsibleId") || "") || undefined,
      });
      if (result.error) setError(result.error);
      else setTaskFormOpen(false);
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold text-tx leading-tight">{licitacao.nome || licitacao.objeto}</h1>
        <Link
          href={`/m/assessoria/${assessoriaId}/licitacoes/${licitacao.id}/editar`}
          className="flex items-center gap-1 text-corpo font-semibold text-tx-2 shrink-0 px-2 py-1"
        >
          <Pencil size={13} /> Editar
        </Link>
      </div>
      <div className="mt-1.5">
        <Badge color={st.color}>{st.label}</Badge>
      </div>

      <Card className="p-4 space-y-2 mt-3">
        <h2 className="font-bold text-tx text-sm mb-1">Dados da licitação</h2>
        <Field label="Objeto" value={licitacao.objeto} wrap />
        <Field label="Órgão" value={licitacao.orgao} />
        <Field label="Modalidade" value={licitacao.modalidade || "—"} />
        <Field label="Abertura" value={licitacao.dataAbertura ? formatCalendarDate(licitacao.dataAbertura) : "—"} tabular />
        <Field label="Prazo final" value={licitacao.prazoFinal ? formatCalendarDate(licitacao.prazoFinal) : "—"} tabular />
        <Field label="Valor estimado" value={licitacao.valorEstimado ? formatCurrency(licitacao.valorEstimado) : "—"} tabular />
        <div className="flex justify-between gap-3 text-sm border-b border-regua pb-2">
          <span className="text-tx-2 shrink-0">Edital</span>
          {licitacao.editalUrl ? (
            <a href={licitacao.editalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-marca-tx">↗ Abrir no Drive</a>
          ) : (
            <span className="text-tx-3">Não anexado</span>
          )}
        </div>
        <div className="flex justify-between items-center gap-3 text-sm pt-0.5">
          <span className="text-tx-2">Status</span>
          <select
            value={licitacao.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={pending}
            className="text-corpo font-semibold border border-regua-forte bg-sf-superficie text-tx px-2 py-1"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="p-4 mt-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-tx text-sm">Tarefas &amp; Prazos</h2>
          <button onClick={() => setTaskFormOpen((v) => !v)} className="text-corpo font-semibold text-marca-tx">+ Nova</button>
        </div>
        {taskFormOpen && (
          <form action={handleNewTask} className="mb-2 p-2.5 bg-sf-apoio space-y-2">
            <input name="title" required placeholder="Título da tarefa" className="mobile-input" />
            <input name="dueDate" type="date" required className="mobile-input" />
            <select name="responsibleId" defaultValue="" className="mobile-input">
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {error && <p role="alert" className="text-corpo text-urgente">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-corpo font-semibold px-3 py-1.5 disabled:opacity-50">
                Adicionar
              </button>
              <button type="button" onClick={() => setTaskFormOpen(false)} className="text-corpo font-semibold text-tx-2">Cancelar</button>
            </div>
          </form>
        )}
        {licitacao.tasks.length === 0 ? (
          <p className="text-sm text-tx-3">Nenhuma tarefa cadastrada.</p>
        ) : (
          <div className="divide-y divide-regua">
            {licitacao.tasks.map((t) => {
              const count = licitacao.attachments.filter((a) => a.taskId === t.id).length;
              const active = docFilter === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setDocFilter(active ? "TODOS" : t.id)}
                  className={`w-full flex items-center justify-between gap-2 text-sm py-2.5 px-1.5 -mx-1.5 text-left ${active ? "bg-acao-bg" : ""}`}
                >
                  <span className={t.status === "CONCLUIDO" ? "line-through text-tx-3" : "text-tx"}>{t.title}</span>
                  <span className="flex items-center gap-1.5 shrink-0 text-tx-2 text-corpo tabular-nums whitespace-nowrap">
                    {formatCalendarDate(t.dueDate)}
                    {t.responsible ? ` · ${t.responsible.name.split(" ")[0]}` : ""}
                    {count > 0 && <span className="inline-flex items-center gap-0.5 font-semibold"><Paperclip size={10} /> {count}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 mt-3">
        <h2 className="font-bold text-tx text-sm mb-2">Documentos</h2>
        {!driveConnected && (
          <div className="mb-2">
            <StorageDisconnectedNotice message={storageMessage} />
          </div>
        )}
        {licitacao.tasks.length > 0 && (
          <TiraDeGuias faixa="anil" className="mb-1 -mx-1 px-1">
            {docChips.map((c) => (
              <GuiaBotao key={c.key} onClick={() => setDocFilter(c.key)} faixa="anil" ativa={docFilter === c.key}>
                {c.label}
              </GuiaBotao>
            ))}
          </TiraDeGuias>
        )}
        {filteredDocs.length === 0 ? (
          <p className="text-sm text-tx-3 py-1">Nenhum documento{docFilter !== "TODOS" ? " neste filtro" : " ainda"}.</p>
        ) : (
          <div className="divide-y divide-regua">
            {filteredDocs.map((a) => {
              const Icon = getDocumentTypeIcon(a.docType);
              const task = a.taskId ? licitacao.tasks.find((t) => t.id === a.taskId) : null;
              return (
                <a key={a.id} href={a.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 py-2.5">
                  <Icon size={15} className="shrink-0 text-tx-2" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-tx truncate">{a.name}</p>
                    <p className="text-corpo text-tx-2 mt-0.5">{getDocumentTypeLabel(a.docType)} · {formatDate(a.createdAt)}</p>
                  </div>
                  {licitacao.tasks.length > 0 && (
                    <span className="text-etiqueta font-semibold px-1.5 py-0.5 rounded-full bg-sf-apoio text-tx-2 shrink-0">
                      {task ? task.title : "Geral"}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}
        {driveConnected && (
          <MobileLicitacaoDocumentUpload
            licitacaoId={licitacao.id}
            taskId={docFilter !== "TODOS" && docFilter !== "GERAL" ? docFilter : undefined}
            taskOptions={taskOptions}
          />
        )}
      </Card>

      <Card className="p-4 mt-3">
        <h2 className="font-bold text-tx text-sm mb-2">Anotações</h2>
        <div className="space-y-3 mb-1">
          {licitacao.comments.length === 0 && <EmptyState title="Nenhuma anotação ainda" subtitle="Use @ para mencionar alguém da equipe" />}
          {licitacao.comments.map((cm) => {
            const authorName = authorDisplayName(cm.author, viewerOfficeId);
            return (
              <div key={cm.id} className="flex gap-2.5">
                <div className="h-7 w-7 rounded-full bg-grafite-700 text-acao-tx flex items-center justify-center text-corpo font-bold shrink-0">
                  {authorName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold text-tx">{authorName}</span>{" "}
                    <span className="text-corpo text-tx-2">{formatDate(cm.createdAt)}</span>
                  </p>
                  <p className="text-sm text-tx mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                </div>
              </div>
            );
          })}
        </div>
        <CommentBox licitacaoId={licitacao.id} users={users} />
      </Card>
    </>
  );
}

function Field({ label, value, tabular, wrap }: { label: string; value: string; tabular?: boolean; wrap?: boolean }) {
  return (
    <div className={`flex ${wrap ? "flex-col" : "justify-between"} gap-1 text-sm border-b border-regua pb-2`}>
      <span className="text-tx-2 shrink-0">{label}</span>
      <span className={`text-tx ${wrap ? "" : "text-right"} ${tabular ? "tabular-nums" : ""}`}>{value}</span>
    </div>
  );
}
