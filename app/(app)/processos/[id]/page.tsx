import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import { authorDisplayName } from "@/lib/authorDisplay";
import { sanitizeExternalUrl } from "@/lib/urlSafety";
import NewTaskModal from "@/components/NewTaskModal";
import EditReceivableModal from "@/components/EditReceivableModal";
import LancarHonorariosModal from "@/components/honorarios/LancarHonorariosModal";
import ApurarHonorarioModal from "@/components/honorarios/ApurarHonorarioModal";
import HonorarioLancamentoCard from "@/components/honorarios/HonorarioLancamentoCard";
import EditPayableModal from "@/components/EditPayableModal";
import NewPayableModal from "@/components/NewPayableModal";
import SettleButton from "@/components/SettleButton";
import CommentBox from "@/components/CommentBox";
import CaseStatusSelect from "@/components/CaseStatusSelect";
import CaseAssessoriaSelect from "@/components/CaseAssessoriaSelect";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import AttachmentList from "@/components/AttachmentList";
import PeticionarButton from "@/components/PeticionarButton";
import CopyButton from "@/components/CopyButton";
import GerarDocumentoButton from "@/components/GerarDocumentoButton";
import PublicationsList from "@/components/PublicationsList";
import MarkAllPublicationsReadButton from "@/components/MarkAllPublicationsReadButton";
import PromoteToJudicialForm from "@/components/PromoteToJudicialForm";
import ApplyWorkflowModal from "@/components/ApplyWorkflowModal";
import EditCaseModal from "@/components/EditCaseModal";
import RecurringFeeCard from "@/components/RecurringFeeCard";
import TaskActivityRow from "@/components/TaskActivityRow";
import SendCaseEmailModal from "@/components/SendCaseEmailModal";
import TermosVigilanciaPanel from "@/components/TermosVigilanciaPanel";
import ProtocolosTab from "@/components/protocolos/ProtocolosTab";
import { EnviarDocumentosButton, HistoricoEnvios } from "@/components/DocumentoEnvios";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import BreakGlassReveal from "@/components/BreakGlassReveal";
import { ArrowLeft, ExternalLink, Presentation } from "lucide-react";
import { getLeafCategoryOptions } from "@/lib/categories";
import { isStorageConnected } from "@/lib/storageProvider";
import { getCurrentUser } from "@/lib/currentUser";
import { effectiveCaseClients, effectiveCaseParties, partyRoleLabels } from "@/lib/caseParties";
import { naturezaOf, NATUREZA_LABELS, ESFERA_LABELS, MATERIA_LABELS } from "@/lib/caseNatureza";
import { valorLiquido, saldoEmAberto, totalRecebidoNoProcesso } from "@/lib/financeCalc";
import { financeGroupKind } from "@/lib/financeGroupKind";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";
import { instanciaLabel } from "@/lib/caseInstance";
import { getCaseLinks } from "@/lib/actions/caseLinks";
import { getCaseInstanceHistory } from "@/lib/actions/cases";
import { buildCaseTimeline } from "@/lib/caseTimeline";
import CaseTimeline from "@/components/processos/CaseTimeline";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "atividades", label: "Atividades" },
  { key: "comentarios", label: "Comentários" },
  { key: "financeiro", label: "Financeiro" },
  { key: "publicacoes", label: "Publicações" },
  { key: "anexos", label: "Anexos" },
  // Só aparece pra Judicial/Administrativo (ver filtro de TABS mais abaixo) — Casos não
  // protocolam nada em tribunal/órgão.
  { key: "protocolos", label: "Protocolos" },
  // Só aparece para processos administrativos (ver filtro de TABS mais abaixo) — o setor
  // judicial/casos não usa termo vigiado nenhum.
  { key: "vigilancia", label: "Vigilância" },
  // Anotações criadas pelo painel global "Anotações" (faixa retrátil na borda direita, ver
  // components/anotacoes/AnotacoesPanel.tsx) vinculadas a este Processo/Caso — sempre visível,
  // sem filtro de natureza (os 3 chips Processo Judicial/Administrativo/Caso apontam pra cá).
  { key: "anotacoes-pessoais", label: "Anotações pessoais" },
];

