import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatDate, formatCalendarDate, EmptyState, ConclusionChip, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import MobileAttendanceStatusSelect from "@/components/mobile/MobileAttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import MobileConvertAttendanceForm from "@/components/mobile/MobileConvertAttendanceForm";
import MobileCaseAttachmentsTab from "@/components/mobile/MobileCaseAttachmentsTab";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import MobileNovaAnotacaoForm from "@/components/mobile/MobileNovaAnotacaoForm";
import EditAttendanceSubject from "@/components/EditAttendanceSubject";
import { ArrowLeft, Send } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function AtendimentoAppDetail({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const a = await prisma.attendance.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      responsible: true,
      convertedCase: true,
      whatsappMessages: { orderBy: { createdAt: "asc" } },
      emailMessages: { orderBy: { createdAt: "asc" } },
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      pendencias: { include: { responsible: true }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!a) notFound();

  const showWhatsapp = Boolean(a.waPhone) || a.whatsappMessages.length > 0;
  const showEmail = a.emailMessages.length > 0;
  const serializedAnotacoes = a.anotacoes.map((n) => ({ id: n.id, content: n.content, referenceDate: n.referenceDate.toISOString(), createdAt: n.createdAt.toISOString() }));
  const serializedAttachments = a.attachments.map((att) => ({ id: att.id, name: att.name, driveUrl: att.driveUrl, docType: att.docType, createdAt: att.createdAt.toISOString(), updatedAt: att.updatedAt?.toISOString() ?? null, uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null }));
  const serializedPendencias = a.pendencias.map((p) => ({ id: p.id, direction: p.direction, kind: p.kind, description: p.description, status: p.status, dueDate: p.dueDate ? p.dueDate.toISOString() : null, completedAt: p.completedAt ? p.completedAt.toISOString() : null, responsible: p.responsible ? { name: p.responsible.name } : null }));

  // Check if Ana is responding flag (stored in metadata or a custom field)
  const anaResponde = (a.metadata as Record<string, unknown> | null)?.anaResponde === true;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Triagem
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-tx leading-tight">{a.clientName}</h1>
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
        <Field label="Telefone" value={a.contactPhone} />
        <Field label="E-mail" value={a.clientEmail} />
        <Field label="Responsável" value={a.responsible?.name} />
        <Field label="Data" value={formatDate(a.createdAt)} />
        {a.convertedCase && (
          <div className="flex justify-between gap-3 text-sm pb-0">
            <span className="text-tx-2 shrink-0">Convertido em</span>
            <Link href={`/atendimento-app/${a.convertedCase.id}`} className="font-medium text-ouro-acento text-right">{a.convertedCase.title}</Link>
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

      {showWhatsapp && (
        <Card className="p-4">
          <div className="flex items-start justify-between mb-3 gap-2">
            <h4 className="text-sm font-semibold text-tx">Conversa do WhatsApp</h4>
            {a.waPhone && <span className="text-corpo text-tx-2 shrink-0">{a.waPhone}</span>}
          </div>

          {a.whatsappMessages.length === 0 ? (
            <p className="text-sm text-tx-2">Nenhuma mensagem ainda.</p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {a.whatsappMessages.map((m) => {
                const out = m.direction === "OUT";
                return (
                  <div key={m.id} className={out ? "flex justify-end" : "flex justify-start"}>
                    <div className={out ? "max-w-[80%] bg-ouro-acento px-3 py-2 text-ouro-tx" : "max-w-[80%] bg-sf-apoio px-3 py-2 text-tx border border-regua"}>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={out ? "mt-1 text-corpo text-ouro-tx text-right" : "mt-1 text-corpo text-tx-2"}>
                        {formatDate(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {out && m.status === "FAILED" ? " · falhou" : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ana responde flag + reply button */}
          <div className="mt-4 p-3 bg-sf-apoio border border-regua rounded-[2px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={anaResponde}
                onChange={(e) => fetch(`/api/atendimento/${a.id}/ana-responde`, { method: "PATCH", body: JSON.stringify({ anaResponde: e.target.checked }) })}
                className="h-4 w-4 rounded border-regua-forte focus:ring-ouro-acento text-ouro-acento"
              />
              <span className="text-corpo font-medium text-tx">Ana responde nesta conversa</span>
            </label>
            {anaResponde && (
              <button className="mt-2 w-full h-[44px] flex items-center justify-center gap-2 bg-ouro-acento hover:bg-ouro-hover text-ouro-tx font-semibold text-sm rounded-[2px] transition-colors">
                <Send size={15} /> Responder última mensagem
              </button>
            )}
          </div>
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