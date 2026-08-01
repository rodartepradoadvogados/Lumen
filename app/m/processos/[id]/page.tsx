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
import CopyButton from "@/components/CopyButton";
import EditCaseModal from "@/components/EditCaseModal";
import CaseAssessoriaSelect from "@/components/CaseAssessoriaSelect";
import { effectiveCaseClients, effectiveCaseParties, partyRoleLabels } from "@/lib/caseParties";
import { naturezaOf, NATUREZA_LABELS, ESFERA_LABELS, MATERIA_LABELS } from "@/lib/caseNatureza";
import NaturezaBadge from "@/components/mobile/NaturezaBadge";
import { ArrowLeft, ExternalLink } from "lucide-react";

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
  const [c, publications, users, clients, tribunais, recurringFees, termosVigilancia, bankAccounts, assessoriasRaw] = await Promise.all([
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
        receivables: { orderBy: { dueDate: "asc" }, include: { payments: { select: { amount: true } } } },
        payables: { orderBy: { dueDate: "asc" }, include: { payments: { select: { amount: true } } } },
        attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
        protocoloLotes: {
          orderBy: { createdAt: "desc" },
          include: { comprovante: { select: { id: true, name: true, driveUrl: true } }, itens: { orderBy: { ordem: "asc" }, select: { id: true, nomeSnapshot: true, attachment: { select: { driveUrl: true } } } } },
        },
        honorarioLancamentos: {
          orderBy: { createdAt: "desc" },
          include: { parcelas: { orderBy: { dueDate: "asc" }, include: { payments: { select: { amount: true } } } } },
        },
      },
    }),
    prisma.publication.findMany({
      where: { caseId: params.id, officeId: viewer.officeId },
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
  ]);

  if (!c) notFound();

  const natureza = naturezaOf(c.type);
  const requestedTab = searchParams.tab || "visao-geral";
  // Mesmo fallback do site: aba pedida mas indisponível (sem acesso financeiro, natureza que não
  // tem Vigilância/Protocolos) cai em Visão Geral em vez de mostrar uma tela vazia/quebrada.
  const tab =
    (requestedTab === "financeiro" && !hasFinanceAccess) ||
    (requestedTab === "vigilancia" && natureza !== "ADMINISTRATIVO") ||
    (requestedTab === "protocolos" && natureza === "CASO")
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
    caseId: c.id,
    caseTitle: c.title,
  }));

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

  const visibleTabs = TABS.filter(
    (t) =>
      (t.key !== "financeiro" || hasFinanceAccess) &&
      (t.key !== "vigilancia" || natureza === "ADMINISTRATIVO") &&
      (t.key !== "protocolos" || natureza !== "CASO")
  );

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m/processos"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Processos
      </Link>

      {anexosFalhos > 0 && (
        <div className="rounded-lg border border-bordo-700/25 dark:border-bordo-400/25 bg-bordo-100/40 dark:bg-bordo-700/10 px-3 py-2.5 text-xs text-bordo-700 dark:text-bordo-400">
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
          <Badge color={statusColors[c.status] ?? "slate"}>{c.status}</Badge>
          <CaseAssessoriaSelect caseId={c.id} assessoriaId={c.assessoriaId} assessorias={assessorias} />
        </div>
        <h1 className="font-serif text-lg font-bold text-navy-900 dark:text-cream-50 leading-tight">{c.title}</h1>
        <p className="flex flex-wrap items-center text-xs text-navy-800/50 dark:text-cream-50/50 mt-1">
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
                ? "bg-navy-900 text-white dark:bg-white/10 dark:text-cream-50"
                : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10"
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
              users={users}
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline"
            >
              <ExternalLink size={12} /> Acessar sistema do {natureza === "ADMINISTRATIVO" ? "órgão" : "tribunal"}
            </a>
          )}
          <div className="pt-1">
            <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1">Descrição</p>
            <p className="text-sm text-navy-800 dark:text-cream-50/85 whitespace-pre-wrap">{c.description || "Sem descrição."}</p>
          </div>
        </Card>
      )}

      {tab === "atividades" && (
        <Card>
          <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
            <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Próximas tarefas</h2>
          </div>
          {c.tasks.length === 0 ? (
            <EmptyState title="Nenhuma tarefa pendente" />
          ) : (
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {c.tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5 px-4 py-3">
                  <div className="pt-0.5">
                    <MobileTaskToggle taskId={t.id} done={t.status === "CONCLUIDO"} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge color={taskTypeColors[t.type] ?? "slate"}>{taskTypeLabels[t.type] ?? t.type}</Badge>
                      <span className="text-xs font-semibold text-navy-800/55 dark:text-cream-50/55">{formatCalendarDate(t.dueDate)}</span>
                      {t.dueTime && <span className="text-xs text-navy-800/45 dark:text-cream-50/45">{t.dueTime}</span>}
                    </div>
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{t.title}</p>
                    <MobileTaskResponsibleSelect taskId={t.id} responsibleId={t.responsibleId} users={users} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="p-3 border-t border-navy-800/8 dark:border-white/10">
            <MobileNewTaskForm caseId={c.id} />
          </div>
        </Card>
      )}

      {tab === "comentarios" && (
        <Card className="p-4 space-y-4">
          {c.comments.length === 0 ? (
            <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-3">
              {c.comments.map((cm) => (
                <div key={cm.id} className="flex gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-[11px] font-bold shrink-0">
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
          }))}
          recurringFees={recurringFees.map((f) => ({ id: f.id, description: f.description, amount: f.amount, dueDay: f.dueDay }))}
          honorarioLancamentos={serializedHonorarioLancamentos}
          bankAccounts={bankAccounts}
        />
      )}

      {tab === "publicacoes" && (
        <Card>
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
      )}

      {tab === "anexos" && <MobileCaseAttachmentsTab attachments={serializedAttachments} />}

      {tab === "protocolos" && natureza !== "CASO" && <MobileCaseProtocolosTab lotes={serializedLotes} />}

      {tab === "vigilancia" && natureza === "ADMINISTRATIVO" && <MobileCaseVigilanciaTab termos={serializedTermos} />}
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
