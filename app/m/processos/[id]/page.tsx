import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState, formatCurrency, formatDate, formatCalendarDate, taskTypeLabels, taskTypeColors } from "@/components/ui";
import MobileCommentForm from "@/components/mobile/MobileCommentForm";
import MobileNewTaskForm from "@/components/mobile/MobileNewTaskForm";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";
import MobileTaskToggle from "@/components/mobile/MobileTaskToggle";
import MobileTaskResponsibleSelect from "@/components/mobile/MobileTaskResponsibleSelect";
import MobileCaseFinanceTab from "@/components/mobile/MobileCaseFinanceTab";
import MobileCaseAttachmentsTab from "@/components/mobile/MobileCaseAttachmentsTab";
import MobileCaseProtocolosTab from "@/components/mobile/MobileCaseProtocolosTab";
import MobileCaseVigilanciaTab from "@/components/mobile/MobileCaseVigilanciaTab";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import MobileNovaAnotacaoForm from "@/components/mobile/MobileNovaAnotacaoForm";
import CopyButton from "@/components/CopyButton";
import EditCaseModal from "@/components/EditCaseModal";
import CaseAssessoriaSelect from "@/components/CaseAssessoriaSelect";
import { effectiveCaseClients, effectiveCaseParties, partyRoleLabels } from "@/lib/caseParties";
import { naturezaOf, NATUREZA_LABELS, ESFERA_LABELS, MATERIA_LABELS } from "@/lib/caseNatureza";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";
import type { AnotacaoLinkType } from "@/lib/anotacoes";
import NaturezaBadge from "@/components/mobile/NaturezaBadge";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { instanciaLabel } from "@/lib/caseInstance";
import { getCaseLinks } from "@/lib/actions/caseLinks";
import { getCaseInstanceHistory } from "@/lib/actions/cases";

export const dynamic = "force-dynamic";

// Mesmas cores de app/(app)/processos/page.tsx (statusColors) — repetido aqui em vez de
// importado porque aquele arquivo não exporta a constante e não faz parte do escopo deste
// agente (app/m/** e components/mobile/**, ver instruções da tarefa).
const statusColors: Record<string, "green" | "amber" | "slate" | "red"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "red",
};
// Rótulo capitalizado (mesma tabela de app/m/assessoria/[id]/page.tsx para o mesmo enum
// Case.status) — evita repetir aqui o bug do enum cru em caixa alta corrigido em Despesas
// (DESIGN-SYSTEM.md §10) para outro campo de status.
const statusLabels: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

// Mesmas oito abas do site (app/(app)/processos/[id]/page.tsx), mesmas regras de visibilidade
// por acesso financeiro/natureza — ver o `.filter` logo abaixo de TABS. Antes desta fase o
// mobile era uma única tela corrida (Visão Geral parcial + Próximas tarefas + Publicações +
// Comentários): com Financeiro/Anexos/Protocolos/Vigilância inteiros entrando de uma vez, uma
// tela corrida vira quilométrica no polegar — abas em pílulas horizontais (mesmo padrão já usado
// em app/m/financeiro/receitas/page.tsx) resolvem isso sem inventar um componente novo de
// navegação: só uma tab por vez ocupa a tela, e trocar de aba é só um toque, sem rolar.
const TABS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "atividades", label: "Atividades" },
  { key: "comentarios", label: "Comentários" },
  { key: "financeiro", label: "Financeiro" },
  { key: "publicacoes", label: "Publicações" },
  { key: "anexos", label: "Anexos" },
  { key: "protocolos", label: "Protocolos" },
  { key: "vigilancia", label: "Vigilância" },
  // Anotações pessoais (painel global "Anotações" no site desktop) — no mobile, escopo reduzido
  // (ver components/mobile/MobileNovaAnotacaoForm.tsx): mostra as já criadas e permite criar UMA
  // nova por vez, com um formulário simples (textarea, sem editor rico), já vinculada a este
  // processo (sem chip/seletor — o vínculo já é este Processo/Caso).
  { key: "anotacoes-pessoais", label: "Anotações pessoais" },
];

