import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatCurrency, formatDate, EmptyState, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import NewReceivableModal from "@/components/NewReceivableModal";
import EditReceivableModal from "@/components/EditReceivableModal";
import EditPayableModal from "@/components/EditPayableModal";
import CommentBox from "@/components/CommentBox";
import CaseStatusSelect from "@/components/CaseStatusSelect";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import AttachmentList from "@/components/AttachmentList";
import PeticionarButton from "@/components/PeticionarButton";
import GerarDocumentoButton from "@/components/GerarDocumentoButton";
import PublicationsList from "@/components/PublicationsList";
import PromoteToJudicialForm from "@/components/PromoteToJudicialForm";
import ApplyWorkflowModal from "@/components/ApplyWorkflowModal";
import { ArrowLeft, Check } from "lucide-react";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { getLeafCategoryOptions } from "@/lib/categories";
import { getDriveStatus } from "@/lib/googleDrive";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "atividades", label: "Atividades" },
  { key: "comentarios", label: "Comentários" },
  { key: "financeiro", label: "Financeiro" },
  { key: "publicacoes", label: "Publicações" },
  { key: "anexos", label: "Anexos" },
];

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const requestedTab = searchParams.tab || "visao-geral";
  const viewer = await getCurrentUser();
  const hasFinanceAccess = Boolean(viewer?.isAdmin || viewer?.financeAccess);
  const tab = requestedTab === "financeiro" && !hasFinanceAccess ? "visao-geral" : requestedTab;

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      responsible: true,
      tasks: { include: { responsible: true, _count: { select: { comments: true } } }, orderBy: { dueDate: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      receivables: { orderBy: { dueDate: "asc" } },
      payables: { orderBy: { dueDate: "asc" } },
      publications: { include: { client: true }, orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!c) notFound();

  const serializedAttachments = c.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const [cases, users, columns, receivableCategories, payableCategories, costCenters, suppliers, driveStatus, workflowTemplates, taskCounts] = await Promise.all([
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" } }),
    getLeafCategoryOptions("RECEITA"),
    getLeafCategoryOptions("DESPESA"),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getDriveStatus(),
    prisma.workflowTemplate.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.groupBy({
      by: ["publicationId"],
      where: { publicationId: { in: c.publications.map((p) => p.id) }, status: { not: "CANCELADO" } },
      _count: { _all: true },
    }),
  ]);
  const taskCountMap = new Map(taskCounts.map((t) => [t.publicationId as string, t._count._all]));
  const serializedPublications = c.publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.read,
    deadlineGenerated: p.deadlineGenerated,
    lawyerTag: p.lawyerTag,
    processNumberRaw: p.processNumberRaw,
    case: { id: c.id, title: c.title, processNumber: c.processNumber },
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    taskCount: taskCountMap.get(p.id) ?? 0,
    assignedToId: p.assignedToId,
    triageStatus: p.triageStatus,
  }));

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/processos" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 mb-3">
        <ArrowLeft size={13} /> Processos e Casos
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{c.title}</h1>
        <div className="flex items-center gap-2">
          <PeticionarButton compact />
          <CaseStatusSelect caseId={c.id} status={c.status} />
          <DeleteEntityButton entityType="CASE" entityId={c.id} entityLabel={c.title} confirmMessage={`Excluir "${c.title}"? Essa ação remove tarefas e comentários vinculados; lançamentos financeiros e publicações serão apenas desvinculados.`} />
        </div>
      </div>
      <p className="text-sm text-navy-800/50 dark:text-cream-50/50 mb-5">
        {c.processNumber && <span>{c.processNumber} · </span>}
        {c.area && <span>{c.area} · </span>}
        {c.type}
      </p>

      <div className="flex gap-1 border-b border-navy-800/10 dark:border-white/10 mb-6 overflow-x-auto">
        {TABS.filter((t) => t.key !== "financeiro" || hasFinanceAccess).map((t) => (
          <Link
            key={t.key}
            href={`/processos/${c.id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-gold-600 text-navy-900 dark:text-cream-50"
                : "border-transparent text-navy-800/45 dark:text-cream-50/45 hover:text-navy-800 dark:hover:text-cream-50/80"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "visao-geral" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="p-5 space-y-3">
            <Field label="Cliente" value={c.client?.name} />
            <Field label="Parte Adversa" value={c.opposingPartyName} />
            <Field label="Polo da Parte Adversa" value={c.opposingPartyRole} />
            <Field label="Advogado Responsável" value={c.responsible?.name} />
            <Field label="Vara/Comarca" value={c.court} />
            <Field label="Valor da Causa" value={c.caseValue != null ? formatCurrency(c.caseValue) : undefined} />
          </Card>
          <Card className="p-5">
            <h4 className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Descrição</h4>
            <p className="text-sm text-navy-800 dark:text-cream-50/80 whitespace-pre-wrap">{c.description || "Sem descrição."}</p>
          </Card>
          {c.type !== "JUDICIAL" && (
            <Card className="p-5 md:col-span-2">
              <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50 mb-3">Converter em Processo Judicial</h4>
              <PromoteToJudicialForm caseId={c.id} />
            </Card>
          )}
        </div>
      )}

      {tab === "atividades" && (
        <div>
          <div className="flex justify-end gap-2 mb-3">
            <ApplyWorkflowModal
              caseId={c.id}
              templates={workflowTemplates}
              users={users.map((u) => ({ id: u.id, name: u.name }))}
            />
            <NewTaskModal cases={cases.map((x) => ({ id: x.id, name: x.title }))} users={users} columns={columns} defaultCaseId={c.id} label="Nova Atividade" />
          </div>
          <Card>
            {c.tasks.length === 0 ? (
              <EmptyState title="Nenhuma atividade cadastrada" />
            ) : (
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {c.tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                    <form action={async () => { "use server"; await toggleTaskDone(t.id); }}>
                      <button type="submit" className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center ${t.status === "CONCLUIDO" ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 dark:border-white/20 hover:border-emerald-500"}`}>
                        <Check size={12} strokeWidth={3} />
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                        <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                        <p className={`text-sm font-medium text-navy-900 dark:text-cream-50 ${t.status === "CONCLUIDO" ? "line-through text-navy-800/40 dark:text-cream-50/40" : ""}`}>{t.title}</p>
                      </div>
                      {t.responsible && <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-0.5">Responsável: {t.responsible.name}</p>}
                    </div>
                    <p className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 shrink-0">{formatDate(t.dueDate)}</p>
                    <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir a atividade "${t.title}"?`} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "comentarios" && (
        <Card className="p-5">
          <div className="space-y-4 mb-4 max-h-[420px] overflow-y-auto scrollbar-thin">
            {c.comments.length === 0 && <EmptyState title="Nenhum comentário ainda" subtitle="Use @ para mencionar alguém da equipe" />}
            {c.comments.map((cm) => (
              <div key={cm.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {cm.author.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-semibold text-navy-900 dark:text-cream-50">{cm.author.name}</span>{" "}
                    <span className="text-[11px] text-navy-800/40 dark:text-cream-50/40">{formatDate(cm.createdAt)}</span>
                  </p>
                  <p className="text-sm text-navy-800 dark:text-cream-50/80 mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                </div>
              </div>
            ))}
          </div>
          <CommentBox caseId={c.id} currentUserId={users[0]?.id} users={users.map((u) => ({ id: u.id, name: u.name }))} />
        </Card>
      )}

      {tab === "financeiro" && (
        <div>
          <div className="flex justify-end mb-3">
            <NewReceivableModal
              categories={receivableCategories}
              cases={[]}
              clients={c.clientId ? [{ id: c.clientId, name: c.client?.name ?? "" }] : []}
              defaultCaseId={c.id}
              defaultClientId={c.clientId ?? undefined}
              label="Lançar Honorários"
              alreadyReceivedForCase={c.receivables.filter((r) => r.status === "PAGO").reduce((s, r) => s + (r.paidAmount ?? r.amount), 0)}
            />
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="px-5 py-3 border-b border-navy-800/8 dark:border-white/10">
              <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Contas a Receber</h4>
            </div>
            {c.receivables.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {c.receivables.map((r) => (
                  <div key={r.id} className="flex justify-between items-center px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900 dark:text-cream-50">{r.description}</p>
                      <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(r.amount)}</p>
                        <Badge color={r.status === "PAGO" ? "green" : r.status === "ATRASADO" ? "red" : "amber"}>{r.status}</Badge>
                      </div>
                      <EditReceivableModal
                        receivable={{
                          id: r.id,
                          description: r.description,
                          amount: r.amount,
                          dueDate: r.dueDate.toISOString(),
                          noDueDate: r.noDueDate,
                          kind: r.kind,
                          categoryId: r.categoryId,
                          costCenterId: r.costCenterId,
                          clientId: r.clientId,
                          caseId: r.caseId,
                        }}
                        categories={receivableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        clients={c.clientId ? [{ id: c.clientId, name: c.client?.name ?? "" }] : []}
                        costCenters={costCenters}
                      />
                      <DeleteEntityButton entityType="RECEIVABLE" entityId={r.id} entityLabel={r.description} confirmMessage={`Excluir o lançamento "${r.description}"?`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div className="px-5 py-3 border-b border-navy-800/8 dark:border-white/10">
              <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Contas a Pagar (custas etc.)</h4>
            </div>
            {c.payables.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {c.payables.map((p) => (
                  <div key={p.id} className="flex justify-between items-center px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900 dark:text-cream-50">{p.description}</p>
                      <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(p.amount)}</p>
                        <Badge color={p.status === "PAGO" ? "green" : p.status === "ATRASADO" ? "red" : "amber"}>{p.status}</Badge>
                      </div>
                      <EditPayableModal
                        payable={{
                          id: p.id,
                          description: p.description,
                          supplierId: p.supplierId,
                          amount: p.amount,
                          dueDate: p.dueDate.toISOString(),
                          noDueDate: p.noDueDate,
                          categoryId: p.categoryId,
                          costCenterId: p.costCenterId,
                          caseId: p.caseId,
                        }}
                        categories={payableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        suppliers={suppliers}
                        costCenters={costCenters}
                      />
                      <DeleteEntityButton entityType="PAYABLE" entityId={p.id} entityLabel={p.description} confirmMessage={`Excluir o lançamento "${p.description}"?`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        </div>
      )}

      {tab === "publicacoes" && (
        <Card>
          {serializedPublications.length === 0 ? (
            <EmptyState title="Nenhuma publicação vinculada" />
          ) : (
            <PublicationsList publications={serializedPublications} highlightNew={false} />
          )}
        </Card>
      )}

      {tab === "anexos" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <GerarDocumentoButton caseId={c.id} />
          </div>
          <Card className="p-5">
            <AttachmentList attachments={serializedAttachments} caseId={c.id} driveConnected={driveStatus.connected} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-navy-800/5 dark:border-white/10 pb-2">
      <span className="text-navy-800/50 dark:text-cream-50/50">{label}</span>
      <span className="font-medium text-navy-900 dark:text-cream-50 text-right">{value || "—"}</span>
    </div>
  );
}
