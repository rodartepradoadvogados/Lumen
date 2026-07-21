import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate, taskTypeLabels, taskTypeColors } from "@/components/ui";
import MobileCommentForm from "@/components/mobile/MobileCommentForm";
import MobileNewTaskForm from "@/components/mobile/MobileNewTaskForm";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileCaseDetail({ params }: { params: { id: string } }) {
  const [viewer, c, publications] = await Promise.all([
    getCurrentUser(),
    prisma.case.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        responsible: true,
        tasks: {
          where: { status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
          orderBy: { dueDate: "asc" },
          take: 20,
        },
        comments: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 15 },
      },
    }),
    prisma.publication.findMany({
      where: { caseId: params.id },
      orderBy: { publishedAt: "desc" },
      take: 15,
    }),
  ]);

  if (!c) notFound();

  const serializedPublications = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    caseId: c.id,
    caseTitle: c.title,
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m/processos"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Processos
      </Link>

      <div>
        <h1 className="font-serif text-lg font-bold text-navy-900 dark:text-cream-50 leading-tight">{c.title}</h1>
        <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-1">
          {c.processNumber && <span>{c.processNumber} · </span>}
          {c.area && <span>{c.area} · </span>}
          {c.type}
        </p>
      </div>

      <Card className="p-4 space-y-2.5">
        <Field label="Cliente" value={c.client?.name} />
        <Field label="Parte Adversa" value={c.opposingPartyName} />
        <Field label="Vara/Comarca" value={c.court} />
        <Field label="Valor da Causa" value={c.caseValue != null ? formatCurrency(c.caseValue) : undefined} />
        <Field label="Responsável" value={c.responsible?.name} />
        {c.description && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1">
              Descrição
            </p>
            <p className="text-sm text-navy-800 dark:text-cream-50/85 whitespace-pre-wrap">{c.description}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Próximas tarefas</h2>
        </div>
        {c.tasks.length === 0 ? (
          <EmptyState title="Nenhuma tarefa pendente" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {c.tasks.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <Badge color={taskTypeColors[t.type] ?? "slate"}>{taskTypeLabels[t.type] ?? t.type}</Badge>
                  <span className="text-xs font-semibold text-navy-800/55 dark:text-cream-50/55">{formatDate(t.dueDate)}</span>
                  {t.dueTime && <span className="text-xs text-navy-800/45 dark:text-cream-50/45">{t.dueTime}</span>}
                </div>
                <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{t.title}</p>
              </div>
            ))}
          </div>
        )}
        <div className="p-3 border-t border-navy-800/8 dark:border-white/10">
          <MobileNewTaskForm caseId={c.id} />
        </div>
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Publicações e Andamentos</h2>
        </div>
        {serializedPublications.length === 0 ? (
          <EmptyState title="Nenhuma publicação ou andamento" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {serializedPublications.map((p) => (
              <MobilePublicationCard key={p.id} pub={p} />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Comentários</h2>
        {c.comments.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum comentário ainda.</p>
        ) : (
          <div className="space-y-3">
            {c.comments.map((cm) => (
              <div key={cm.id} className="flex gap-2.5">
                <div className="h-8 w-8 rounded-full bg-navy-800 dark:bg-navy-700 text-gold-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {cm.author.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold text-navy-900 dark:text-cream-50">{cm.author.name}</span>{" "}
                    <span className="text-[11px] text-navy-800/40 dark:text-cream-50/40">{formatDate(cm.createdAt)}</span>
                  </p>
                  <p className="text-sm text-navy-800 dark:text-cream-50/85 mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {viewer && <MobileCommentForm caseId={c.id} authorId={viewer.id} />}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-navy-800/5 dark:border-white/10 pb-2 last:border-0 last:pb-0">
      <span className="text-navy-800/50 dark:text-cream-50/50 shrink-0">{label}</span>
      <span className="font-medium text-navy-900 dark:text-cream-50 text-right">{value || "—"}</span>
    </div>
  );
}
