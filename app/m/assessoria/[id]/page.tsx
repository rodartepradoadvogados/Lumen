import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "slate" | "bordo"> = {
  ATIVA: "green",
  SUSPENSA: "slate",
  ENCERRADA: "bordo",
};
const statusLabels: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

const honorarioStatusColors: Record<string, "green" | "amber" | "bordo" | "slate"> = {
  PENDENTE: "amber",
  PAGO: "green",
  ATRASADO: "bordo",
  CANCELADO: "slate",
};
const honorarioStatusLabels: Record<string, string> = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado", CANCELADO: "Cancelado" };

const docTypeLabels: Record<string, string> = {
  CONTRATO: "Contrato",
  PARECER: "Parecer",
  ACAO_VINCULADA: "Ação vinculada",
  LICITACAO: "Licitação",
  REGIMENTO_INTERNO: "Regimento Interno",
  OUTRO: "Outro",
};

const licitacaoStatusColors: Record<string, "slate" | "amber" | "green" | "bordo"> = {
  EM_ANALISE: "slate",
  PARTICIPANDO: "amber",
  VENCEDORA: "green",
  PERDIDA: "bordo",
  CANCELADA: "slate",
};
const licitacaoStatusLabels: Record<string, string> = {
  EM_ANALISE: "Em análise",
  PARTICIPANDO: "Participando",
  VENCEDORA: "Vencedora",
  PERDIDA: "Perdida",
  CANCELADA: "Cancelada",
};

const caseStatusColors: Record<string, "green" | "slate" | "bordo" | "amber"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "slate",
};
const caseStatusLabels: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

export default async function MobileAssessoriaDetail({ params }: { params: { id: string } }) {
  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/assessoria" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Assessoria Jurídica
      </Link>

      <div>
        <h1 className="font-serif text-lg font-bold text-navy-900 dark:text-cream-50 leading-tight">{assessoria.client.name}</h1>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <Badge color={statusColors[assessoria.status] || "slate"}>{statusLabels[assessoria.status] || assessoria.status}</Badge>
          {assessoria.responsible && <Badge color="navy">{assessoria.responsible.name}</Badge>}
        </div>
      </div>

      <Card className="p-4 space-y-2.5">
        <Field label="Honorário mensal" value={`${formatCurrency(assessoria.monthlyFee)} · vence dia ${assessoria.dueDay}`} />
        <Field label="Início do contrato" value={formatDate(assessoria.startDate)} />
        {assessoria.planningNotes && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1">Planejamento</p>
            <p className="text-sm text-navy-800 dark:text-cream-50/85 whitespace-pre-wrap">{assessoria.planningNotes}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Honorários</h2>
        </div>
        {assessoria.honorarios.length === 0 ? (
          <EmptyState title="Nenhum honorário gerado ainda" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.honorarios.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{h.competencia}</p>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45">{formatCurrency(h.receivable.amount)} · vence {formatDate(h.receivable.dueDate)}</p>
                </div>
                <Badge color={honorarioStatusColors[h.receivable.status] || "slate"}>{honorarioStatusLabels[h.receivable.status] || h.receivable.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Documentos</h2>
        </div>
        {assessoria.documents.length === 0 ? (
          <EmptyState title="Nenhum documento cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.documents.map((d) => (
              <a
                key={d.id}
                href={d.driveUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{d.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color="slate">{docTypeLabels[d.docType] || d.docType}</Badge>
                    <span className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(d.date)}</span>
                  </div>
                </div>
                <ExternalLink size={15} className="text-navy-800/30 dark:text-cream-50/30 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Licitações</h2>
        </div>
        {assessoria.licitacoes.length === 0 ? (
          <EmptyState title="Nenhuma licitação cadastrada" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.licitacoes.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{l.objeto}</p>
                  <Badge color={licitacaoStatusColors[l.status] || "slate"}>{licitacaoStatusLabels[l.status] || l.status}</Badge>
                </div>
                <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                  {l.orgao}
                  {l.prazoFinal && ` · prazo final ${formatDate(l.prazoFinal)}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Processos vinculados</h2>
        </div>
        {assessoria.linkedCases.length === 0 ? (
          <EmptyState title="Nenhum processo vinculado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedCases.map((c) => (
              <Link key={c.id} href={`/m/processos/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-white/5">
                <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{c.title}</p>
                <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Atendimentos vinculados</h2>
        </div>
        {assessoria.linkedAttendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento vinculado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedAttendances.map((a) => (
              <Link key={a.id} href={`/m/atendimento/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-white/5">
                <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{a.subject}</p>
                <span className="text-xs text-navy-800/40 dark:text-cream-50/40 shrink-0">{formatDate(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
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
