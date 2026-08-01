import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatCurrency, formatDate, EmptyState } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import EditReceivableModal from "@/components/EditReceivableModal";
import LancarHonorariosModal from "@/components/honorarios/LancarHonorariosModal";
import ApurarHonorarioModal from "@/components/honorarios/ApurarHonorarioModal";
import HonorarioLancamentoCard from "@/components/honorarios/HonorarioLancamentoCard";
import EditPayableModal from "@/components/EditPayableModal";
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
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getLeafCategoryOptions } from "@/lib/categories";
import { getDriveStatus } from "@/lib/googleDrive";
import { getCurrentUser } from "@/lib/currentUser";
import { effectiveCaseClients, effectiveCaseParties, partyRoleLabels } from "@/lib/caseParties";
import { naturezaOf, NATUREZA_LABELS, ESFERA_LABELS, MATERIA_LABELS } from "@/lib/caseNatureza";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";

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
      tasks: { include: { responsible: true, _count: { select: { comments: true } } }, orderBy: { dueDate: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      receivables: { orderBy: { dueDate: "asc" }, include: { payments: true } },
      payables: { orderBy: { dueDate: "asc" }, include: { payments: true } },
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
      honorarioLancamentos: {
        orderBy: { createdAt: "desc" },
        include: { parcelas: { orderBy: { dueDate: "asc" }, include: { payments: true } } },
      },
    },
  });

  if (!c) notFound();

  // Natureza do processo (ver lib/caseNatureza.ts) — decide o rótulo Órgão x Tribunal, os campos
  // de esfera/matéria e se a aba extra "Vigilância" existe (só faz sentido em ADMINISTRATIVO).
  const nat = naturezaOf(c.type);
  const tab =
    (requestedTab === "financeiro" && !hasFinanceAccess) ||
    (requestedTab === "vigilancia" && nat !== "ADMINISTRATIVO") ||
    (requestedTab === "protocolos" && nat === "CASO")
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

  const [cases, users, columns, receivableCategories, payableCategories, costCenters, suppliers, driveStatus, workflowTemplates, taskCounts, assessoriasRaw, clients, tribunais, recurringFees, termosVigilancia, bankAccounts, holidays] = await Promise.all([
    prisma.case.findMany({ where: { officeId: viewer.officeId, status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } }),
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getDriveStatus(viewer.officeId),
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
  ]);
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
  const unreadPublicationsCount = c.publications.filter((p) => p.reads.length === 0).length;
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

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/processos" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 mb-3">
        <ArrowLeft size={13} /> Processos e Casos
      </Link>

      {anexosFalhos > 0 && (
        <div className="mb-4 rounded-lg border border-bordo-700/25 dark:border-bordo-400/25 bg-bordo-100/40 dark:bg-bordo-700/10 px-4 py-3 text-sm text-bordo-700 dark:text-bordo-400">
          {anexosFalhos === 1
            ? "1 anexo enviado no cadastro não pôde ser processado e não aparece na aba Anexos."
            : `${anexosFalhos} anexos enviados no cadastro não puderam ser processados e não aparecem na aba Anexos.`}{" "}
          Tente anexá-los novamente pela aba Anexos, abaixo.
        </div>
      )}

      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{c.title}</h1>
        <div className="flex items-center gap-2">
          <PeticionarButton compact caseId={c.id} />
          <CaseAssessoriaSelect caseId={c.id} assessoriaId={c.assessoriaId} assessorias={assessorias} />
          <Badge color={naturezaBadgeColor[nat]}>{NATUREZA_LABELS[nat]}</Badge>
          <CaseStatusSelect caseId={c.id} status={c.status} hasPendingApuracao={pendentesApurar.length > 0} />
          <DeleteEntityButton entityType="CASE" entityId={c.id} entityLabel={c.title} confirmMessage={`Excluir "${c.title}"? Essa ação remove tarefas e comentários vinculados; lançamentos financeiros e publicações serão apenas desvinculados.`} />
        </div>
      </div>
      <p className="flex flex-wrap items-center text-sm text-navy-800/50 dark:text-cream-50/50 mb-5">
        {c.processNumber && (
          <>
            <CopyButton
              text={c.processNumber}
              label={c.processNumber}
              className="inline-flex items-center gap-1 hover:text-navy-900 dark:hover:text-cream-50 transition-colors"
            />
            <span className="mx-1">·</span>
          </>
        )}
        {c.area && <span>{c.area} · </span>}
        {c.type}
      </p>

      <div className="flex gap-1 border-b border-navy-800/10 dark:border-white/10 mb-6 overflow-x-auto">
        {TABS.filter(
          (t) =>
            (t.key !== "financeiro" || hasFinanceAccess) &&
            (t.key !== "vigilancia" || nat === "ADMINISTRATIVO") &&
            (t.key !== "protocolos" || nat !== "CASO")
        ).map((t) => (
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
            <div className="flex items-center justify-between -mt-1 -mr-1">
              <h4 className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide">Dados do Processo</h4>
              <EditCaseModal
                caseData={{
                  id: c.id,
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
                }}
                clients={clients.map((cl) => ({ id: cl.id, name: cl.name }))}
                users={users.map((u) => ({ id: u.id, name: u.name }))}
                tribunais={tribunais}
              />
            </div>
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
            {c.tribunalLink && (
              <a
                href={c.tribunalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline"
              >
                <ExternalLink size={12} /> Acessar sistema do {nat === "ADMINISTRATIVO" ? "órgão" : "tribunal"}
              </a>
            )}
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
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
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
              alreadyReceivedForCase={c.receivables.filter((r) => r.status === "PAGO").reduce((s, r) => s + (r.paidAmount ?? r.amount), 0)}
              prefill={honorarioPretendidoPrefill}
              autoOpen={Boolean(honorarioPretendidoPrefill)}
            />
          </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="px-5 py-3 border-b border-navy-800/8 dark:border-white/10">
              <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Contas a Receber</h4>
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
                  })),
                }}
                bases={{ caseValue: c.caseValue, economicBenefitValue: c.economicBenefitValue, convictionValue: c.convictionValue, agreementValue: c.agreementValue }}
                bankAccounts={bankAccounts}
              />
            ))}
            {c.receivables.filter((r) => !r.honorarioLancamentoId).length === 0 && c.honorarioLancamentos.length === 0 && recurringFees.length === 0 ? (
              <EmptyState title="Nenhum lançamento" />
            ) : (
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {c.receivables.filter((r) => !r.honorarioLancamentoId).map((r) => {
                  const isApurar = r.status === "A_APURAR";
                  const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
                  const paidSum = r.payments.reduce((s, x) => s + x.amount, 0);
                  const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, paidSum);
                  return (
                  <div key={r.id} className="flex justify-between items-center px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900 dark:text-cream-50">{r.description}</p>
                      <p className="text-xs text-navy-800/40 dark:text-cream-50/40">
                        {r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}
                        {r.payerType !== "CLIENTE" && (
                          <> · pagador: {r.payerType === "OUTRO" ? r.payerName || "Outro" : r.payerType === "ADVERSA" ? "Parte adversa" : r.payerType}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{isApurar ? "—" : formatCurrency(liquido)}</p>
                        {r.status === "PARCIAL" && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">saldo {formatCurrency(saldo)}</p>}
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
                        }}
                        categories={receivableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        clients={caseClients.map((cc) => ({ id: cc.id, name: cc.name }))}
                        costCenters={costCenters}
                        responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
                      />
                      <DeleteEntityButton entityType="RECEIVABLE" entityId={r.id} entityLabel={r.description} confirmMessage={`Excluir o lançamento "${r.description}"?`} />
                    </div>
                  </div>
                  );
                })}
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
                {c.payables.map((p) => {
                  const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
                  const paidSum = p.payments.reduce((s, x) => s + x.amount, 0);
                  const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, paidSum);
                  return (
                  <div key={p.id} className="flex justify-between items-center px-5 py-3">
                    <div>
                      <p className="text-sm text-navy-900 dark:text-cream-50">{p.description}</p>
                      <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{formatCurrency(liquido)}</p>
                        {p.status === "PARCIAL" && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">saldo {formatCurrency(saldo)}</p>}
                        <Badge color={p.status === "PAGO" ? "green" : p.status === "ATRASADO" ? "red" : "amber"}>{p.status}</Badge>
                      </div>
                      <SettleButton id={p.id} kind="payable" liquido={liquido} alreadyPaid={paidSum} status={p.status} bankAccounts={bankAccounts} />
                      <EditPayableModal
                        payable={{
                          id: p.id,
                          description: p.description,
                          supplierId: p.supplierId,
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
                        }}
                        categories={payableCategories}
                        cases={cases.map((x) => ({ id: x.id, name: x.title }))}
                        suppliers={suppliers}
                        costCenters={costCenters}
                        responsibles={users.map((u) => ({ id: u.id, name: u.name }))}
                      />
                      <DeleteEntityButton entityType="PAYABLE" entityId={p.id} entityLabel={p.description} confirmMessage={`Excluir o lançamento "${p.description}"?`} />
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
            {serializedPublications.length === 0 ? (
              <EmptyState title="Nenhuma publicação vinculada" />
            ) : (
              <PublicationsList publications={serializedPublications} highlightNew={false} />
            )}
          </Card>
        </div>
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

      {tab === "protocolos" && (
        <Card className="p-5">
          <ProtocolosTab
            caseId={c.id}
            attachments={serializedAttachments.map((a) => ({ id: a.id, name: a.name, docType: a.docType }))}
            lotes={serializedLotes}
            driveConnected={driveStatus.connected}
          />
        </Card>
      )}

      {tab === "vigilancia" && (
        <Card className="p-5">
          <TermosVigilanciaPanel caseId={c.id} termos={serializedTermos} />
        </Card>
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
