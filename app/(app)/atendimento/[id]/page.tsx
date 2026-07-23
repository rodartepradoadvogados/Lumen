import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, formatDate, EmptyState, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import AttachmentList from "@/components/AttachmentList";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import ConvertAttendanceForm from "@/components/ConvertAttendanceForm";
import AttendanceStatusSelect from "@/components/AttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import AttendanceCommercialForm from "@/components/AttendanceCommercialForm";
import GerarDocumentoButton from "@/components/GerarDocumentoButton";
import WhatsappReplyBox from "@/components/WhatsappReplyBox";
import EmailReplyPanel from "@/components/EmailReplyPanel";
import { getDriveStatus } from "@/lib/googleDrive";
import { isWhatsappConfigured } from "@/lib/whatsapp";
import { getCurrentUser } from "@/lib/currentUser";
import { X } from "lucide-react";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function AttendanceDetailPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const a = await prisma.attendance.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      responsible: true,
      tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      convertedCase: true,
      whatsappMessages: { orderBy: { createdAt: "asc" } },
      emailMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!a) notFound();

  const whatsappConfigured = isWhatsappConfigured();
  const showWhatsapp = Boolean(a.waPhone) || a.whatsappMessages.length > 0;

  const [users, columns, driveStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    getDriveStatus(viewer.officeId),
  ]);

  const serializedAttachments = a.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  return (
    <>
      {/* Backdrop puramente visual: clicar fora não fecha a janela (só o X fecha). */}
      <div className="fixed inset-0 bg-navy-950/40 z-40" aria-hidden="true" />

      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-cream-50 dark:bg-navy-900 rounded-xl shadow-pop flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-navy-800/8 dark:border-white/10 shrink-0 bg-cream-50 dark:bg-navy-900">
          <span className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide">Atendimento</span>
          <Link
            href="/atendimento"
            className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50 transition-colors"
            aria-label="Fechar"
            title="Fechar"
          >
            <X size={20} />
          </Link>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <div className="max-w-[900px] mx-auto animate-fade-in">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
              <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{a.clientName}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <FunnelStageSelect attendanceId={a.id} stage={a.stage} />
                <AttendanceStatusSelect attendanceId={a.id} status={a.status} />
                <DeleteEntityButton
                  entityType="ATTENDANCE"
                  entityId={a.id}
                  entityLabel={`${a.clientName} — ${a.subject}`}
                  confirmMessage={`Excluir o atendimento de "${a.clientName}"?`}
                />
              </div>
            </div>
            <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{a.subject}</p>
            <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1.5 mb-5">
              Use os seletores acima para mudar o estágio comercial e o status operacional deste atendimento a qualquer momento.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <Card className="p-5 space-y-3">
                <Field label="Matéria" value={a.area} />
                <Field label="Canal" value={channelLabels[a.channel]} />
                <Field label="Telefone" value={a.contactPhone} />
                {a.contact && <Field label="Contato (legado)" value={a.contact} />}
                <Field label="Responsável pela triagem" value={a.responsible?.name} />
                <Field label="Data" value={formatDate(a.createdAt)} />
                {a.convertedCase && (
                  <div className="flex justify-between text-sm border-b border-navy-800/5 dark:border-white/10 pb-2">
                    <span className="text-navy-800/50 dark:text-cream-50/50">Convertido em</span>
                    <Link href={`/processos/${a.convertedCase.id}`} className="font-medium text-gold-700 dark:text-gold-400 hover:underline text-right">
                      {a.convertedCase.title}
                    </Link>
                  </div>
                )}
                <div className="pt-2 border-t border-navy-800/8 dark:border-white/10">
                  <AttendanceCommercialForm
                    attendanceId={a.id}
                    estimatedValue={a.estimatedValue}
                    leadSource={a.leadSource}
                    nextContactAt={a.nextContactAt ? a.nextContactAt.toISOString() : null}
                  />
                </div>
              </Card>
              <Card className="p-5">
                <h4 className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Descrição detalhada</h4>
                <p className="text-sm text-navy-800 dark:text-cream-50/80 whitespace-pre-wrap">{a.description || "Sem descrição."}</p>
              </Card>
            </div>

            {!a.convertedCaseId && (
              <Card className="p-5 mb-5">
                <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50 mb-1">Transformar em Processo/Caso</h4>
                <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mb-3">
                  Isso cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico completo deste atendimento.
                </p>
                <ConvertAttendanceForm attendanceId={a.id} />
              </Card>
            )}

            {showWhatsapp && (
              <Card className="p-5 mb-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Conversa do WhatsApp</h4>
                    <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1.5">
                      Mensagens trocadas pelo número oficial do escritório no WhatsApp — a resposta sai pelo mesmo número que o cliente já
                      conhece.
                    </p>
                  </div>
                  {a.waPhone && <span className="text-xs text-navy-800/45 dark:text-cream-50/45 shrink-0">{a.waPhone}</span>}
                </div>

                {a.whatsappMessages.length === 0 ? (
                  <p className="text-sm text-navy-800/45 dark:text-cream-50/45">Nenhuma mensagem ainda.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {a.whatsappMessages.map((m) => {
                      const out = m.direction === "OUT";
                      return (
                        <div key={m.id} className={out ? "flex justify-end" : "flex justify-start"}>
                          <div
                            className={
                              out
                                ? "max-w-[75%] rounded-lg rounded-br-sm bg-navy-700 px-3 py-2 text-white"
                                : "max-w-[75%] rounded-lg rounded-bl-sm bg-cream-100 dark:bg-navy-800 px-3 py-2 text-navy-900 dark:text-cream-50 border border-navy-800/8 dark:border-white/10"
                            }
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={out ? "mt-1 text-[10px] text-white/60 text-right" : "mt-1 text-[10px] text-navy-800/40 dark:text-cream-50/40"}>
                              {formatDate(m.createdAt)}{" "}
                              {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              {out && m.status === "FAILED" ? " · falhou" : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {a.waPhone && whatsappConfigured ? (
                  <WhatsappReplyBox attendanceId={a.id} />
                ) : (
                  <p className="mt-3 text-xs text-navy-800/40 dark:text-cream-50/40">
                    {a.waPhone ? "Canal WhatsApp não configurado." : "Este atendimento não tem WhatsApp vinculado."}
                  </p>
                )}
              </Card>
            )}

            <Card className="p-5 mb-5">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">E-mail</h4>
                <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1.5">
                  Enviado usando a sua própria conta Google conectada. Se não conseguir enviar, reconecte sua conta em Configurações.
                </p>
              </div>

              {a.emailMessages.length === 0 ? (
                <p className="text-sm text-navy-800/45 dark:text-cream-50/45">Nenhum e-mail enviado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 mb-3">
                  {a.emailMessages.map((m) => (
                    <div key={m.id} className="rounded-lg border border-navy-800/8 dark:border-white/10 bg-cream-100 dark:bg-navy-800 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{m.subject}</p>
                        <span className="shrink-0 text-[10px] text-navy-800/40 dark:text-cream-50/40">
                          {formatDate(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-navy-800/50 dark:text-cream-50/50">
                        De {m.fromAddress} para {m.toAddress}
                      </p>
                      <p className="mt-1 text-sm text-navy-900 dark:text-cream-50 whitespace-pre-wrap break-words">{m.body}</p>
                      {m.status === "FAILED" && (
                        <p className="mt-1 text-xs font-medium text-red-600 dark:text-bordo-400">Falhou{m.errorMessage ? `: ${m.errorMessage}` : ""}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <EmailReplyPanel attendanceId={a.id} clientEmail={a.clientEmail} />
            </Card>

            <Card className="mb-5">
              <div className="flex items-start justify-between px-5 py-3 border-b border-navy-800/8 dark:border-white/10 gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Tarefas / Kanban</h4>
                  <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1.5">
                    Tarefas e compromissos vinculados só a este atendimento — aparecem também na Agenda geral.
                  </p>
                </div>
                <NewTaskModal cases={[]} users={users} columns={columns} defaultAttendanceId={a.id} label="Criar Tarefa/Evento" />
              </div>
              {a.tasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa vinculada a este atendimento" />
              ) : (
                <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                  {a.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                          <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                          <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{t.title}</p>
                        </div>
                        {t.responsible && <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-0.5">Responsável: {t.responsible.name}</p>}
                      </div>
                      <p className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 shrink-0">{formatDate(t.dueDate)}</p>
                      <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir a tarefa "${t.title}"?`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Anexos</h4>
                  <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1.5">
                    Documentos armazenados no Drive do escritório, vinculados a este atendimento.
                  </p>
                </div>
                <GerarDocumentoButton attendanceId={a.id} />
              </div>
              <AttachmentList attachments={serializedAttachments} attendanceId={a.id} driveConnected={driveStatus.connected} />
            </Card>
          </div>
        </div>
      </div>
    </>
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
