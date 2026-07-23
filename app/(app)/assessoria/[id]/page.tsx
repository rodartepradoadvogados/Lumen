import { notFound } from "next/navigation";
import Link from "next/link";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { prisma } from "@/lib/prisma";
import { Badge, formatCurrency } from "@/components/ui";
import AssessoriaOverviewTab from "@/components/assessoria/AssessoriaOverviewTab";
import AssessoriaDocumentosTab from "@/components/assessoria/AssessoriaDocumentosTab";
import AssessoriaHonorariosTab from "@/components/assessoria/AssessoriaHonorariosTab";
import AssessoriaLicitacoesTab from "@/components/assessoria/AssessoriaLicitacoesTab";
import AssessoriaTimelineTab from "@/components/assessoria/AssessoriaTimelineTab";
import AssessoriaProcessosCasosTab from "@/components/assessoria/AssessoriaProcessosCasosTab";
import { getDriveStatus } from "@/lib/googleDrive";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "geral", label: "Visão Geral" },
  { key: "documentos", label: "Documentos" },
  { key: "honorarios", label: "Honorários" },
  { key: "licitacoes", label: "Licitações" },
  { key: "processos-casos", label: "Pareceres, Processos e Casos" },
  { key: "linha-do-tempo", label: "Linha do Tempo" },
];

const statusColors: Record<string, "green" | "slate" | "bordo"> = {
  ATIVA: "green",
  SUSPENSA: "slate",
  ENCERRADA: "bordo",
};
const statusLabels: Record<string, string> = { ATIVA: "Assessoria ativa", SUSPENSA: "Assessoria suspensa", ENCERRADA: "Assessoria encerrada" };

export default async function AssessoriaDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "geral";
  const linkedCaseIds = assessoria.linkedCases.map((c) => c.id);
  const [users, availableCasesRaw, driveStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.case.findMany({
      where: { officeId: viewer.officeId, id: { notIn: linkedCaseIds } },
      select: { id: true, title: true, processNumber: true },
      orderBy: { title: "asc" },
    }),
    getDriveStatus(viewer.officeId),
  ]);

  const licitacoesEmAndamento = assessoria.licitacoes.filter((l) => l.status === "EM_ANALISE" || l.status === "PARTICIPANDO").length;

  return (
    <div className="p-6 animate-fade-in">
      <Link href="/assessoria" className="text-xs font-semibold text-navy-800/45 dark:text-cream-50/45 hover:text-navy-900 dark:hover:text-cream-50">
        ← Assessoria Jurídica
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mt-2 mb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{assessoria.client.name}</h1>
          <div className="flex items-center gap-2 flex-wrap text-xs text-navy-800/45 dark:text-cream-50/45 mt-1">
            {assessoria.client.document && <span>CNPJ {assessoria.client.document}</span>}
            {assessoria.responsible && <><span className="opacity-40">·</span><span>Responsável: {assessoria.responsible.name}</span></>}
            <span className="opacity-40">·</span>
            <span>Desde {new Date(assessoria.startDate).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}</span>
          </div>
        </div>
        <Badge color={statusColors[assessoria.status] || "slate"}>{statusLabels[assessoria.status] || assessoria.status}</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-3.5">
          <p className="text-2xl font-serif font-bold text-navy-900 dark:text-cream-50">{assessoria.linkedCases.length}</p>
          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">Processos vinculados</p>
        </div>
        <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-3.5">
          <p className="text-2xl font-serif font-bold text-navy-900 dark:text-cream-50">{formatCurrency(assessoria.monthlyFee)}</p>
          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">Honorário · vence dia {assessoria.dueDay}</p>
        </div>
        <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-3.5">
          <p className="text-2xl font-serif font-bold text-navy-900 dark:text-cream-50">{licitacoesEmAndamento}</p>
          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">Licitações em andamento</p>
        </div>
        <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-3.5">
          <p className="text-2xl font-serif font-bold text-navy-900 dark:text-cream-50">{assessoria.documents.length}</p>
          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">Documentos no catálogo</p>
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-navy-800/8 dark:border-white/10 mb-5 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/assessoria/${assessoria.id}?tab=${t.key}`}
            className={`text-sm font-semibold px-3.5 py-2.5 border-b-2 -mb-0.5 transition-colors ${
              tab === t.key
                ? "border-gold-500 text-navy-900 dark:text-cream-50"
                : "border-transparent text-navy-800/45 dark:text-cream-50/45 hover:text-navy-800 dark:hover:text-cream-50/70"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "geral" && <AssessoriaOverviewTab assessoria={assessoria} />}
      {tab === "documentos" && <AssessoriaDocumentosTab assessoria={assessoria} driveConnected={driveStatus.connected} />}
      {tab === "honorarios" && <AssessoriaHonorariosTab assessoria={assessoria} />}
      {tab === "licitacoes" && <AssessoriaLicitacoesTab assessoria={assessoria} users={users} />}
      {tab === "processos-casos" && <AssessoriaProcessosCasosTab assessoria={assessoria} availableCases={availableCasesRaw} />}
      {tab === "linha-do-tempo" && <AssessoriaTimelineTab assessoria={assessoria} />}
    </div>
  );
}
