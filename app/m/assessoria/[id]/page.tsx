import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getStorageConnectionStatus } from "@/lib/storageProvider";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { FinanceStatusBadge } from "@/lib/financeStatus";
import MobileSearchCasesModal from "@/components/mobile/MobileSearchCasesModal";
import MobileAssessoriaDocumentsSection from "@/components/mobile/MobileAssessoriaDocumentsSection";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import MobileNovaAnotacaoForm from "@/components/mobile/MobileNovaAnotacaoForm";
import { ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "slate" | "bordo"> = {
  ATIVA: "green",
  SUSPENSA: "slate",
  ENCERRADA: "bordo",
};
const statusLabels: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

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
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  // getAssessoriaDetail (lib/actions/assessoria.ts) fica fora do escopo deste arquivo — ver
  // observação no relatório desta auditoria sobre escopo de officeId nesse helper.
  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const linkedCaseIds = assessoria.linkedCases.map((c) => c.id);
  const [availableCases, anotacoesRaw, storageStatus] = await Promise.all([
    prisma.case.findMany({
      where: { officeId: viewer.officeId, id: { notIn: linkedCaseIds } },
      select: { id: true, title: true, processNumber: true },
      orderBy: { title: "asc" },
    }),
    prisma.anotacao.findMany({ where: { assessoriaId: assessoria.id, authorId: viewer.id }, orderBy: { referenceDate: "desc" } }),
    // Gate do upload de documentos (ver MobileAssessoriaDocumentsSection.tsx) — por PROVEDOR
    // (Drive/OneDrive/Dropbox), não só Drive, mesmo bug já corrigido em
    // app/(app)/processos/novo/page.tsx. Status completo (não só o booleano): sem ele, quando
    // desconectado, a área de anexar de cada demanda sumia sem explicação nenhuma.
    getStorageConnectionStatus(viewer.officeId),
  ]);
  const storageConnected = storageStatus.connected;
  const serializedAnotacoes = anotacoesRaw.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/assessoria" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Assessoria Jurídica
      </Link>

      <div>
        <h1 className="text-lg font-bold text-tx leading-tight">{assessoria.client.name}</h1>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <Badge color={statusColors[assessoria.status] || "slate"}>{statusLabels[assessoria.status] || assessoria.status}</Badge>
          {assessoria.responsible && <Badge color="navy">{assessoria.responsible.name}</Badge>}
        </div>
      </div>

      <Card className="p-4 space-y-2.5">
        <Field label="Honorário mensal" value={`${formatCurrency(assessoria.monthlyFee)} · vence dia ${assessoria.dueDay}`} tabular />
        <Field label="Início do contrato" value={formatDate(assessoria.startDate)} />
        {assessoria.planningNotes && (
          <div className="pt-1">
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1">Planejamento</p>
            <p className="text-sm text-tx-2 whitespace-pre-wrap">{assessoria.planningNotes}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-regua">
          <h2 className="font-bold text-tx text-sm">Honorários</h2>
        </div>
        {assessoria.honorarios.length === 0 ? (
          <EmptyState title="Nenhum honorário gerado ainda" />
        ) : (
          <div className="divide-y divide-regua">
            {assessoria.honorarios.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx">{h.competencia}</p>
                  <p className="text-xs tabular-nums text-tx-2">{formatCurrency(h.receivable.amount)} · vence {formatDate(h.receivable.dueDate)}</p>
                </div>
                <FinanceStatusBadge status={h.receivable.status} kind="receivable" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <MobileAssessoriaDocumentsSection
        assessoriaId={assessoria.id}
        pareceres={assessoria.pareceres}
        documents={assessoria.documents}
        storageConnected={storageConnected}
        storageMessage={storageStatus.message}
      />

      <Card>
        <div className="px-4 py-3 border-b border-regua">
          <h2 className="font-bold text-tx text-sm">Licitações</h2>
        </div>
        {assessoria.licitacoes.length === 0 ? (
          <EmptyState title="Nenhuma licitação cadastrada" />
        ) : (
          <div className="divide-y divide-regua">
            {assessoria.licitacoes.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-tx truncate">{l.nome || l.objeto}</p>
                  <Badge color={licitacaoStatusColors[l.status] || "slate"}>{licitacaoStatusLabels[l.status] || l.status}</Badge>
                </div>
                <p className="text-xs text-tx-2 mt-0.5">
                  {l.orgao}
                  {l.prazoFinal && ` · prazo final ${formatDate(l.prazoFinal)}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-regua flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-tx text-sm">Processos vinculados</h2>
          {/* Auditoria apontou que esta tela só vinculava processo existente — nenhuma criação
              (ver AssessoriaProcessosCasosTab.tsx no desktop, que já tem os dois atalhos). "Novo
              processo" abre o formulário no ramo Judicial; "Novo caso" força EXTRAJUDICIAL — os
              dois levam a assessoriaId na querystring, que app/m/processos/novo/page.tsx agora lê
              e repassa como pré-seleção pro MobileNewCaseForm (ver AssessoriaSelect). */}
          <div className="flex items-center gap-1 flex-wrap">
            <MobileSearchCasesModal assessoriaId={assessoria.id} availableCases={availableCases} />
            <Link
              href={`/m/processos/novo?assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-acao px-2.5 py-1 shrink-0"
            >
              <Plus size={12} /> Novo processo
            </Link>
            <Link
              href={`/m/processos/novo?type=EXTRAJUDICIAL&assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-acao px-2.5 py-1 shrink-0"
            >
              <Plus size={12} /> Novo caso
            </Link>
          </div>
        </div>
        {assessoria.linkedCases.length === 0 ? (
          <EmptyState title="Nenhum processo vinculado" />
        ) : (
          <div className="divide-y divide-regua">
            {assessoria.linkedCases.map((c) => (
              <Link key={c.id} href={`/m/processos/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sf-apoio">
                <p className="text-sm font-medium text-tx truncate">{c.title}</p>
                <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-regua">
          <h2 className="font-bold text-tx text-sm">Atendimentos vinculados</h2>
        </div>
        {assessoria.linkedAttendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento vinculado" />
        ) : (
          <div className="divide-y divide-regua">
            {assessoria.linkedAttendances.map((a) => (
              <Link key={a.id} href={`/m/atendimento/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sf-apoio">
                <p className="text-sm font-medium text-tx truncate">{a.subject}</p>
                <span className="text-xs text-tx-2 shrink-0">{formatDate(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold text-tx text-sm mb-3">Anotações pessoais</h2>
        <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
        <div className="mt-3 pt-3 border-t border-regua">
          <MobileNovaAnotacaoForm linkType="ASSESSORIA" entityId={assessoria.id} />
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, tabular }: { label: string; value?: string | null; tabular?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-regua pb-2 last:border-0 last:pb-0">
      <span className="text-tx-2 shrink-0">{label}</span>
      <span className={`font-medium text-tx text-right ${tabular ? "tabular-nums" : ""}`}>{value || "—"}</span>
    </div>
  );
}
