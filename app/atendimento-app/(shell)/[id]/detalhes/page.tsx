import { prisma } from "@/lib/prisma";
import { Card, Badge, formatDate, formatCalendarDate, EmptyState, ConclusionChip, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import MobileAttendanceStatusSelect from "@/components/mobile/MobileAttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import MobileConvertAttendanceForm from "@/components/mobile/MobileConvertAttendanceForm";
import MobileCaseAttachmentsTab from "@/components/mobile/MobileCaseAttachmentsTab";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import MobileNovaAnotacaoForm from "@/components/mobile/MobileNovaAnotacaoForm";
import EditAttendanceSubject from "@/components/EditAttendanceSubject";
import { whereDeUmAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function DetalhesDoAtendimentoPage({ params }: { params: { id: string } }) {
  const viewer = await exigirAcessoAoAtendimentoNaTela();

  const a = await prisma.attendance.findFirst({
    // O dono entra no WHERE (não num `if` depois): o lead do colega simplesmente não existe aqui.
    where: whereDeUmAtendimento(viewer, params.id),
    include: {
      responsible: true,
      convertedCase: true,
      emailMessages: { orderBy: { createdAt: "asc" } },
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      pendencias: { include: { responsible: true }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!a) return <SemAcessoAConversa />;

  const showEmail = a.emailMessages.length > 0;
  const serializedAnotacoes = a.anotacoes.map((n) => ({ id: n.id, content: n.content, referenceDate: n.referenceDate.toISOString(), createdAt: n.createdAt.toISOString() }));
  const serializedAttachments = a.attachments.map((att) => ({ id: att.id, name: att.name, driveUrl: att.driveUrl, docType: att.docType, createdAt: att.createdAt.toISOString(), updatedAt: att.updatedAt?.toISOString() ?? null, uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null }));
  const serializedPendencias = a.pendencias.map((p) => ({ id: p.id, direction: p.direction, kind: p.kind, description: p.description, status: p.status, dueDate: p.dueDate ? p.dueDate.toISOString() : null, completedAt: p.completedAt ? p.completedAt.toISOString() : null, responsible: p.responsible ? { name: p.responsible.name } : null }));

  // Os componentes daqui são os de sempre (seletores, formulários); no celular todo campo e botão tem o
  // alvo mínimo de 44 px — aplicado na caixa, sem mexer nos componentes que o site também usa.
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] [&_button]:min-h-11 [&_input:not([type=checkbox]):not([type=radio])]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-11"
      data-rolagem-dos-detalhes=""
    >
      <div className="space-y-4">
      <h2 className="sr-only">Detalhes de {a.clientName}</h2>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="mt-0.5"><EditAttendanceSubject attendanceId={a.id} subject={a.subject} /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FunnelStageSelect attendanceId={a.id} stage={a.stage} />
          <MobileAttendanceStatusSelect attendanceId={a.id} status={a.status} />
        </div>
      </div>

      <Card className="p-4 space-y-2.5">
        <Field label="Matéria" value={a.area} />
        <Field label="Canal" value={channelLabels[a.channel]} />
        <Field label="WhatsApp" value={a.waPhone ? telefoneLegivel(a.waPhone) : null} />
        <Field label="Telefone" value={a.contactPhone} />
        <Field label="E-mail" value={a.clientEmail} />
        <Field label="Responsável" value={a.responsible?.name} />
        <Field label="Data" value={formatDate(a.createdAt)} />
        {a.convertedCase && (
          <div className="flex justify-between gap-3 text-sm pb-0">
            <span className="text-tx-2 shrink-0">Convertido em</span>
            <span className="font-medium text-tx text-right">{a.convertedCase.title}</span>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-corpo font-semibold text-tx-2 uppercase tracking-wide mb-2">O que a triagem apurou</h4>
        <p className="text-sm text-tx-2 whitespace-pre-wrap">{a.description || "Sem descrição detalhada."}</p>
        {a.estimatedValue && <p className="text-sm text-tx-2 mt-2">Valor estimado: <span className="font-semibold text-ouro-acento">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(a.estimatedValue)}</span></p>}
        {a.leadSource && <p className="text-sm text-tx-2 mt-1">Origem: {a.leadSource}</p>}
        {a.nextContactAt && <p className="text-sm text-tx-2 mt-1">Próximo contato: {formatDate(new Date(a.nextContactAt))}</p>}
        {a.responseDeadline && <p className="text-sm text-tx-2 mt-1">Prazo de resposta: {formatDate(new Date(a.responseDeadline))}</p>}
        {a.feeMode && a.feeMode !== "DINHEIRO" && <p className="text-sm text-tx-2 mt-1">Honorário: {a.feeMode === "PERCENTUAL" ? `${a.feePercentual}%` : "Misto"}</p>}
      </Card>

      <div>
        <h4 className="text-corpo font-semibold text-tx-2 uppercase tracking-wide mb-2">Anexos</h4>
        <MobileCaseAttachmentsTab attachments={serializedAttachments} />
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-semibold text-tx">Pendências</h4>
          <span className="text-xs text-tx-3">O que falta pedir/enviar ao lead</span>
        </div>
        <AttendancePendenciasAppPanel attendanceId={a.id} pendencias={serializedPendencias} />
      </Card>

      {!a.convertedCaseId && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-tx mb-1">Transformar em Processo/Caso</h4>
          <p className="text-corpo italic text-tx-3 mb-3">Cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico deste atendimento.</p>
          <MobileConvertAttendanceForm attendanceId={a.id} />
        </Card>
      )}

      {showEmail && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-tx mb-3">E-mail</h4>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {a.emailMessages.map((m) => (
              <div key={m.id} className="border border-regua bg-sf-apoio px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-tx truncate">{m.subject}</p>
                  <span className="shrink-0 text-corpo text-tx-2">{formatDate(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 text-corpo text-tx-2">De {m.fromAddress} para {m.toAddress}</p>
                <p className="mt-1 text-sm text-tx whitespace-pre-wrap break-words">{m.body}</p>
                {m.status === "FAILED" && <p className="mt-1 text-corpo font-medium text-urgente">Falhou{m.errorMessage ? `: ${m.errorMessage}` : ""}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-corpo italic text-tx-2">Para responder, use o computador.</p>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-tx">Tarefas / Kanban</h4>
          <p className="text-xs italic text-tx-3 mt-1.5">Tarefas e compromissos vinculados só a este atendimento — aparecem também na Agenda geral.</p>
        </div>
        {a.tasks.length === 0 ? (
          <EmptyState title="Nenhuma tarefa vinculada a este atendimento" />
        ) : (
          <div className="divide-y divide-regua">
            {a.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.status === "CONCLUIDO" ? <ConclusionChip>{taskConclusionLabel(t.type)}</ConclusionChip> : (<> <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge> <Badge color={priorityColors[t.priority]}>{t.priority}</Badge> </>)}
                    <p className={`text-sm font-medium text-tx ${t.status === "CONCLUIDO" ? "line-through text-tx-3" : ""}`}>{t.title}</p>
                  </div>
                  {t.responsible && <p className="text-xs text-tx-3 mt-0.5">Responsável: {t.responsible.name}</p>}
                </div>
                <p className="text-xs font-semibold text-tx-2 shrink-0">{formatCalendarDate(t.dueDate)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-sm font-semibold text-tx mb-2">Anotações pessoais</h4>
        <p className="text-xs italic text-tx-3 mb-3">Anotações que você criou vinculadas a este atendimento — visíveis só para você.</p>
        <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
        <div className="mt-3 pt-3 border-t border-regua"><MobileNovaAnotacaoForm linkType="ATENDIMENTO" entityId={a.id} /></div>
      </Card>
      </div>
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

// Pendências panel inline for the app
import AttendancePendenciasPanel from "@/components/AttendancePendenciasPanel";
interface PendenciaRow {
  id: string;
  direction: string;
  kind: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  responsible: { name: string } | null;
}
function AttendancePendenciasAppPanel({ attendanceId, pendencias }: { attendanceId: string; pendencias: PendenciaRow[] }) {
  return <AttendancePendenciasPanel attendanceId={attendanceId} users={[]} pendencias={pendencias} />;
}