import { notFound } from "next/navigation";
import Link from "next/link";
import { getAssessoriaDetail, retryAssessoriaDriveFolder } from "@/lib/actions/assessoria";
import { prisma } from "@/lib/prisma";
import { mesEAnoDeBrasilia } from "@/lib/horaDeBrasilia";
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
import { getLeafCategoryOptions } from "@/lib/categories";

// A cor da seção Jurídico vem do mapa, não escrita à mão (lib/navSections.ts).

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
  const [users, availableCasesRaw, storageStatus, anotacoesRaw, expenseCategories, costCenters, suppliers] = await Promise.all([
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
    // Aba "Honorários" — despesa recorrente vinculada (repasse a parceiros), ver
    // AssessoriaRecurringExpensesCard.tsx.
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
    <div className="tela">
      <Link href="/assessoria" className="text-etiqueta font-semibold text-tx-2 hover:text-tx transition-colors duration-100 ease-out">
        ← Assessoria Jurídica
      </Link>

      {/* P1-4 do diagnóstico: o nome do cliente e os QUATRO números eram todos `text-2xl
          font-bold` — cinco elementos idênticos em peso, com os rótulos a 12px. Uma razão de
          22:12 sem nenhum degrau no meio, numa tela cujo trabalho é dizer DE QUEM é a assessoria
          e QUANTO ela vale. Agora a rampa tem quatro paradas de verdade: 28 na identidade, 22 no
          dinheiro, 18 nos contadores, 12 nos rótulos. Mesmo `text-autuacao` do <h1> de
          /processos/[id], que é a tela irmã desta na mesma seção. */}
      <div className="flex items-start justify-between gap-4 flex-wrap mt-2 mb-6">
        <div>
          <h1 className="text-autuacao font-bold text-tx leading-tight">{assessoria.client.name}</h1>
          <div className="flex items-center gap-2 flex-wrap text-etiqueta text-tx-2 mt-1.5">
            {assessoria.client.document && <span>CNPJ {assessoria.client.document}</span>}
            {assessoria.responsible && <><span className="opacity-40">·</span><span>Responsável: {assessoria.responsible.name}</span></>}
            <span className="opacity-40">·</span>
            {/* startDate é instante (@default(now()), não vem de campo de data em lugar nenhum do
                código — conferido). Sem fuso, um contrato aberto depois das 21h de Brasília podia
                aparecer no mês seguinte. A mesma correção foi feita nas outras duas telas que
                mostram este campo. */}
            <span>Desde {mesEAnoDeBrasilia(assessoria.startDate)}</span>
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

      {/* UMA faixa, não quatro cartões iguais. O contrato de direção recusa a arrumação-padrão da
          categoria com todas as letras — "quatro KPIs iguais lado a lado" está na lista de coisas
          que este produto não faz — e esta tela era exatamente isso.

          O peso é desigual porque os quatro números não valem o mesmo: o honorário é o dinheiro,
          é o único com data, e é a razão de a assessoria existir. Os outros três são inventário.

          E os quatro passam a LEVAR A ALGUM LUGAR. Eram números inertes: o visitante lia
          "2 licitações em andamento" e tinha de procurar a aba na mão. Cada um agora abre a aba
          que detalha aquele número — é a diferença entre um painel que informa e um que serve. */}
      <div className="flex flex-wrap items-stretch border-2 border-regua-forte bg-sf rounded-[2px] mb-6">
        <Link
          href={`/assessoria/${assessoria.id}?tab=honorarios`}
          className="flex-1 min-w-[220px] px-5 py-4 transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-etiqueta font-extrabold uppercase tracking-[.1em] text-tx-3">Honorário mensal</p>
          <p className="text-guia font-bold text-tx tabular-nums mt-1">{formatCurrency(assessoria.monthlyFee)}</p>
          <p className="text-etiqueta text-tx-2 mt-0.5">vence todo dia {assessoria.dueDay}</p>
        </Link>
        {[
          { n: assessoria.linkedCases.length, rotulo: "Processos vinculados", aba: "processos-casos" },
          { n: licitacoesEmAndamento, rotulo: "Licitações em andamento", aba: "licitacoes" },
          { n: assessoria.documents.length, rotulo: "Documentos no catálogo", aba: "documentos" },
        ].map((k) => (
          <Link
            key={k.aba}
            href={`/assessoria/${assessoria.id}?tab=${k.aba}`}
            className="flex-1 min-w-[150px] px-5 py-4 border-l border-regua transition-colors duration-100 ease-out hover:bg-acao-bg"
          >
            <p className="text-destaque font-bold text-tx tabular-nums">{k.n}</p>
            <p className="text-etiqueta text-tx-2 mt-0.5">{k.rotulo}</p>
          </Link>
        ))}
      </div>

      {/* A guia da gaveta, igual à de /processos/[id] — a tela irmã desta, na MESMA seção do rail
          (Jurídico). Esta usava sublinhado de 2px e a outra usa a aba chanfrada que é
          a assinatura formal do sistema: duas gramáticas de navegação para o mesmo gesto, dentro
          da mesma seção.
          A aba ativa é bronze (`--guia-ativa`), uma cor só em todas as telas — ver a nota em app/globals.css. */}
      <div className={`flex flex-wrap items-end gap-[3px] border-b-2 border-guia-ativa mb-6`}>
        {TABS.map((t, i) => {
          const ativa = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/assessoria/${assessoria.id}?tab=${t.key}`}
              aria-current={ativa ? "page" : undefined}
              className={`guia-ficha text-etiqueta font-semibold uppercase tracking-[.06em] whitespace-nowrap transition-colors ${
                ativa
                  ? "bg-guia-ativa text-rotulo border-guia-ativa"
                  : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio hover:text-tx"
              }`}
            >
              <span className="opacity-70 mr-1.5 tabular-nums">{i + 1}</span>
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "geral" && <AssessoriaOverviewTab assessoria={assessoria} />}
      {tab === "documentos" && (
        <AssessoriaDocumentosTab assessoria={assessoria} driveConnected={storageConnected} storageMessage={storageStatus.message} />
      )}
      {tab === "honorarios" && (
        <AssessoriaHonorariosTab
          assessoria={assessoria}
          categories={expenseCategories}
          costCenters={costCenters}
          suppliers={suppliers}
          teamMembers={users.map((u) => ({ id: u.id, name: u.name }))}
        />
      )}
      {tab === "licitacoes" && (
        <AssessoriaLicitacoesTab
          assessoria={assessoria}
          users={users}
          driveConnected={storageConnected}
          storageMessage={storageStatus.message}
          viewerOfficeId={viewer.officeId}
        />
      )}
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