// Cor da etiqueta de natureza — mesmo mapeamento de app/(app)/processos/page.tsx (dourado
// Judicial, bordô Administrativo, navy Caso).
const naturezaBadgeColor: Record<string, "gold" | "bordo" | "navy"> = {
  JUDICIAL: "gold",
  ADMINISTRATIVO: "bordo",
  CASO: "navy",
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    tab?: string;
    anexosFalhos?: string;
    // Honorário pretendido vindo da conversão de um Atendimento (Fase 5) — ver
    // convertAttendanceToCase, lib/actions/attendance.ts. Só pré-preenche o Lançar Honorários
    // (prop `prefill`/`autoOpen` de LancarHonorariosModal), nunca cria a cobrança sozinho.
    honorarioPretendido?: string;
    feeMode?: string;
    feeAmount?: string;
    feePercentual?: string;
    feePercentualBase?: string;
  };
}) {
  const requestedTab = searchParams.tab || "visao-geral";
  const anexosFalhos = Number(searchParams.anexosFalhos) || 0;
  const honorarioPretendidoPrefill =
    searchParams.honorarioPretendido === "1"
      ? {
          cobranca: (searchParams.feeMode as "DINHEIRO" | "PERCENTUAL" | "AMBOS" | undefined) ?? "DINHEIRO",
          amount: searchParams.feeAmount,
          percentual: searchParams.feePercentual,
          percentualBase: searchParams.feePercentualBase,
        }
      : undefined;
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const c = await prisma.case.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      client: true,
      clients: { include: { client: true } },
      parties: true,
      responsible: true,
      tasks: { include: { responsible: true, completedBy: true, _count: { select: { comments: true } } }, orderBy: { dueDate: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      receivables: {
        orderBy: { dueDate: "asc" },
        include: { payments: true, reimbursesPayable: { select: { id: true, description: true } } },
      },
      payables: {
        orderBy: { dueDate: "asc" },
        include: { payments: true, reimbursementReceivable: { select: { id: true, amount: true, status: true } } },
      },
      publications: {
        include: { client: true, reads: { where: { userId: viewer.id }, select: { id: true } } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      protocoloLotes: {
        orderBy: { createdAt: "desc" },
        include: {
          criadoPor: { select: { name: true } },
          protocoladoPor: { select: { name: true } },
          comprovante: { select: { id: true, name: true, driveUrl: true } },
          itens: { orderBy: { ordem: "asc" }, include: { attachment: { select: { driveUrl: true } } } },
        },
      },
      // Histórico do botão "Enviar E-mail/WhatsApp" (mesma aba Protocolos) — ver model
      // DocumentoEnvio em prisma/schema.prisma.
      documentoEnvios: {
        orderBy: { enviadoEm: "desc" },
        include: {
          enviadoPor: { select: { name: true } },
          itens: true,
        },
      },
      honorarioLancamentos: {
        orderBy: { createdAt: "desc" },
        include: { parcelas: { orderBy: { dueDate: "asc" }, include: { payments: true } } },
      },
      // Aba "Anotações pessoais" (painel global "Anotações") — sempre filtrada por authorId
      // (é "pessoal": cada usuário só vê/gerencia as anotações que ele mesmo criou, mesmo dentro
      // de um Processo compartilhado pelo escritório inteiro).
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
    },
  });

  if (!c) notFound();

  // Natureza do processo (ver lib/caseNatureza.ts) — decide o rótulo Órgão x Tribunal, os campos
  // de esfera/matéria e se a aba extra "Vigilância" existe (só faz sentido em ADMINISTRATIVO).
  const nat = naturezaOf(c.type);
  const tab =
    (requestedTab === "financeiro" && !hasFinanceAccess) ||
    (requestedTab === "vigilancia" && nat !== "ADMINISTRATIVO") ||
    (requestedTab === "protocolos" && nat === "CASO") ||
    // Caso (extrajudicial) nunca recebe publicação de tribunal/órgão — a aba só existiria pra
    // mostrar "Nenhuma publicação vinculada" pra sempre. Ver mesmo filtro na lista de TABS abaixo.
    (requestedTab === "publicacoes" && nat === "CASO")
      ? "visao-geral"
      : requestedTab;

  const serializedAttachments = c.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const serializedAnotacoes = c.anotacoes.map((a) => ({
    id: a.id,
    content: a.content,
    referenceDate: a.referenceDate.toISOString(),
    createdAt: a.createdAt.toISOString(),
  }));

  const [cases, users, columns, receivableCategories, payableCategories, costCenters, suppliers, storageConnected, workflowTemplates, taskCounts, assessoriasRaw, clients, tribunais, recurringFees, termosVigilancia, bankAccounts, holidays, caseLinks, instanceHistory] = await Promise.all([
    prisma.case.findMany({ where: { officeId: viewer.officeId, status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } }),
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Gate da área de arrastar arquivo: pergunta pelo ARMAZENAMENTO do escritório, não pelo
    // Google. Um escritório em OneDrive ou Dropbox tem armazenamento conectado e mesmo assim
    // não via onde soltar o arquivo, porque a checagem era específica do Drive.
    isStorageConnected(viewer.officeId),
    prisma.workflowTemplate.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.groupBy({
      by: ["publicationId"],
      where: { officeId: viewer.officeId, publicationId: { in: c.publications.map((p) => p.id) }, status: { not: "CANCELADO" } },
      _count: { _all: true },
    }),
    prisma.assessoria.findMany({ where: { officeId: viewer.officeId, status: "ATIVA" }, include: { client: true }, orderBy: { client: { name: "asc" } } }),
    // Novos para o EditCaseModal (edição do Card da Visão Geral): lista de clientes do
    // escritório (para o <select> de Cliente) e o catálogo global de tribunais (para o seletor).
    prisma.client.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.tribunal.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] }),
    prisma.recurringFee.findMany({ where: { caseId: c.id, active: true }, orderBy: { createdAt: "asc" } }),
    // Termos vigiados deste processo (aba Vigilância, só existe para ADMINISTRATIVO) — busca
    // sempre, mesmo fora dessa natureza, porque o custo é desprezível (uma query indexada por
    // caseId) e evita bifurcar a lógica de busca por causa de uma aba condicional.
    prisma.termoVigilancia.findMany({ where: { caseId: c.id, officeId: viewer.officeId }, orderBy: { createdAt: "desc" } }),
    // Contas bancárias do escritório (bloco "Recebimento" do Lançar Honorários, Fase 2) — ainda
    // sem tela de gestão própria (Fase 3); cadastradas por aqui mesmo, via EntityPicker/
    // createBankAccountQuick (ver lib/actions/settings.ts).
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Feriados locais cadastrados pelo escritório (Configurações → Feriados) — usados pela janela
    // de apuração do êxito (ApurarHonorarioModal) para calcular o trânsito em julgado presumido
    // com lib/prazos.ts:addDiasUteis, junto dos feriados nacionais (calculados em código).
    prisma.holiday.findMany({ where: { officeId: viewer.officeId }, select: { date: true } }),
    // Vínculos com outros processos (ver components/processo/CaseLinkField.tsx) — já vem
    // resolvido do ponto de vista deste Case (other/role), pronto para passar ao EditCaseModal.
    getCaseLinks(c.id),
    // Histórico de escaladas de instância (ver InstanciaTribunalPanel.tsx) — mais recente primeiro.
    getCaseInstanceHistory(c.id),
  ]);
  const timelineEvents = buildCaseTimeline(c, instanceHistory);
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name }));
  const holidayDates = holidays.map((h) => ({ date: h.date.toISOString().slice(0, 10) }));
  // Parcelas percentuais "a apurar" deste processo, juntando todos os HonorarioLancamento (pode
  // haver mais de um sobre a mesma base — contratual e sucumbencial, por exemplo) — alimenta tanto
  // o botão "Registrar desfecho" (Porta 2) quanto o aviso ao arquivar (Porta 3, via
  // CaseStatusSelect). jaPagoEmDinheiro é a soma real de FinancePayment das parcelas FIXO do MESMO
  // cabeçalho, mesma conta que o Server Action (lib/actions/apuracao.ts) refaz na apuração de
  // verdade — aqui é só para a prévia ao vivo dentro do modal.
  const pendentesApurar = c.honorarioLancamentos.flatMap((h) => {
    const jaPagoEmDinheiro = h.parcelas
      .filter((x) => x.valueType === "FIXO")
      .reduce((s, x) => s + x.payments.reduce((s2, pm) => s2 + pm.amount, 0), 0);
    return h.parcelas
      .filter((p) => p.status === "A_APURAR")
      .map((p) => ({
        id: p.id,
        description: p.description,
        percentual: p.percentual ?? 0,
        percentualBase: p.percentualBase ?? "VALOR_CAUSA",
        abaterEntrada: p.abaterEntrada,
        jaPagoEmDinheiro,
      }));
  });
  const caseClients = effectiveCaseClients(c);
  const caseParties = effectiveCaseParties(c);
  const taskCountMap = new Map(taskCounts.map((t) => [t.publicationId as string, t._count._all]));
  const serializedPublications = c.publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.reads.length > 0,
    deadlineGenerated: p.deadlineGenerated,
    lawyerTag: p.lawyerTag,
    processNumberRaw: p.processNumberRaw,
    case: { id: c.id, title: c.title, processNumber: c.processNumber },
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    taskCount: taskCountMap.get(p.id) ?? 0,
    assignedToId: p.assignedToId,
    triageStatus: p.triageStatus,
  }));
  const serializedTermos = termosVigilancia.map((t) => ({
    id: t.id,
    termo: t.termo,
    tipo: t.tipo,
    ativo: t.ativo,
    ultimoHitAt: t.ultimoHitAt ? t.ultimoHitAt.toISOString() : null,
  }));
  // Mesmo agrupamento por processo da listagem /publicacoes (ver lib/publicationGrouping.ts) —
  // aqui dentro do Processo, quase todo o grupo já teria o mesmo número normalizado (é a mesma
  // aba de um único processo), mas ainda vale agrupar: evita o mesmo andamento aparecer 2x
  // quando chegou tanto pelo DJEN quanto pelo e-mail do Jusbrasil, por exemplo.
  const publicationGroups = groupPublicationsByProcess(serializedPublications);
  const unreadPublicationsCount = publicationGroups.filter((g) => !g.allRead).length;
  const serializedLotes = c.protocoloLotes.map((lote) => ({
    id: lote.id,
    titulo: lote.titulo,
    status: lote.status,
    numeroProtocolo: lote.numeroProtocolo,
    protocoladoEm: lote.protocoladoEm ? lote.protocoladoEm.toISOString() : null,
    driveFolderId: lote.driveFolderId,
    criadoPor: lote.criadoPor ? { name: lote.criadoPor.name } : null,
    protocoladoPor: lote.protocoladoPor ? { name: lote.protocoladoPor.name } : null,
    comprovante: lote.comprovante ? { id: lote.comprovante.id, name: lote.comprovante.name, driveUrl: lote.comprovante.driveUrl } : null,
    createdAt: lote.createdAt.toISOString(),
    itens: lote.itens.map((item) => ({
      id: item.id,
      ordem: item.ordem,
      attachmentId: item.attachmentId,
      nomeSnapshot: item.nomeSnapshot,
      docTypeSnapshot: item.docTypeSnapshot,
      driveUrl: item.attachment?.driveUrl ?? null,
    })),
  }));
  const serializedEnvios = c.documentoEnvios.map((envio) => ({
    id: envio.id,
    metodo: envio.metodo,
    destinatarioNome: envio.destinatarioNome,
    destinatarioContato: envio.destinatarioContato,
    enviadoEm: envio.enviadoEm.toISOString(),
    enviadoPor: envio.enviadoPor ? { name: envio.enviadoPor.name } : null,
    itens: envio.itens.map((item) => ({
      id: item.id,
      attachmentId: item.attachmentId,
      assessoriaDocumentoId: item.assessoriaDocumentoId,
      nomeSnapshot: item.nomeSnapshot,
      docTypeSnapshot: item.docTypeSnapshot,
    })),
  }));

  // Largura cheia, sem teto e sem centralizar: a área útil já é o que sobra da casca, e ela muda
  // sozinha conforme o modo de visualização — Régua (rail de 62px), Régua com o painel de seção
  // aberto (mais 190px) ou Bancada (sem rail nenhum, ver components/AppShell.tsx). Um `max-w`
  // fixo aqui desperdiçava a tela larga e deixava faixas vazias dos dois lados justamente no
  // modo que existe para caber mais informação.
  return (
    <div className="p-6 w-full animate-fade-in">
      <Link href="/processos" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-tx mb-3">
        <ArrowLeft size={13} /> Processos e Casos
      </Link>

      {anexosFalhos > 0 && (
        <div className="mb-4 border border-urgente/30 bg-urgente-bg rounded-md px-4 py-3 text-sm text-urgente">
          {anexosFalhos === 1
            ? "1 anexo enviado no cadastro não pôde ser processado e não aparece na aba Anexos."
            : `${anexosFalhos} anexos enviados no cadastro não puderam ser processados e não aparecem na aba Anexos.`}{" "}
          Tente anexá-los novamente pela aba Anexos, abaixo.
        </div>
      )}

      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-2xl font-bold text-tx">{c.title}</h1>
        <div className="flex items-center gap-2">
          {/* Abre em aba nova, de propósito: fica junto do site aberto, pronta pra projetar/
              imprimir na frente do cliente sem sair do que já estava sendo feito no Processo
              (mesmo padrão do PeticionarButton logo ao lado). Ver components/reuniao/
              ModoReuniaoView.tsx e app/reuniao/[id]/page.tsx. */}
          <Link
            href={`/reuniao/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            data-tip="Vista de impressão/apresentação para reunião com o cliente"
            data-tip-pos="bottom"
            className="inline-flex items-center gap-1.5 border border-regua text-tx font-semibold text-xs px-3 py-2 hover:bg-sf-apoio transition-colors"
          >
            <Presentation size={14} /> Modo reunião
          </Link>
          <PeticionarButton compact caseId={c.id} />
          <CaseAssessoriaSelect caseId={c.id} assessoriaId={c.assessoriaId} assessorias={assessorias} />
          <Badge color={naturezaBadgeColor[nat]}>{NATUREZA_LABELS[nat]}</Badge>
          <CaseStatusSelect caseId={c.id} status={c.status} hasPendingApuracao={pendentesApurar.length > 0} />
          <DeleteEntityButton
            entityType="CASE"
            entityId={c.id}
            entityLabel={c.title}
            confirmMessage={`Excluir "${c.title}"? Essa ação remove tarefas e comentários vinculados; lançamentos financeiros e publicações serão apenas desvinculados. Se houver honorário, protocolo ou recorrência lançados neste processo, a exclusão será bloqueada até que sejam removidos primeiro.`}
            redirectTo="/processos"
          />
        </div>
      </div>
      <p className="flex flex-wrap items-center text-sm text-tx-2 mb-5">
        {c.processNumber && (
          <>
            <CopyButton
              text={c.processNumber}
              label={c.processNumber}
              className="inline-flex items-center gap-1 tabular-nums hover:text-tx transition-colors"
            />
            <span className="mx-1">·</span>
          </>
        )}
        {c.area && <span>{c.area} · </span>}
        {c.type}
      </p>

      {viewer.supportMasked && (
        <div className="mb-5">
          {/* Quebra-vidro POR REGISTRO (Fase B) — só existe pro suporte, nunca pro escritório
              vendo os próprios dados. Ver lib/breakGlass.ts para as confirmações que precisam
              passar antes de qualquer dado real sair daqui. */}
          <BreakGlassReveal scopeType="CASE" scopeId={c.id} />
        </div>
      )}

      <div className="flex gap-1 border-b border-regua mb-6 overflow-x-auto">
        {TABS.filter(
          (t) =>
            (t.key !== "financeiro" || hasFinanceAccess) &&
            (t.key !== "vigilancia" || nat === "ADMINISTRATIVO") &&
            (t.key !== "protocolos" || nat !== "CASO") &&
            (t.key !== "publicacoes" || nat !== "CASO")
        ).map((t) => (
          <Link
            key={t.key}
            href={`/processos/${c.id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-acao text-tx"
                : "border-transparent text-tx-2 hover:text-tx"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Visão Geral em 3 painéis fixos lado a lado (Dados do processo / Partes e vínculos /
          Linha do tempo) — requisito confirmado pelo cliente na proposta de remodelação do
          portal, não colapsa em menos de 3 no desktop (só empilha em telas estreitas, onde
          320px fixo de painel simplesmente não cabe ao lado dos outros dois). */}
      {tab === "visao-geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_320px] gap-5 items-start">
          <div className="space-y-5">
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between -mt-1 -mr-1">
                <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Dados do processo</h4>
                <EditCaseModal
                  caseData={{
                    id: c.id,
                    title: c.title,
                    type: c.type,
                    responsibleId: c.responsibleId,
                    court: c.court,
                    caseValue: c.caseValue,
                    convictionValue: c.convictionValue,
                    economicBenefitValue: c.economicBenefitValue,
                    tribunalSigla: c.tribunalSigla,
                    tribunalNome: c.tribunalNome,
                    tribunalSistema: c.tribunalSistema,
                    tribunalLink: c.tribunalLink,
                    adminEsfera: c.adminEsfera,
                    adminMateria: c.adminMateria,
                    clients: caseClients.map((cc) => ({ clientId: cc.id, clientName: cc.name, role: cc.role })),
                    parties: caseParties,
                    description: c.description,
                    materias: c.materias,
                    assuntos: c.assuntos,
                    distributedAt: c.distributedAt ? c.distributedAt.toISOString() : null,
                    createdAt: c.createdAt.toISOString(),
                    currentInstance: c.currentInstance,
                    currentInstanceDetail: c.currentInstanceDetail,
                    tribunalOrigemSigla: c.tribunalOrigemSigla,
                    tribunalOrigemNome: c.tribunalOrigemNome,
                    instance: c.instance,
                  }}
                  clients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                  users={users.map((u) => ({ id: u.id, name: u.name }))}
                  tribunais={tribunais}
                  caseLinks={caseLinks}
                  instanceHistory={instanceHistory}
                />
              </div>
              <Field label="Advogado Responsável" value={c.responsible?.name} />
              <Field label="Vara/Comarca" value={c.court} />
              <Field label="Valor da Causa" value={c.caseValue != null ? formatCurrency(c.caseValue) : undefined} />
              <Field label="Proveito Econômico" value={c.economicBenefitValue != null ? formatCurrency(c.economicBenefitValue) : undefined} />
              <Field label="Valor da Condenação" value={c.convictionValue != null ? formatCurrency(c.convictionValue) : undefined} />
              {/* "Órgão" no lugar de "Tribunal" para processo administrativo — mesmo par de campos
                  (tribunalSigla/tribunalNome), só o rótulo muda (ver lib/caseNatureza.ts). */}
              <Field label={nat === "ADMINISTRATIVO" ? "Órgão" : "Tribunal"} value={c.tribunalSigla ? `${c.tribunalSigla} — ${c.tribunalNome ?? ""}` : undefined} />
              <Field label="Sistema" value={c.tribunalSistema} />
              {nat === "ADMINISTRATIVO" && (
                <>
                  <Field label="Esfera" value={c.adminEsfera ? ESFERA_LABELS[c.adminEsfera] || c.adminEsfera : undefined} />
                  <Field label="Matéria" value={c.adminMateria ? MATERIA_LABELS[c.adminMateria] || c.adminMateria : undefined} />
                </>
              )}
              {/* Defesa em profundidade (achado F5 da auditoria) — a Server Action já recusa
                  protocolo inseguro ao salvar (lib/actions/cases.ts), mas um registro gravado
                  antes dessa correção não pode virar link clicável só porque ainda está no banco. */}
              {sanitizeExternalUrl(c.tribunalLink) && (
                <a
                  href={sanitizeExternalUrl(c.tribunalLink)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-marca-tx hover:underline"
                >
                  <ExternalLink size={12} /> Acessar sistema do {nat === "ADMINISTRATIVO" ? "órgão" : "tribunal"}
                </a>
              )}
              {/* Instância atual — só aparece quando preenchida (ver InstanciaTribunalPanel.tsx no
                  Editar Processo, onde fica editável). Tribunal de origem só existe depois de a
                  primeira escalada por recurso acontecer (ver escalarTribunalSuperior). */}
              {c.currentInstance && <Field label="Instância atual" value={instanciaLabel(c.currentInstance)} />}
              {c.currentInstanceDetail && <Field label="Seção/Câmara/Turma" value={c.currentInstanceDetail} />}
              {c.tribunalOrigemSigla && (
                <Field label="Veio de" value={`${instanciaLabel(c.instance)} (${c.tribunalOrigemSigla} — ${c.tribunalOrigemNome ?? ""})`} />
              )}
            </Card>
            <Card className="p-5">
              <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-2">Descrição</h4>
              <p className="text-sm text-tx whitespace-pre-wrap">{c.description || "Sem descrição."}</p>
            </Card>
            {(c.materias.length > 0 || c.assuntos.length > 0 || c.distributedAt) && (
              <Card className="p-5 space-y-2">
                <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-2">Classificação</h4>
                {c.materias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.materias.map((m) => (
                      <span key={m} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-marca-bg text-marca-tx">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                <Field label="Data da distribuição" value={c.distributedAt ? formatDate(c.distributedAt) : undefined} />
                <Field label="Criado no Lúmen" value={formatDate(c.createdAt)} />
                {c.assuntos.filter(Boolean).length > 0 && <Field label="Assuntos" value={c.assuntos.filter(Boolean).join(", ")} />}
              </Card>
            )}
          </div>

          <div className="space-y-5">
            <Card className="p-5 space-y-3">
              <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Partes e vínculos</h4>
              {caseClients.length === 0 ? (
                <Field label="Cliente" value={undefined} />
              ) : (
                caseClients.map((cc, i) => (
                  <Field
                    key={cc.id}
                    label={caseClients.length > 1 ? `Cliente ${i + 1}` : "Cliente"}
                    value={cc.role ? `${cc.name} (${cc.role})` : cc.name}
                  />
                ))
              )}
              {caseParties.length === 0 ? (
                <Field label="Parte Adversa" value={undefined} />
              ) : (
                caseParties.map((p, i) => (
                  <Field
                    key={`${p.name}-${i}`}
                    label={caseParties.length > 1 ? `Parte ${i + 1}` : "Parte Adversa"}
                    value={p.role ? `${p.name} (${partyRoleLabels[p.role] || p.role})` : p.name}
                  />
                ))
              )}
            </Card>
            {caseLinks.length > 0 && (
              <Card className="p-5 space-y-2">
                <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-2">Processos vinculados</h4>
                <div className="space-y-1.5">
                  {caseLinks.map((l) => (
                    <div key={l.linkId} className="flex items-center justify-between gap-2">
                      <Link href={`/processos/${l.other.id}`} className="text-sm text-tx hover:underline truncate">
                        {l.other.title}
                      </Link>
                      {l.role === "PRINCIPAL" && <Badge color="gold">Principal</Badge>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {c.type !== "JUDICIAL" && (
              <Card className="p-5">
                <h4 className="text-sm font-semibold text-tx mb-3">Converter em Processo Judicial</h4>
                <PromoteToJudicialForm caseId={c.id} />
              </Card>
            )}
          </div>

          <Card className="p-5 lg:sticky lg:top-4">
            <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Linha do tempo</h4>
            <CaseTimeline events={timelineEvents} />
          </Card>
        </div>
      )}

      {tab === "atividades" && (
        <div>
          <div className="flex justify-end gap-2 mb-3 flex-wrap">
            <SendCaseEmailModal
              caseId={c.id}
              users={users.filter((u) => u.id !== viewer.id).map((u) => ({ id: u.id, name: u.name, email: u.email }))}
            />
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
              <div className="divide-y divide-regua stagger-in">
                {c.tasks.map((t) => (
                  <TaskActivityRow
                    key={t.id}
                    task={{
                      id: t.id,
                      title: t.title,
                      type: t.type,
                      priority: t.priority,
                      status: t.status,
                      dueDate: t.dueDate.toISOString(),
                      responsibleId: t.responsibleId,
                      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
                      completedBy: t.completedBy ? { id: t.completedBy.id, name: t.completedBy.name } : null,
                      commentCount: t._count.comments,
                    }}
                    users={users.map((u) => ({ id: u.id, name: u.name }))}
                  />
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
            {c.comments.map((cm) => {
              const authorName = authorDisplayName(cm.author, viewer.officeId);
              return (
              <div key={cm.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-grafite-700 text-ouro-500 flex items-center justify-center text-[11px] font-bold shrink-0">
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
          <CommentBox caseId={c.id} users={users.map((u) => ({ id: u.id, name: u.name }))} />
        </Card>
      )}

      {tab === "financeiro" && (
        <div>
          <div className="flex justify-end gap-2 mb-3">
            {pendentesApurar.length > 0 && (
              <ApurarHonorarioModal caseId={c.id} caseTitle={c.title} pendentes={pendentesApurar} holidays={holidayDates} />
            )}
            <LancarHonorariosModal
              categories={receivableCategories}
              clients={caseClients.map((cc) => ({ id: cc.id, name: cc.name }))}
              costCenters={costCenters}
              responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
              bankAccounts={bankAccounts}
              defaultCaseId={c.id}
              defaultClientId={c.clientId ?? undefined}
              defaultResponsibleId={viewer.id}
              bases={{ caseValue: c.caseValue, economicBenefitValue: c.economicBenefitValue, convictionValue: c.convictionValue, agreementValue: c.agreementValue }}
              alreadyReceivedForCase={totalRecebidoNoProcesso(c.receivables)}
              prefill={honorarioPretendidoPrefill}
              autoOpen={Boolean(honorarioPretendidoPrefill)}
            />
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="px-5 py-3 border-b border-regua">
              <h4 className="text-sm font-semibold text-tx">Contas a Receber</h4>
            </div>
            {recurringFees.map((fee) => (
              <RecurringFeeCard key={fee.id} fee={{ id: fee.id, description: fee.description, amount: fee.amount, dueDay: fee.dueDay }} />
            ))}
            {c.honorarioLancamentos.map((h) => (
              <HonorarioLancamentoCard
                key={h.id}
                lancamento={{
                  id: h.id,
                  valorTotalIndicado: h.valorTotalIndicado,
                  payerType: h.payerType,
                  payerName: h.payerName,
                  parcelas: h.parcelas.map((p) => ({
                    id: p.id,
                    description: p.description,
                    amount: p.amount,
                    discount: p.discount,
                    surcharge: p.surcharge,
                    paidSum: p.payments.reduce((s, x) => s + x.amount, 0),
                    dueDate: p.dueDate.toISOString(),
                    noDueDate: p.noDueDate,
                    status: p.status,
                    paidAmount: p.paidAmount,
                    valueType: p.valueType,
                    percentual: p.percentual,
                    percentualBase: p.percentualBase,
                    vinculadoAoTotal: p.vinculadoAoTotal,
                    isSuccessPortion: p.isSuccessPortion,
                    installmentBoleto: p.installmentBoleto,
                    payerType: p.payerType,
                    payerName: p.payerName,
                    abaterEntrada: p.abaterEntrada,
                  })),
                }}
                bases={{ caseValue: c.caseValue, economicBenefitValue: c.economicBenefitValue, convictionValue: c.convictionValue, agreementValue: c.agreementValue }}
                bankAccounts={bankAccounts}
              />
            ))}
            {c.receivables.filter((r) => !r.honorarioLancamentoId).length === 0 && c.honorarioLancamentos.length === 0 && recurringFees.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-regua">
                {c.receivables.filter((r) => !r.honorarioLancamentoId).map((r) => {
                  const isApurar = r.status === "A_APURAR";
                  const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
                  const paidSum = r.payments.reduce((s, x) => s + x.amount, 0);
                  const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, paidSum);
                  return (
                  <div key={r.id} id={`receivable-${r.id}`} className="flex justify-between items-center px-5 py-3 target:bg-acao-bg scroll-mt-20">
                    <div>
                      <p className="text-sm text-tx">{r.description}</p>
                      <p className="text-xs text-tx-2">
                        {r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}
                        {r.payerType !== "CLIENTE" && (
                          <> · pagador: {r.payerType === "OUTRO" ? r.payerName || "Outro" : r.payerType === "ADVERSA" ? "Parte adversa" : r.payerType}</>
                        )}
                      </p>
                      {r.reimbursesPayable && (
                        <p className="mt-1">
                          <Badge color="gold">↳ Reembolso de despesa · {r.reimbursesPayable.description}</Badge>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-tx tabular-nums">{isApurar ? "—" : formatCurrency(liquido)}</p>
                        {r.status === "PARCIAL" && <p className="text-[11px] text-tx-2 tabular-nums">saldo {formatCurrency(saldo)}</p>}
                        <Badge color={r.status === "PAGO" ? "green" : r.status === "ATRASADO" ? "red" : isApurar ? "slate" : "amber"}>
                          {isApurar ? "A apurar" : r.status}
                        </Badge>
                      </div>
                      {!isApurar && (
                        <SettleButton id={r.id} kind="receivable" liquido={liquido} alreadyPaid={paidSum} status={r.status} bankAccounts={bankAccounts} />
                      )}
                      <EditReceivableModal
                        receivable={{
                          id: r.id,
                          description: r.description,
                          amount: r.amount,
                          discount: r.discount,
                          surcharge: r.surcharge,
                          dueDate: r.dueDate.toISOString(),
                          noDueDate: r.noDueDate,
                          kind: r.kind,
                          categoryId: r.categoryId,
                          costCenterId: r.costCenterId,
                          clientId: r.clientId,
                          caseId: r.caseId,
                          responsibleId: r.responsibleId,
                          documentType: r.documentType,
                          documentNumber: r.documentNumber,
                          issueDate: r.issueDate ? r.issueDate.toISOString() : null,
                          installmentBoleto: r.installmentBoleto,
                          installmentNumber: r.installmentNumber,
                          installmentTotal: r.installmentTotal,
                          status: r.status,
                          paidAmount: r.paidAmount,
                          paidDate: r.paidDate ? r.paidDate.toISOString() : null,
                          paymentMethod: r.paymentMethod,
                          paymentReceiptNumber: r.paymentReceiptNumber,
                          receiptDriveUrl: r.receiptDriveUrl,
                          receiptFileName: r.receiptFileName,
                        }}
                        categories={receivableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        clients={caseClients.map((cc) => ({ id: cc.id, name: cc.name }))}
                        costCenters={costCenters}
                        responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
                      />
                      <DeleteEntityButton
                        entityType="RECEIVABLE"
                        entityId={r.id}
                        entityLabel={r.description}
                        confirmMessage={`Excluir o lançamento "${r.description}"?`}
                        groupKind={financeGroupKind(r)}
                        linkedReimbursement={
                          r.reimbursesPayable ? { direction: "receivableReimbursesPayable", description: r.reimbursesPayable.description } : null
                        }
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card>
            <div className="px-5 py-3 border-b border-regua flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-tx">Contas a Pagar (custas etc.)</h4>
              <NewPayableModal
                categories={payableCategories}
                cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                suppliers={suppliers}
                teamMembers={users.map((u) => ({ id: u.id, name: u.name }))}
                clients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                costCenters={costCenters}
                responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
                bankAccounts={bankAccounts}
                defaultResponsibleId={viewer.id}
                defaultCaseId={c.id}
              />
            </div>
            {c.payables.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-regua">
                {c.payables.map((p) => {
                  const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
                  const paidSum = p.payments.reduce((s, x) => s + x.amount, 0);
                  const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, paidSum);
                  return (
                  <div key={p.id} id={`payable-${p.id}`} className="flex justify-between items-center px-5 py-3 target:bg-acao-bg scroll-mt-20">
                    <div>
                      <p className="text-sm text-tx">{p.description}</p>
                      <p className="text-xs text-tx-2">{p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}</p>
                      {p.reimbursementReceivable && (
                        <p className="mt-1">
                          <Badge color={p.reimbursementReceivable.status === "PAGO" ? "green" : p.reimbursementReceivable.status === "ATRASADO" ? "red" : "amber"}>
                            ↳ Reembolso vinculado · {formatCurrency(p.reimbursementReceivable.amount)} · {p.reimbursementReceivable.status}
                          </Badge>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-tx tabular-nums">{formatCurrency(liquido)}</p>
                        {p.status === "PARCIAL" && <p className="text-[11px] text-tx-2 tabular-nums">saldo {formatCurrency(saldo)}</p>}
                        <Badge color={p.status === "PAGO" ? "green" : p.status === "ATRASADO" ? "red" : "amber"}>{p.status}</Badge>
                      </div>
                      <SettleButton id={p.id} kind="payable" liquido={liquido} alreadyPaid={paidSum} status={p.status} bankAccounts={bankAccounts} />
                      <EditPayableModal
                        payable={{
                          id: p.id,
                          description: p.description,
                          supplierId: p.supplierId,
                          payeeUserId: p.payeeUserId,
                          payeeClientId: p.payeeClientId,
                          amount: p.amount,
                          discount: p.discount,
                          surcharge: p.surcharge,
                          dueDate: p.dueDate.toISOString(),
                          noDueDate: p.noDueDate,
                          categoryId: p.categoryId,
                          costCenterId: p.costCenterId,
                          caseId: p.caseId,
                          responsibleId: p.responsibleId,
                          documentType: p.documentType,
                          documentNumber: p.documentNumber,
                          issueDate: p.issueDate ? p.issueDate.toISOString() : null,
                          installmentBoleto: p.installmentBoleto,
                          installmentNumber: p.installmentNumber,
                          installmentTotal: p.installmentTotal,
                          status: p.status,
                          paidAmount: p.paidAmount,
                          paidDate: p.paidDate ? p.paidDate.toISOString() : null,
                          paymentMethod: p.paymentMethod,
                          paymentReceiptNumber: p.paymentReceiptNumber,
                          kind: p.kind,
                          expensePayer: p.expensePayer,
                          reimbursementReceivable: p.reimbursementReceivable,
                          receiptDriveUrl: p.receiptDriveUrl,
                          receiptFileName: p.receiptFileName,
                        }}
                        categories={payableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        suppliers={suppliers}
                        teamMembers={users.map((u) => ({ id: u.id, name: u.name }))}
                        clients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                        costCenters={costCenters}
                        responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
                      />
                      <DeleteEntityButton
                        entityType="PAYABLE"
                        entityId={p.id}
                        entityLabel={p.description}
                        confirmMessage={`Excluir o lançamento "${p.description}"?`}
                        groupKind={financeGroupKind(p)}
                        linkedReimbursement={
                          p.reimbursementReceivable
                            ? { direction: "payableHasReimbursement", amount: p.reimbursementReceivable.amount, status: p.reimbursementReceivable.status }
                            : null
                        }
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        </div>
      )}

      {tab === "publicacoes" && (
        <div>
          {unreadPublicationsCount > 0 && (
            <div className="flex justify-end mb-3">
              <MarkAllPublicationsReadButton count={unreadPublicationsCount} caseId={c.id} />
            </div>
          )}
          <Card>
            {publicationGroups.length === 0 ? (
              <EmptyState title="Nenhuma publicação vinculada" />
            ) : (
              <PublicationsList groups={publicationGroups} highlightNew={false} users={users.map((u) => ({ id: u.id, name: u.name }))} />
            )}
          </Card>
        </div>
      )}

      {tab === "anexos" && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            {/* Caso (extrajudicial) não tem aba Protocolos (não protocola em tribunal/órgão — ver
                filtro de TABS acima), que é onde "Enviar E-mail/WhatsApp" mora para
                Judicial/Administrativo (ver ProtocolosTab.tsx). Sem isto, um Caso não tinha
                NENHUM jeito de mandar documento pro cliente por e-mail/WhatsApp. */}
            {nat === "CASO" && (
              <EnviarDocumentosButton entity={{ tipo: "CASE", id: c.id, titulo: c.title }} attachments={serializedAttachments} />
            )}
            <GerarDocumentoButton caseId={c.id} />
          </div>
          <Card className="p-5">
            <AttachmentList attachments={serializedAttachments} caseId={c.id} driveConnected={storageConnected} tribunais={tribunais} />
          </Card>
          {nat === "CASO" && <HistoricoEnvios entity={{ tipo: "CASE", id: c.id, titulo: c.title }} envios={serializedEnvios} />}
        </div>
      )}

      {tab === "protocolos" && (
        <Card className="p-5">
          <ProtocolosTab
            caseId={c.id}
            caseTitle={c.title}
            attachments={serializedAttachments.map((a) => ({ id: a.id, name: a.name, docType: a.docType, driveUrl: a.driveUrl }))}
            lotes={serializedLotes}
            envios={serializedEnvios}
            driveConnected={storageConnected}
          />
        </Card>
      )}

      {tab === "vigilancia" && (
        <Card className="p-5">
          <TermosVigilanciaPanel caseId={c.id} termos={serializedTermos} />
        </Card>
      )}

      {tab === "anotacoes-pessoais" && (
        <div>
          <p className="text-xs italic text-tx-2 mb-3">
            Anotações que você criou vinculadas a este processo (painel Anotações, ícone na borda direita da tela) — visíveis só para você.
          </p>
          <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-regua pb-2">
      <span className="text-tx-2">{label}</span>
      <span className="font-medium text-tx text-right tabular-nums">{value || "—"}</span>
    </div>
  );
}
