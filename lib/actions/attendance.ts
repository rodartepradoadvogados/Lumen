"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { sendWhatsappText } from "@/lib/whatsapp";
import { sendEmailReply } from "@/lib/gmailSend";

export async function createAttendance(data: {
  clientName: string;
  contact?: string;
  subject: string;
  area?: string;
  description?: string;
  channel: string;
  responsibleId?: string;
  estimatedValue?: number | null;
  leadSource?: string;
  nextContactAt?: string;
}) {
  await prisma.attendance.create({
    data: {
      clientName: data.clientName,
      contact: data.contact || null,
      subject: data.subject,
      area: data.area || null,
      description: data.description || null,
      channel: data.channel,
      responsibleId: data.responsibleId || null,
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      stageChangedAt: new Date(),
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
}

export async function updateAttendanceStatus(id: string, status: string) {
  await prisma.attendance.update({ where: { id }, data: { status } });
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
}

// ===== Funil comercial (CRM de captação) — eixo independente do status operacional =====

export async function setAttendanceStage(id: string, stage: string, lostReason?: string) {
  await prisma.attendance.update({
    where: { id },
    data: {
      stage,
      stageChangedAt: new Date(),
      // motivo só é gravado (ou limpo) quando o estágio é PERDIDO
      lostReason: stage === "PERDIDO" ? lostReason || null : null,
      // não mexe no `status` operacional: os dois eixos são independentes
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
}

export async function updateAttendanceCommercial(
  id: string,
  data: { estimatedValue?: number | null; leadSource?: string | null; nextContactAt?: string | null }
) {
  await prisma.attendance.update({
    where: { id },
    data: {
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
}

// ===== WhatsApp: responder ao cliente pelo número oficial da Meta =====

export async function replyWhatsapp(attendanceId: string, body: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const text = body.trim();
  if (!text) return { error: "Digite uma mensagem antes de enviar." };

  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.waPhone) return { error: "Este atendimento não tem WhatsApp vinculado." };

  const result = await sendWhatsappText(attendance.waPhone, text);
  if (!result.ok) {
    return { error: result.error || "Não foi possível enviar a mensagem." };
  }

  await prisma.whatsappMessage.create({
    data: {
      attendanceId,
      direction: "OUT",
      body: text,
      waMessageId: result.waMessageId || null,
      status: "SENT",
      fromNumber: attendance.waPhone,
    },
  });

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { waLastMessageAt: new Date() },
  });

  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

// ===== E-mail: responder ao cliente usando a conta Google do próprio advogado logado =====

export async function updateAttendanceClientEmail(attendanceId: string, clientEmail: string): Promise<{ error?: string }> {
  const email = clientEmail.trim();
  await prisma.attendance.update({ where: { id: attendanceId }, data: { clientEmail: email || null } });
  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

export async function replyEmail(attendanceId: string, subject: string, body: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const subjectText = subject.trim();
  const bodyText = body.trim();
  if (!subjectText || !bodyText) return { error: "Preencha o assunto e a mensagem antes de enviar." };

  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.clientEmail) return { error: "Este atendimento não tem e-mail do cliente cadastrado." };

  const result = await sendEmailReply(user.id, attendance.clientEmail, subjectText, bodyText);

  // fromAddress para exibição no histórico: a conta Google conectada do usuário (a que efetivamente envia),
  // com fallback para o e-mail de login caso ele ainda não tenha conectado nenhuma conta.
  const cred = await prisma.googleCredential.findFirst({ where: { userId: user.id } });
  const fromAddress = cred?.accountEmail || user.email;

  await prisma.emailMessage.create({
    data: {
      attendanceId,
      direction: "OUT",
      toAddress: attendance.clientEmail,
      fromAddress,
      subject: subjectText,
      body: bodyText,
      sentByUserId: user.id,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error || "Falha desconhecida ao enviar e-mail.",
    },
  });

  revalidatePath(`/atendimento/${attendanceId}`);

  if (!result.ok) {
    return { error: result.error || "Não foi possível enviar o e-mail." };
  }
  return {};
}

export async function convertAttendanceToCase(
  attendanceId: string,
  data: { type: string; processNumber?: string; court?: string }
) {
  const attendance = await prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } });

  let client = await prisma.client.findFirst({ where: { name: { equals: attendance.clientName, mode: "insensitive" } } });
  if (!client) {
    client = await prisma.client.create({ data: { name: attendance.clientName, type: "PF" } });
  }

  const created = await prisma.case.create({
    data: {
      title: attendance.subject,
      type: data.type,
      area: attendance.area || null,
      description: attendance.description || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      clientId: client.id,
      responsibleId: attendance.responsibleId,
    },
  });

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { status: "CONVERTIDO", convertedCaseId: created.id },
  });

  revalidatePath("/atendimento");
  revalidatePath("/processos");
  redirect(`/processos/${created.id}`);
}
