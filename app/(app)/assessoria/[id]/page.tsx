import { notFound } from "next/navigation";
import Link from "next/link";
import { getAssessoriaDetail, retryAssessoriaDriveFolder } from "@/lib/actions/assessoria";
import { prisma } from "@/lib/prisma";
import { Badge, formatCurrency } from "@/components/ui";
import AssessoriaOverviewTab from "@/components/assessoria/AssessoriaOverviewTab";
import AssessoriaDocumentosTab from "@/components/assessoria/AssessoriaDocumentosTab";
import AssessoriaHonorariosTab from "@/components/assessoria/AssessoriaHonorariosTab";
import AssessoriaLicitacoesTab from "@/components/assessoria/AssessoriaLicitacoesTab";
import AssessoriaTimelineTab from "@/components/assessoria/AssessoriaTimelineTab";
import AssessoriaProcessosCasosTab from "@/components/assessoria/AssessoriaProcessosCasosTab";
import DriveFolderMissingNotice from "@/components/assessoria/DriveFolderMissingNotice";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import { getStorageConnectionStatus } from "@/lib/storageProvider";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "geral", label: "Visão Geral" },
  { key: "documentos", label: "Documentos" },
  { key: "honorarios", label: "Honorários" },
  { key: "licitacoes", label: "Licitações" },
  { key: "processos-casos", label: "Demandas, Processos e Casos" },
  { key: "linha-do-tempo", label: "Linha do Tempo" },
  // Anotações criadas pelo painel global "Anotações" (faixa retrátil na borda direita, ver
  // components/anotacoes/AnotacoesPanel.tsx) vinculadas a esta Assessoria.
  { key: "anotacoes-pessoais", label: "Anotações pessoais" },
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
  const [users, availableCasesRaw, storageStatus, anotacoesRaw] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.case.findMany({
      where: { officeId: viewer.officeId, id: { notIn: linkedCaseIds } },
      select: { id: true, title: true, processNumber: true },
      orderBy: { title: "asc" },
    }),
    // Gate da área de arrastar arquivo: pergunta pelo ARMAZENAMENTO do escritório, não pelo
    // Google. Um escritório em OneDrive ou Dropbox tem armazenamento conectado e mesmo assim
    // não via onde soltar o arquivo, porque a checagem era específica do Drive.
    // Status completo (não só o booleano): quando desconectado, a área de anexar de cada
    // demanda (Parecer) e da aba Documentos sumia da tela sem explicação nenhuma — o usuário
    // expandia a linha e não via nada. Agora o motivo específico (token expirado, revogado,
    // nunca conectado) aparece em vez do vazio.
    getStorageConnectionStatus(viewer.officeId),
    // Aba "Anotações pessoais" (painel global "Anotações") — mesma regra de filtro por
    // authorId de app/(app)/processos/[id]/page.tsx e app/(app)/atendimento/[id]/page.tsx.
    prisma.anotacao.findMany({ where: { assessoriaId: assessoria.id, authorId: viewer.id }, orderBy: { referenceDate: "desc" } }),
  ]);
  const storageConnected = storageStatus.connected;
  const serializedAnotacoes = anotacoesRaw.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));

  const licitacoesEmAndamento = assessoria.licitacoes.filter((l) => l.status === "EM_ANALISE" || l.status === "PARTICIPANDO").length;

  return (
    <div className="p-6 animate-fade-in">
      <Link href="/assessoria" className="text-xs font-semibold text-tx-2 hover:text-tx">
        ← Assessoria Jurídica
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mt-2 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-tx">{assessoria.client.name}</h1>
          <div className="flex items-center gap-2 flex-wrap text-xs text-tx-2 mt-1">
            {assessoria.client.document && <span>CNPJ {assessoria.client.document}</span>}
            {assessoria.responsible && <><span className="opacity-40">·</span><span>Responsável: {assessoria.responsible.name}</span></>}
            <span className="opacity-40">·</span>
            <span>Desde {new Date(assessoria.startDate).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}</span>
          </div>
        </div>
        <Badge color={statusColors[assessoria.status] || "slate"}>{statusLabels[assessoria.status] || assessoria.status}</Badge>
      </div>

      {/* driveFolderId nulo com o armazenamento conectado só acontece hoje se a criação da pasta
          falhou silenciosamente (bug corrigido na Tarefa C, ver createAssessoria em
          lib/actions/assessoria.ts) — sem isso, a assessoria "parecia" ter pasta e não tinha. */}
      {storageConnected && !assessoria.driveFolderId && (
        <div className="mb-5">
          <DriveFolderMissingNotice
            message="Esta assessoria ainda não tem pasta no armazenamento em nuvem."
            retry={retryAssessoriaDriveFolder.bind(null, assessoria.id)}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-sf rounded-lg border border-regua p-3.5">
          <p className="text-2xl font-bold text-tx">{assessoria.linkedCases.length}</p>
          <p className="text-[11px] text-tx-2 mt-0.5">Processos vinculados</p>
        </div>
        <div className="bg-sf rounded-lg border border-regua p-3.5">
          <p className="text-2xl font-bold text-tx">{formatCurrency(assessoria.monthlyFee)}</p>
          <p className="text-[11px] text-tx-2 mt-0.5">Honorário · vence dia {assessoria.dueDay}</p>
        </div>
        <div className="bg-sf rounded-lg border border-regua p-3.5">
          <p className="text-2xl font-bold text-tx">{licitacoesEmAndamento}</p>
          <p className="text-[11px] text-tx-2 mt-0.5">Licitações em andamento</p>
        </div>
        <div className="bg-sf rounded-lg border border-regua p-3.5">
          <p className="text-2xl font-bold text-tx">{assessoria.documents.length}</p>
          <p className="text-[11px] text-tx-2 mt-0.5">Documentos no catálogo</p>
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-regua mb-5 flex-wrap">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/assessoria/${assessoria.id}?tab=${t.key}`}
            className={`text-sm font-semibold px-3.5 py-2.5 border-b-2 -mb-0.5 transition-colors ${
              tab === t.key
                ? "border-acao text-tx"
                : "border-transparent text-tx-2 hover:text-tx"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "geral" && <AssessoriaOverviewTab assessoria={assessoria} />}
      {tab === "documentos" && (
        <AssessoriaDocumentosTab assessoria={assessoria} driveConnected={storageConnected} storageMessage={storageStatus.message} />
      )}
      {tab === "honorarios" && <AssessoriaHonorariosTab assessoria={assessoria} />}
      {tab === "licitacoes" && <AssessoriaLicitacoesTab assessoria={assessoria} users={users} />}
      {tab === "processos-casos" && (
        <AssessoriaProcessosCasosTab
          assessoria={assessoria}
          availableCases={availableCasesRaw}
          driveConnected={storageConnected}
          storageMessage={storageStatus.message}
        />
      )}
      {tab === "linha-do-tempo" && <AssessoriaTimelineTab assessoria={assessoria} />}
      {tab === "anotacoes-pessoais" && (
        <div>
          <p className="text-xs italic text-tx-2 mb-3">
            Anotações que você criou vinculadas a esta assessoria (painel Anotações, ícone na borda direita da tela) — visíveis só para você.
          </p>
          <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
        </div>
      )}
    </div>
  );
}