export default async function MobileCaseDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; anexosFalhos?: string };
}) {
  const anexosFalhos = Number(searchParams.anexosFalhos) || 0;
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  // clients e tribunais alimentam o <select> de Cliente e o TribunalFields dentro do
  // EditCaseModal; os demais (receivables/payables/publications/attachments/protocoloLotes/
  // honorarioLancamentos) são as quatro seções novas desta fase — mesmas queries da versão
  // desktop (app/(app)/processos/[id]/page.tsx).
  const [c, publications, users, clients, tribunais, recurringFees, termosVigilancia, bankAccounts, assessoriasRaw, caseLinks, instanceHistory] = await Promise.all([
    prisma.case.findFirst({
      where: { id: params.id, officeId: viewer.officeId },
      include: {
        client: true,
        clients: { include: { client: true } },
        parties: true,
        responsible: true,
        tasks: {
          where: { status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
          orderBy: { dueDate: "asc" },
          take: 20,
        },
        comments: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 15 },
        receivables: {
          orderBy: { dueDate: "asc" },
          include: { payments: { select: { amount: true } }, reimbursesPayable: { select: { id: true, description: true } } },
        },
        payables: {
          orderBy: { dueDate: "asc" },
          include: { payments: { select: { amount: true } }, reimbursementReceivable: { select: { id: true, amount: true, status: true } } },
        },
        attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
        protocoloLotes: {
          orderBy: { createdAt: "desc" },
          include: { comprovante: { select: { id: true, name: true, driveUrl: true } }, itens: { orderBy: { ordem: "asc" }, select: { id: true, nomeSnapshot: true, attachment: { select: { driveUrl: true } } } } },
        },
        // Histórico do botão "Enviar E-mail/WhatsApp" (aba Protocolos) — só leitura no mobile,
        // mesma ideia de protocoloLotes acima (ver components/mobile/MobileCaseProtocolosTab.tsx).
        documentoEnvios: {
          orderBy: { enviadoEm: "desc" },
          include: { enviadoPor: { select: { name: true } }, itens: { select: { id: true, nomeSnapshot: true, docTypeSnapshot: true } } },
        },
        honorarioLancamentos: {
          orderBy: { createdAt: "desc" },
          include: { parcelas: { orderBy: { dueDate: "asc" }, include: { payments: { select: { amount: true } } } } },
        },
        anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
      },
    }),
    prisma.publication.findMany({
      where: { caseId: params.id, officeId: viewer.officeId },
      include: { reads: { where: { userId: viewer.id }, select: { userId: true } } },
      orderBy: { publishedAt: "desc" },
      take: 15,
    }),
    prisma.user.findMany({
      where: { active: true, officeId: viewer.officeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.tribunal.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] }),
    prisma.recurringFee.findMany({ where: { caseId: params.id, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.termoVigilancia.findMany({ where: { caseId: params.id, officeId: viewer.officeId }, orderBy: { createdAt: "desc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assessoria.findMany({ where: { officeId: viewer.officeId, status: "ATIVA" }, include: { client: true }, orderBy: { client: { name: "asc" } } }),
    // Vínculos com outros processos (ver components/processo/CaseLinkField.tsx) — usa params.id
    // direto em vez de c.id porque c só resolve depois deste Promise.all (mesmo id de qualquer forma).
    getCaseLinks(params.id),
    getCaseInstanceHistory(params.id),
  ]);

  if (!c) notFound();

  const natureza = naturezaOf(c.type);
  const requestedTab = searchParams.tab || "visao-geral";
  // Mesmo fallback do site: aba pedida mas indisponível (sem acesso financeiro, natureza que não
  // tem Vigilância/Protocolos) cai em Visão Geral em vez de mostrar uma tela vazia/quebrada.
  const tab =
    (requestedTab === "financeiro" && !hasFinanceAccess) ||
    (requestedTab === "vigilancia" && natureza !== "ADMINISTRATIVO") ||
    (requestedTab === "protocolos" && natureza === "CASO") ||
    // Caso (extrajudicial) nunca recebe publicação de tribunal/órgão — mesmo motivo do site
    // desktop (app/(app)/processos/[id]/page.tsx).
    (requestedTab === "publicacoes" && natureza === "CASO")
      ? "visao-geral"
      : requestedTab;

  const caseClients = effectiveCaseClients(c);
  const caseParties = effectiveCaseParties(c);
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name }));

  const serializedPublications = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.reads.length > 0,
    caseId: c.id,
    caseTitle: c.title,
    processNumberRaw: p.processNumberRaw,
  }));
  // Mesmo agrupamento por processo da Início/Publicações mobile (ver
  // lib/publicationGrouping.ts) — junta num só card a mesma publicação/andamento chegada por
  // mais de uma fonte (DJEN, Datajud, e-mail do Jusbrasil...).
  const publicationGroups = groupPublicationsByProcess(serializedPublications);

  const serializedAttachments = c.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const serializedLotes = c.protocoloLotes.map((lote) => ({
    id: lote.id,
    titulo: lote.titulo,
    status: lote.status,
    numeroProtocolo: lote.numeroProtocolo,
    protocoladoEm: lote.protocoladoEm ? lote.protocoladoEm.toISOString() : null,
    driveFolderId: lote.driveFolderId,
    comprovante: lote.comprovante ? { id: lote.comprovante.id, name: lote.comprovante.name, driveUrl: lote.comprovante.driveUrl } : null,
    createdAt: lote.createdAt.toISOString(),
    itens: lote.itens.map((item) => ({ id: item.id, nomeSnapshot: item.nomeSnapshot, driveUrl: item.attachment?.driveUrl ?? null })),
  }));

  const serializedEnvios = c.documentoEnvios.map((envio) => ({
    id: envio.id,
    metodo: envio.metodo,
    destinatarioNome: envio.destinatarioNome,
    destinatarioContato: envio.destinatarioContato,
    enviadoEm: envio.enviadoEm.toISOString(),
    enviadoPor: envio.enviadoPor ? { name: envio.enviadoPor.name } : null,
    itens: envio.itens.map((item) => ({ id: item.id, nomeSnapshot: item.nomeSnapshot, docTypeSnapshot: item.docTypeSnapshot })),
  }));

  const serializedTermos = termosVigilancia.map((t) => ({
    id: t.id,
    termo: t.termo,
    tipo: t.tipo,
    ativo: t.ativo,
    ultimoHitAt: t.ultimoHitAt ? t.ultimoHitAt.toISOString() : null,
  }));

  const serializedHonorarioLancamentos = c.honorarioLancamentos.map((h) => ({
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
      valueType: p.valueType,
      percentual: p.percentual,
      percentualBase: p.percentualBase,
      installmentBoleto: p.installmentBoleto,
      payerType: p.payerType,
      payerName: p.payerName,
    })),
  }));

  const serializedAnotacoes = c.anotacoes.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));
  // Mesmo chip que o painel desktop usaria para este processo, derivado da natureza (ver
  // lib/caseNatureza.ts) — no mobile não existe seletor de chip, o vínculo já é este item.
  const anotacaoLinkType: AnotacaoLinkType = natureza === "JUDICIAL" ? "PROCESSO_JUDICIAL" : natureza === "ADMINISTRATIVO" ? "PROCESSO_ADMINISTRATIVO" : "CASO";

  const visibleTabs = TABS.filter(
    (t) =>
      (t.key !== "financeiro" || hasFinanceAccess) &&
      (t.key !== "vigilancia" || natureza === "ADMINISTRATIVO") &&
      (t.key !== "protocolos" || natureza !== "CASO") &&
      (t.key !== "publicacoes" || natureza !== "CASO")
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m/processos"
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> Processos
      </Link>

      {anexosFalhos > 0 && (
        <div className="rounded-lg border border-urgente bg-urgente-bg px-3 py-2.5 text-xs text-urgente">
          {anexosFalhos === 1
            ? "1 anexo enviado no cadastro não pôde ser processado."
            : `${anexosFalhos} anexos enviados no cadastro não puderam ser processados.`}{" "}
          Tente novamente na aba Anexos.
        </div>
      )}

      <div>
        {/* Etiqueta de natureza + status + assessoria, mesmo trio de pílulas do cabeçalho
            desktop (app/(app)/processos/[id]/page.tsx) — CaseAssessoriaSelect é o mesmo
            componente de lá, reaproveitado tal qual (não é exclusivo do outro agente). */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <NaturezaBadge natureza={natureza} />
          <Badge color={statusColors[c.status] ?? "slate"}>{statusLabels[c.status] ?? c.status}</Badge>
          <CaseAssessoriaSelect caseId={c.id} assessoriaId={c.assessoriaId} assessorias={assessorias} />
        </div>
        <h1 className="text-lg font-bold text-tx leading-tight">{c.title}</h1>
        <p className="flex flex-wrap items-center text-xs text-tx-2 mt-1">
          {c.processNumber && (
            <>
              <CopyButton
                text={c.processNumber}
                label={c.processNumber}
                className="inline-flex items-center gap-1 hover:text-tx transition-colors"
              />
              <span className="mx-1">·</span>
            </>
          )}
          {natureza === "ADMINISTRATIVO" ? (
            <>
              {c.tribunalSigla && <span>Órgão: {c.tribunalSigla} · </span>}
              {c.adminEsfera && <span>{ESFERA_LABELS[c.adminEsfera]} · </span>}
              {c.adminMateria && <span>{MATERIA_LABELS[c.adminMateria]}</span>}
            </>
          ) : (
            <>
              {c.area && <span>{c.area} · </span>}
              {NATUREZA_LABELS[natureza]}
            </>
          )}
        </p>
      </div>

      {/* Pílulas de aba — mesmo padrão de TabLink já usado em app/m/financeiro/receitas/page.tsx,
          rolagem horizontal quando não couber tudo na largura da tela. */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={`/m/processos/${c.id}?tab=${t.key}`}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              tab === t.key
                ? "bg-acao text-acao-tx"
                : "bg-sf text-tx-2 border border-regua"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "visao-geral" && (
        <Card className="p-4 space-y-2.5">
          {/* Mesma estrutura do Card "Dados do Processo" no desktop: cabeçalho com o ícone de
              lápis do EditCaseModal no canto, abrindo a edição completa — agora com
              type/convictionValue/economicBenefitValue/adminEsfera/adminMateria também
              preenchidos (antes desta fase esses cinco campos não chegavam ao modal no mobile,
              então editar Esfera/Matéria/as duas bases de cálculo não fazia efeito por aqui). */}
          <div className="flex items-center justify-between -mt-1 -mr-1">
            <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Dados do Processo</h4>
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
              users={users}
              tribunais={tribunais}
              caseLinks={caseLinks}
              instanceHistory={instanceHistory}
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
          <Field label="Vara/Comarca" value={c.court} />
          <Field label="Valor da Causa" value={c.caseValue != null ? formatCurrency(c.caseValue) : undefined} />
          {/* Três campos que faltavam no mobile — chegaram na base de dados nas Fases 1-2
              (Case.economicBenefitValue/convictionValue/agreementValue) mas nunca ganharam Field
              aqui. Servem de base pro percentual de honorário (ver lib/honorarioLancamento.ts),
              por isso importam tanto quanto Valor da Causa. */}
          <Field label="Proveito Econômico" value={c.economicBenefitValue != null ? formatCurrency(c.economicBenefitValue) : undefined} />
          <Field label="Valor da Condenação" value={c.convictionValue != null ? formatCurrency(c.convictionValue) : undefined} />
          <Field label="Valor do Acordo" value={c.agreementValue != null ? formatCurrency(c.agreementValue) : undefined} />
          <Field label="Responsável" value={c.responsible?.name} />
          <Field
            label={natureza === "ADMINISTRATIVO" ? "Órgão" : "Tribunal"}
            value={c.tribunalSigla ? `${c.tribunalSigla} — ${c.tribunalNome ?? ""}` : undefined}
          />
          <Field label="Sistema" value={c.tribunalSistema} />
          {natureza === "ADMINISTRATIVO" && (
            <>
              <Field label="Esfera" value={c.adminEsfera ? ESFERA_LABELS[c.adminEsfera] : undefined} />
              <Field label="Matéria" value={c.adminMateria ? MATERIA_LABELS[c.adminMateria] : undefined} />
            </>
          )}
          {c.tribunalLink && (
            <a
              href={c.tribunalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-acao hover:underline"
            >
              <ExternalLink size={12} /> Acessar sistema do {natureza === "ADMINISTRATIVO" ? "órgão" : "tribunal"}
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
          <div className="pt-1">
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1">Descrição</p>
            <p className="text-sm text-tx-2 whitespace-pre-wrap">{c.description || "Sem descrição."}</p>
          </div>
        </Card>
      )}

      {tab === "visao-geral" && (c.materias.length > 0 || c.assuntos.length > 0 || c.distributedAt) && (
        <Card className="p-4 space-y-2.5">
          <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Classificação</h4>
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

      {tab === "visao-geral" && caseLinks.length > 0 && (
        <Card className="p-4 space-y-2">
          <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Processos vinculados</h4>
          <div className="space-y-1.5">
            {caseLinks.map((l) => (
              <div key={l.linkId} className="flex items-center justify-between gap-2">
                <Link href={`/m/processos/${l.other.id}`} className="text-sm text-tx hover:underline truncate">
                  {l.other.title}
                </Link>
                {l.role === "PRINCIPAL" && <Badge color="gold">Principal</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "atividades" && (
        <Card>
          <div className="px-4 py-3 border-b border-regua">
            <h2 className="font-bold text-tx text-sm">Próximas tarefas</h2>
          </div>
          {c.tasks.length === 0 ? (
            <EmptyState title="Nenhuma tarefa pendente" />
          ) : (
            <div className="divide-y divide-regua">
              {c.tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5 px-4 py-3">
                  <div className="pt-0.5">
                    <MobileTaskToggle taskId={t.id} done={t.status === "CONCLUIDO"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge color={taskTypeColors[t.type] ?? "slate"}>{taskTypeLabels[t.type] ?? t.type}</Badge>
                      <span className="text-xs font-semibold text-tx-2">{formatCalendarDate(t.dueDate)}</span>
                      {t.dueTime && <span className="text-xs text-tx-2">{t.dueTime}</span>}
                    </div>
                    <p className="text-sm font-medium text-tx">{t.title}</p>
                    <MobileTaskResponsibleSelect taskId={t.id} responsibleId={t.responsibleId} users={users} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="p-3 border-t border-regua">
            <MobileNewTaskForm caseId={c.id} />
          </div>
        </Card>
      )}

      {tab === "comentarios" && (
        <Card className="p-4 space-y-4">
          {c.comments.length === 0 ? (
            <p className="text-sm text-tx-2">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-3">
              {c.comments.map((cm) => (
                <div key={cm.id} className="flex gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-grafite-700 text-marca flex items-center justify-center text-[11px] font-bold shrink-0">
                    {cm.author.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-tx">{cm.author.name}</span>{" "}
                      <span className="text-[11px] text-tx-2">{formatDate(cm.createdAt)}</span>
                    </p>
                    <p className="text-sm text-tx-2 mt-0.5 whitespace-pre-wrap">{cm.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <MobileCommentForm caseId={c.id} users={users} />
        </Card>
      )}

      {tab === "financeiro" && hasFinanceAccess && (
        <MobileCaseFinanceTab
          caseId={c.id}
          receivables={c.receivables.map((r) => ({
            id: r.id,
            description: r.description,
            amount: r.amount,
            discount: r.discount,
            surcharge: r.surcharge,
            dueDate: r.dueDate.toISOString(),
            noDueDate: r.noDueDate,
            status: r.status,
            payerType: r.payerType,
            payerName: r.payerName,
            honorarioLancamentoId: r.honorarioLancamentoId,
            payments: r.payments,
            reimbursesPayable: r.reimbursesPayable ? { description: r.reimbursesPayable.description } : null,
          }))}
          payables={c.payables.map((p) => ({
            id: p.id,
            description: p.description,
            amount: p.amount,
            discount: p.discount,
            surcharge: p.surcharge,
            dueDate: p.dueDate.toISOString(),
            noDueDate: p.noDueDate,
            status: p.status,
            payments: p.payments,
            reimbursementReceivable: p.reimbursementReceivable
              ? { amount: p.reimbursementReceivable.amount, status: p.reimbursementReceivable.status }
              : null,
          }))}
          recurringFees={recurringFees.map((f) => ({ id: f.id, description: f.description, amount: f.amount, dueDay: f.dueDay }))}
          honorarioLancamentos={serializedHonorarioLancamentos}
          bankAccounts={bankAccounts}
        />
      )}

      {tab === "publicacoes" && (
        <Card>
          {publicationGroups.length === 0 ? (
            <EmptyState title="Nenhuma publicação ou andamento" />
          ) : (
            <div className="divide-y divide-regua">
              {publicationGroups.map((g) => (
                <MobilePublicationCard key={g.key} group={g} users={users} />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "anexos" && <MobileCaseAttachmentsTab attachments={serializedAttachments} />}

      {tab === "protocolos" && natureza !== "CASO" && <MobileCaseProtocolosTab lotes={serializedLotes} envios={serializedEnvios} />}

      {tab === "vigilancia" && natureza === "ADMINISTRATIVO" && <MobileCaseVigilanciaTab termos={serializedTermos} />}

      {tab === "anotacoes-pessoais" && (
        <div className="space-y-4">
          <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-tx mb-2">Nova anotação</h4>
            <MobileNovaAnotacaoForm linkType={anotacaoLinkType} entityId={c.id} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm border-b border-regua pb-2 last:border-0 last:pb-0">
      <span className="text-tx-2 shrink-0">{label}</span>
      <span className="font-medium text-tx text-right">{value || "—"}</span>
    </div>
  );
}
