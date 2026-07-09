import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatCurrency, formatDate, EmptyState, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import NewReceivableModal from "@/components/NewReceivableModal";
import CommentBox from "@/components/CommentBox";
import CaseStatusSelect from "@/components/CaseStatusSelect";
import { ArrowLeft, Check } from "lucide-react";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { getLeafCategoryOptions } from "@/lib/categories";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "atividades", label: "Atividades" },
  { key: "comentarios", label: "Comentários" },
  { key: "financeiro", label: "Financeiro" },
  { key: "publicacoes", label: "Publicações" },
];

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const tab = searchParams.tab || "visao-geral";

  const c = await prisma.case.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      opposingParty: true,
      opposingLawyer: true,
      responsible: true,
      tasks: { include: { responsible: true, _count: { select: { comments: true } } }, orderBy: { dueDate: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      receivables: { orderBy: { dueDate: "asc" } },
      payables: { orderBy: { dueDate: "asc" } },
      publications: { orderBy: { publishedAt: "desc" } },
    },
  });

  if (!c) notFound();

  const [cases, users, columns, receivableCategories] = await Promise.all([
    prisma.case.findMany({ where: { status: "ATIVO" }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { active: true } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" } }),
    getLeafCategoryOptions("RECEITA"),
  ]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/processos" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 hover:text-navy-900 mb-3">
        <ArrowLeft size={13} /> Processos e Casos
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-serif text-2xl font-bold text-navy-900">{c.title}</h1>
        <CaseStatusSelect caseId={c.id} status={c.status} />
      </div>
      <p className="text-sm text-navy-800/50 mb-5">
        {c.processNumber && <span>{c.processNumber} · </span>}
        {c.area && <span>{c.area} · </span>}
        {c.type}
      </p>

      <div className="flex gap-1 border-b border-navy-800/10 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/processos/${c.id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-gold-600 text-navy-900" : "border-transparent text-navy-800/45 hover:text-navy-800"
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
            <Field label="Parte Adversa" value={c.opposingParty?.name} />
            <Field label="Advogado Adverso" value={c.opposingLawyer?.name} />
            <Field label="Advogado Responsável" value={c.responsible?.name} />
            <Field label="Vara/Comarca" value={c.court} />
            <Field label="Valor da Causa" value={c.caseValue != null ? formatCurrency(c.caseValue) : undefined} />
          </Card>
          <Card className="p-5">
            <h4 className="text-xs font-semibold text-navy-800/50 uppercase tracking-wide mb-2">Descrição</h4>
            <p className="text-sm text-navy-800 whitespace-pre-wrap">{c.description || "Sem descrição."}</p>
          </Card>
        </div>
      )}

      {tab === "atividades" && (
        <div>
          <div className="flex justify-end mb-3">
            <NewTaskModal cases={cases.map((x) => ({ id: x.id, name: x.title }))} users={users} columns={columns} defaultCaseId={c.id} label="Nova Atividade" />
          </div>
          <Card>
            {c.tasks.length === 0 ? (
              <EmptyState title="Nenhuma atividade cadastrada" />
            ) : (
              <div className="divide-y divide-navy-800/5">
                {c.tasks.map((t) => (
                  <form key={t.id} action={async () => { "use server"; await toggleTaskDone(t.id); }} className="flex items-center gap-3 px-5 py-3.5">
                    <button type="submit" className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center ${t.status === "CONCLUIDO" ? "bg-emerald-500 border-emerald-500 text-white" : "border-navy-800/20 hover:border-emerald-500"}`}>
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                        <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                        <p className={`text-sm font-medium text-navy-900 ${t.status === "CONCLUIDO" ? "line-through text-navy-800/40" : ""}`}>{t.title}</p>
                      </div>
                      {t.responsible && <p className="text-xs text-navy-800/40 mt-0.5">Responsável: {t.responsible.name}</p>}
                    </div>
                    <p className="text-xs font-semibold text-navy-800/60 shrink-0">{formatDate(t.dueDate)}</p>
                  </form>
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
                    <span className="font-semibold text-navy-900">{cm.author.name}</span>{" "}
                    <span className="text-[11px] text-navy-800/40">{formatDate(cm.createdAt)}</span>
                  </p>
                  <p className="text-sm text-navy-800 mt-0.5 whitespace-pre-wrap">{cm.content}</p>
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
            />
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="px-5 py-3 border-b border-navy-800/8">
              <h4 className="text-sm font-semibold text-navy-900">Contas a Receber</h4>
            </div>
            {c.receivables.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-navy-800/5">
                {c.receivables.map((r) => (
                  <div key={r.id} className="flex justify-between px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900">{r.description}</p>
                      <p className="text-xs text-navy-800/40">{formatDate(r.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-navy-900">{formatCurrency(r.amount)}</p>
                      <Badge color={r.status === "PAGO" ? "green" : r.status === "ATRASADO" ? "red" : "amber"}>{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div className="px-5 py-3 border-b border-navy-800/8">
              <h4 className="text-sm font-semibold text-navy-900">Contas a Pagar (custas etc.)</h4>
            </div>
            {c.payables.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-navy-800/5">
                {c.payables.map((p) => (
                  <div key={p.id} className="flex justify-between px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900">{p.description}</p>
                      <p className="text-xs text-navy-800/40">{formatDate(p.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-navy-900">{formatCurrency(p.amount)}</p>
                      <Badge color={p.status === "PAGO" ? "green" : p.status === "ATRASADO" ? "red" : "amber"}>{p.status}</Badge>
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
          {c.publications.length === 0 ? (
            <EmptyState title="Nenhuma publicação vinculada" />
          ) : (
            <div className="divide-y divide-navy-800/5">
              {c.publications.map((p) => (
                <div key={p.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge color={p.kind === "PUBLICACAO" ? "blue" : "gold"}>
                      {p.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}
                    </Badge>
                    <Badge color="navy">{p.source}</Badge>
                    {!p.read && <Badge color="gold">Não lida</Badge>}
                    <span className="text-xs text-navy-800/40">{formatDate(p.publishedAt)}</span>
                  </div>
                  <p className="text-sm text-navy-800">{p.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-navy-800/5 pb-2">
      <span className="text-navy-800/50">{label}</span>
      <span className="font-medium text-navy-900 text-right">{value || "—"}</span>
    </div>
  );
}
