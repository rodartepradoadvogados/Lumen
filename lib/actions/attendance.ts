"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { sendWhatsappText } from "@/lib/whatsapp";
import { sendEmailReply } from "@/lib/gmailSend";

type CreateAttendanceInput = {
  clientName: string;
  contactPhone?: string;
  clientEmail?: string;
  clientId?: string;
  isNewClient?: boolean;
  subject: string;
  area?: string;
  description?: string;
  channel: string;
  responsibleId?: string;
  estimatedValue?: number | null;
  leadSource?: string;
  nextContactAt?: string;
};

export async function createAttendance(data: CreateAttendanceInput): Promise<{ id: string; newClientId?: string }> {
  // Resolve o vínculo com Client conforme o modo escolhido no formulário:
  // - clientId preenchido: cliente já cadastrado, selecionado via busca — usa direto.
  // - isNewClient: fluxo "Cadastrar novo cliente" finalizado (não é rascunho) — cria o Client agora.
  // - nenhum dos dois: atendimento rápido sem cliente formal ainda (comportamento antigo).
  let clientId = data.clientId || null;
  let newClientId: string | undefined;

  if (!clientId && data.isNewClient) {
    const client = await prisma.client.create({
      data: {
        name: data.clientName,
        type: "PF",
        phone: data.contactPhone || null,
        email: data.clientEmail || null,
      },
    });
    clientId = client.id;
    newClientId = client.id;
  }

  const created = await prisma.attendance.create({
    data: {
      clientName: data.clientName,
      contactPhone: data.contactPhone || null,
      clientEmail: data.clientEmail || null,
      clientId,
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
  return { id: created.id, newClientId };
}

// Rascunho: salva o que já foi preenchido para retomar depois. Nunca cria um Client novo
// aqui (mesmo que o modo "novo cliente" estivesse selecionado) para não deixar cadastro
// órfão no caso do rascunho nunca ser finalizado.
export async function saveAttendanceDraft(
  data: Omit<CreateAttendanceInput, "isNewClient">
): Promise<{ id: string }> {
  const created = await prisma.attendance.create({
    data: {
      clientName: data.clientName || "(rascunho sem nome)",
      contactPhone: data.contactPhone || null,
      clientEmail: data.clientEmail || null,
      clientId: data.clientId || null,
      subject: data.subject || "(rascunho)",
      area: data.area || null,
      description: data.description || null,
      channel: data.channel || "WHATSAPP",
      responsibleId: data.responsibleId || null,
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      status: "RASCUNHO",
      stageChangedAt: new Date(),
    },
  });
  revalidatePath("/atendimento");
  return { id: created.id };
}

export async function searchClients(query: string): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]> {
  const q = query.trim();
  if (!q) return [];
  const clients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return clients;
}

export async function updateClientQualification(
  clientId: string,
  data: {
    type?: string;
    document?: string;
    rg?: string;
    nationality?: string;
    maritalStatus?: string;
    profession?: string;
    address?: string;
    notes?: string;
  }
): Promise<{ error?: string }> {
  await prisma.client.update({
    where: { id: clientId },
    data: {
      type: data.type || undefined,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/contatos/clientes");
  revalidatePath(`/contatos/clientes/${clientId}`);
  revalidatePath("/contatos");
  return {};
}

export async function updateAttendanceStatus(id: string, status: string) {
  await prisma.attendance.update({ where: { id }, data: { status } });
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/m/atendimento");
  revalidatePath(`/m/atendimento/${id}`);
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
  data: { type: string; processNumber?: string; court?: string },
  // Base de redirecionamento pós-conversão. O desktop usa "/processos" (default, mantém
  // compatibilidade com o ConvertAttendanceForm existente); o app mobile passa "/m/processos"
  // para nunca navegar o usuário para uma rota do site desktop.
  redirectBasePath: string = "/processos"
) {
  const attendance = await prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } });

  // Prioriza o vínculo direto (cliente selecionado na busca ou recém-cadastrado ao criar
  // o atendimento); só recorre à busca/criação por nome para atendimentos antigos sem clientId.
  let client = attendance.clientId ? await prisma.client.findUnique({ where: { id: attendance.clientId } }) : null;
  if (!client) {
    client = await prisma.client.findFirst({ where: { name: { equals: attendance.clientName, mode: "insensitive" } } });
  }
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
  revalidatePath("/m/atendimento");
  revalidatePath("/m/processos");
  redirect(`${redirectBasePath}/${created.id}`);
}
