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
import { getDriveStatus } from "@/lib/googleDrive";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function AttendanceDetailPage({ params }: { params: { id: string } }) {
  const a = await prisma.attendance.findUnique({
    where: { id: params.id },
    include: {
      responsible: true,
      tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      convertedCase: true,
    },
  });
  if (!a) notFound();

  const [users, columns, driveStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    getDriveStatus(),
  ]);

  const serializedAttachments = a.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    createdAt: att.createdAt.toISOString(),
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <Link href="/atendimento" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 hover:text-navy-900 mb-3">
        <ArrowLeft size={13} /> Atendimento
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-serif text-2xl font-bold text-navy-900">{a.clientName}</h1>
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
      <p className="text-sm text-navy-800/50 mb-5">{a.subject}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card className="p-5 space-y-3">
          <Field label="Matéria" value={a.area} />
          <Field label="Canal" value={channelLabels[a.channel]} />
          <Field label="Contato" value={a.contact} />
          <Field label="Responsável pela triagem" value={a.responsible?.name} />
          <Field label="Data" value={formatDate(a.createdAt)} />
          {a.convertedCase && (
            <div className="flex justify-between text-sm border-b border-navy-800/5 pb-2">
              <span className="text-navy-800/50">Convertido em</span>
              <Link href={`/processos/${a.convertedCase.id}`} className="font-medium text-gold-700 hover:underline text-right">
                {a.convertedCase.title}
              </Link>
            </div>
          )}
          <div className="pt-2 border-t border-navy-800/8">
            <AttendanceCommercialForm
              attendanceId={a.id}
              estimatedValue={a.estimatedValue}
              leadSource={a.leadSource}
              nextContactAt={a.nextContactAt ? a.nextContactAt.toISOString() : null}
            />
          </div>
        </Card>
        <Card className="p-5">
          <h4 className="text-xs font-semibold text-navy-800/50 uppercase tracking-wide mb-2">Descrição detalhada</h4>
          <p className="text-sm text-navy-800 whitespace-pre-wrap">{a.description || "Sem descrição."}</p>
        </Card>
      </div>

      {!a.convertedCaseId && (
        <Card className="p-5 mb-5">
          <h4 className="text-sm font-semibold text-navy-900 mb-3">Transformar em Processo/Caso</h4>
          <ConvertAttendanceForm attendanceId={a.id} />
        </Card>
      )}

      <Card className="mb-5">
        <div className="flex items-center justify-between px-5 py-3 border-b border-navy-800/8">
          <h4 className="text-sm font-semibold text-navy-900">Tarefas / Kanban</h4>
          <NewTaskModal cases={[]} users={users} columns={columns} defaultAttendanceId={a.id} label="Criar Tarefa/Evento" />
        </div>
        {a.tasks.length === 0 ? (
          <EmptyState title="Nenhuma tarefa vinculada a este atendimento" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {a.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                    <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                    <p className="text-sm font-medium text-navy-900">{t.title}</p>
                  </div>
                  {t.responsible && <p className="text-xs text-navy-800/40 mt-0.5">Responsável: {t.responsible.name}</p>}
                </div>
                <p className="text-xs font-semibold text-navy-800/60 shrink-0">{formatDate(t.dueDate)}</p>
                <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir a tarefa "${t.title}"?`} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-navy-900">Anexos</h4>
          <GerarDocumentoButton attendanceId={a.id} />
        </div>
        <AttachmentList attachments={serializedAttachments} attendanceId={a.id} driveConnected={driveStatus.connected} />
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-navy-800/5 pb-2">
      <span className="text-navy-800/50">{label}</span>
      <span className="font-medium text-navy-900 text-right">{value || "—"}</span>
    </div>
  );
}
