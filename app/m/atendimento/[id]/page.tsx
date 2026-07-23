import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, formatDate } from "@/components/ui";
import MobileAttendanceStatusSelect from "@/components/mobile/MobileAttendanceStatusSelect";
import MobileConvertAttendanceForm from "@/components/mobile/MobileConvertAttendanceForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

// Detalhe mobile do Atendimento. Escopo reduzido em relação ao desktop (app/(app)/atendimento/[id]):
// dados essenciais, troca de status e conversão em Caso/Processo; histórico de WhatsApp/E-mail é
// só leitura — responder pelo app mobile fica para uma tarefa futura, não é o foco aqui (o foco é
// nunca levar o usuário para uma tela do site desktop).
export default async function MobileAttendanceDetail({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const a = await prisma.attendance.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      responsible: true,
      convertedCase: true,
      whatsappMessages: { orderBy: { createdAt: "asc" } },
      emailMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!a) notFound();

  const showWhatsapp = Boolean(a.waPhone) || a.whatsappMessages.length > 0;
  const showEmail = a.emailMessages.length > 0;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m/atendimento"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Atendimento
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-serif text-lg font-bold text-navy-900 dark:text-cream-50 leading-tight">{a.clientName}</h1>
          <p className="text-sm text-navy-800/50 dark:text-cream-50/50 mt-0.5">{a.subject}</p>
        </div>
        <MobileAttendanceStatusSelect attendanceId={a.id} status={a.status} />
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
            <span className="text-navy-800/50 dark:text-cream-50/50 shrink-0">Convertido em</span>
            <Link href={`/m/processos/${a.convertedCase.id}`} className="font-medium text-gold-700 dark:text-gold-400 text-right">
              {a.convertedCase.title}
            </Link>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Descrição</h4>
        <p className="text-sm text-navy-800 dark:text-cream-50/80 whitespace-pre-wrap">{a.description || "Sem descrição."}</p>
      </Card>

      {!a.convertedCaseId && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50 mb-1">Transformar em Processo/Caso</h4>
          <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mb-3">
            Cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico deste atendimento.
          </p>
          <MobileConvertAttendanceForm attendanceId={a.id} />
        </Card>
      )}

      {showWhatsapp && (
        <Card className="p-4">
          <div className="flex items-start justify-between mb-3 gap-2">
            <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50">Conversa do WhatsApp</h4>
            {a.waPhone && <span className="text-xs text-navy-800/45 dark:text-cream-50/45 shrink-0">{a.waPhone}</span>}
          </div>

          {a.whatsappMessages.length === 0 ? (
            <p className="text-sm text-navy-800/45 dark:text-cream-50/45">Nenhuma mensagem ainda.</p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {a.whatsappMessages.map((m) => {
                const out = m.direction === "OUT";
                return (
                  <div key={m.id} className={out ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        out
                          ? "max-w-[80%] rounded-lg rounded-br-sm bg-navy-700 dark:bg-navy-800 px-3 py-2 text-white"
                          : "max-w-[80%] rounded-lg rounded-bl-sm bg-cream-100 dark:bg-white/5 px-3 py-2 text-navy-900 dark:text-cream-50 border border-navy-800/8 dark:border-white/10"
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

          <p className="mt-3 text-xs italic text-navy-800/40 dark:text-cream-50/40">Para responder, use o computador.</p>
        </Card>
      )}

      {showEmail && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-navy-900 dark:text-cream-50 mb-3">E-mail</h4>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {a.emailMessages.map((m) => (
              <div key={m.id} className="rounded-lg border border-navy-800/8 dark:border-white/10 bg-cream-100 dark:bg-white/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 truncate">{m.subject}</p>
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
          <p className="mt-3 text-xs italic text-navy-800/40 dark:text-cream-50/40">Para responder, use o computador.</p>
        </Card>
      )}
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
