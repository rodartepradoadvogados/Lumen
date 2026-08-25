import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, ConclusionChip, formatDate, formatCalendarDate, EmptyState, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import AttachmentList from "@/components/AttachmentList";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import ConvertAttendanceForm from "@/components/ConvertAttendanceForm";
import AttendanceStatusSelect from "@/components/AttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import AttendanceCommercialForm from "@/components/AttendanceCommercialForm";
import AttendancePendenciasPanel from "@/components/AttendancePendenciasPanel";
import GerarDocumentoButton from "@/components/GerarDocumentoButton";
import WhatsappReplyBox from "@/components/WhatsappReplyBox";
import EmailReplyPanel from "@/components/EmailReplyPanel";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import EditAttendanceSubject from "@/components/EditAttendanceSubject";
import { isStorageConnected } from "@/lib/storageProvider";
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
      pendencias: { include: { responsible: true }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      // Anotações pessoais (painel global "Anotações") vinculadas a este Atendimento — filtradas
      // por authorId, mesma regra de app/(app)/processos/[id]/page.tsx.
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
    },
  });
  if (!a) notFound();

  const whatsappConfigured = await isWhatsappConfigured(viewer.officeId);
  const showWhatsapp = Boolean(a.waPhone) || a.whatsappMessages.length > 0;

  const [users, columns, storageConnected] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    // Gate da área de arrastar arquivo: pergunta pelo ARMAZENAMENTO do escritório, não pelo
    // Google. Um escritório em OneDrive ou Dropbox tem armazenamento conectado e mesmo assim
    // não via onde soltar o arquivo, porque a checagem era específica do Drive.
    isStorageConnected(viewer.officeId),
  ]);

  const serializedAttachments = a.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const serializedAnotacoes = a.anotacoes.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));

  const serializedPendencias = a.pendencias.map((p) => ({
    id: p.id,
    direction: p.direction,
    kind: p.kind,
    description: p.description,
    status: p.status,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    responsible: p.responsible ? { name: p.responsible.name } : null,
  }));

  return (
    <>
      {/* Backdrop puramente visual: clicar fora não fecha a janela (só o X fecha). */}
      <div className="fixed inset-0 bg-grafite-900/40 z-40" aria-hidden="true" />

      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-sf shadow-pop flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-regua shrink-0 bg-sf">
          <span className="text-xs font-semibold text-tx-3 uppercase tracking-wide">Atendimento</span>
          <Link
            href="/atendimento"
            className="text-tx-3 hover:text-tx transition-colors"
            aria-label="Fechar"
            title="Fechar"
          >
            <X size={20} />
          </Link>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {/* Largura cheia — mesmo motivo do Processo: quem define o espaço é a casca do modo
              de visualização, não um teto fixo aqui. */}
          <div className="w-full animate-fade-in">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
              <h1 className="text-2xl font-bold text-tx">{a.clientName}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <FunnelStageSelect attendanceId={a.id} stage={a.stage} />
                <AttendanceStatusSelect attendanceId={a.id} status={a.status} />
                <DeleteEntityButton
                  entityType="ATTENDANCE"
                  entityId={a.id}
                  entityLabel={`${a.clientName} — ${a.subject}`}
                  confirmMessage={`Excluir o atendimento de "${a.clientName}"?`}
                  redirectTo="/atendimento"
                />
              </div>
            </div>
            <EditAttendanceSubject attendanceId={a.id} subject={a.subject} />
            <p className="text-xs italic text-tx-3 mt-1.5 mb-5">
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
                  <div className="flex justify-between text-sm border-b border-regua pb-2">
                    <span className="text-tx-3">Convertido em</span>
                    <Link href={`/processos/${a.convertedCase.id}`} className="font-medium text-acao hover:underline text-right">
                      {a.convertedCase.title}
                    </Link>
                  </div>
                )}
                <div className="pt-2 border-t border-regua">
                  <AttendanceCommercialForm
                    attendanceId={a.id}
                    estimatedValue={a.estimatedValue}
                    leadSource={a.leadSource}
                    nextContactAt={a.nextContactAt ? a.nextContactAt.toISOString() : null}
                    feeMode={a.feeMode}
                    feePercentual={a.feePercentual}
                    feePercentualBase={a.feePercentualBase}
                    responseDeadline={a.responseDeadline ? a.responseDeadline.toISOString() : null}
                    firstResponseAt={a.firstResponseAt ? a.firstResponseAt.toISOString() : null}
                  />
                </div>
              </Card>
              <Card className="p-5">
                <h4 className="text-xs font-semibold text-tx-3 uppercase tracking-wide mb-2">Descrição detalhada</h4>
                <p className="text-sm text-tx/80 whitespace-pre-wrap">{a.description || "Sem descrição."}</p>
              </Card>
            </div>

            <Card className="p-5 mb-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Pendências</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                O que falta pedir ao lead e o que falta mandar para ele. Fecha sozinha quando o anexo do tipo correspondente é registrado
                abaixo (Procuração, Contrato de Honorários e Declaração de Hipossuficiência); o resto se marca à mão.
              </p>
              <AttendancePendenciasPanel attendanceId={a.id} users={users} pendencias={serializedPendencias} />
            </Card>

            {!a.convertedCaseId && (
              <Card className="p-5 mb-5">
                <h4 className="text-sm font-semibold text-tx mb-1">Transformar em Processo/Caso</h4>
                <p className="text-xs italic text-tx-3 mb-3">
                  Isso cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico completo deste atendimento.
                </p>
                <ConvertAttendanceForm attendanceId={a.id} />
              </Card>
            )}

            {showWhatsapp && (
              <Card className="p-5 mb-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-tx">Conversa do WhatsApp</h4>
                    <p className="text-xs italic text-tx-3 mt-1.5">
                      Mensagens trocadas pelo número oficial do escritório no WhatsApp — a resposta sai pelo mesmo número que o cliente já
                      conhece.
                    </p>
                  </div>
                  {a.waPhone && <span className="text-xs text-tx-3 shrink-0">{a.waPhone}</span>}
                </div>

                {a.whatsappMessages.length === 0 ? (
                  <p className="text-sm text-tx-3">Nenhuma mensagem ainda.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {a.whatsappMessages.map((m) => {
                      const out = m.direction === "OUT";
                      return (
                        <div key={m.id} className={out ? "flex justify-end" : "flex justify-start"}>
                          <div
                            className={
                              out
                                ? "max-w-[75%] bg-acao px-3 py-2 text-acao-tx"
                                : "max-w-[75%] bg-sf-apoio px-3 py-2 text-tx border border-regua"
                            }
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={out ? "mt-1 text-[10px] text-acao-tx/70 text-right" : "mt-1 text-[10px] text-tx-3"}>
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
                  <p className="mt-3 text-xs text-tx-3">
                    {a.waPhone ? "Canal WhatsApp não configurado." : "Este atendimento não tem WhatsApp vinculado."}
                  </p>
                )}
              </Card>
            )}

            <Card className="p-5 mb-5">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-tx">E-mail</h4>
                <p className="text-xs italic text-tx-3 mt-1.5">
                  Enviado usando a sua própria conta Google conectada. Se não conseguir enviar, reconecte sua conta em Configurações.
                </p>
              </div>

              {a.emailMessages.length === 0 ? (
                <p className="text-sm text-tx-3">Nenhum e-mail enviado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 mb-3">
                  {a.emailMessages.map((m) => (
                    <div key={m.id} className=" border border-regua bg-sf-apoio px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-tx">{m.subject}</p>
                        <span className="shrink-0 text-[10px] text-tx-3">
                          {formatDate(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-tx-3">
                        De {m.fromAddress} para {m.toAddress}
                      </p>
                      <p className="mt-1 text-sm text-tx whitespace-pre-wrap break-words">{m.body}</p>
                      {m.status === "FAILED" && (
                        <p className="mt-1 text-xs font-medium text-urgente">Falhou{m.errorMessage ? `: ${m.errorMessage}` : ""}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <EmailReplyPanel attendanceId={a.id} clientEmail={a.clientEmail} />
            </Card>

            <Card className="mb-5">
              <div className="flex items-start justify-between px-5 py-3 border-b border-regua gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tx">Tarefas / Kanban</h4>
                  <p className="text-xs italic text-tx-3 mt-1.5">
                    Tarefas e compromissos vinculados só a este atendimento — aparecem também na Agenda geral.
                  </p>
                </div>
                <NewTaskModal cases={[]} users={users} columns={columns} defaultAttendanceId={a.id} label="Criar Tarefa/Evento" />
              </div>
              {a.tasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa vinculada a este atendimento" />
              ) : (
                <div className="divide-y divide-regua">
                  {a.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.status === "CONCLUIDO" ? (
                            <ConclusionChip>{taskConclusionLabel(t.type)}</ConclusionChip>
                          ) : (
                            <>
                              <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                              <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                            </>
                          )}
                          <p className={`text-sm font-medium text-tx ${t.status === "CONCLUIDO" ? "line-through text-tx-3" : ""}`}>{t.title}</p>
                        </div>
                        {t.responsible && <p className="text-xs text-tx-3 mt-0.5">Responsável: {t.responsible.name}</p>}
                      </div>
                      <p className="text-xs font-semibold text-tx-2 shrink-0">{formatCalendarDate(t.dueDate)}</p>
                      <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir a tarefa "${t.title}"?`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tx">Anexos</h4>
                  <p className="text-xs italic text-tx-3 mt-1.5">
                    Documentos armazenados no Drive do escritório, vinculados a este atendimento.
                  </p>
                </div>
                <GerarDocumentoButton attendanceId={a.id} />
              </div>
              <AttachmentList attachments={serializedAttachments} attendanceId={a.id} driveConnected={storageConnected} />
            </Card>

            <Card className="p-5 mt-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Anotações pessoais</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                Anotações que você criou vinculadas a este atendimento (painel Anotações, ícone na borda direita da tela) — visíveis só para você.
              </p>
              <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-regua pb-2">
      <span className="text-tx-3">{label}</span>
      <span className="font-medium text-tx text-right">{value || "—"}</span>
    </div>
  );
}
