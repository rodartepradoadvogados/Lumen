"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { sendWhatsappText } from "@/lib/whatsapp";
import { sendEmailReply } from "@/lib/gmailSend";
import { renameDriveFolder } from "@/lib/storageProvider";
import { isClientInOffice, isUserInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { getOfficeModules } from "@/lib/officeModules";
import { normalizeForCompare } from "@/lib/textNormalize";
import { createAttendancePendencias, type PendenciaInput } from "@/lib/actions/attendancePendencias";

async function assertAttendanceRelationsInOffice(
  data: { clientId?: string; responsibleId?: string; assessoriaId?: string },
  officeId: string
): Promise<void> {
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.assessoriaId && !(await isAssessoriaInOffice(data.assessoriaId, officeId))) throw new Error("Assessoria não encontrada.");
}

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
  assessoriaId?: string;
  // Prazo de resposta ao lead (Fase 5) — vem já calculado do client (default 24h após a criação,
  // editável na janela), string ISO/datetime-local.
  responseDeadline?: string;
  // Honorário pretendido (Fase 5) — ver comentário do schema (Attendance.feeMode e vizinhos).
  feeMode?: string;
  feePercentual?: number | null;
  feePercentualBase?: string;
  // Pendências marcadas já na criação (Fase 5) — criadas depois do Attendance existir, na mesma
  // chamada (precisa do id gerado).
  pendencias?: PendenciaInput[];
};

export async function createAttendance(data: CreateAttendanceInput): Promise<{ id: string; newClientId?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    throw new Error("O módulo Atendimento não está incluído no plano deste escritório.");
  }
  await assertAttendanceRelationsInOffice(data, viewer.officeId);

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
        officeId: viewer.officeId,
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
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : new Date(Date.now() + 24 * 3600 * 1000),
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
    },
  });

  if (data.pendencias && data.pendencias.length > 0) {
    await createAttendancePendencias(created.id, data.pendencias);
  }

  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  return { id: created.id, newClientId };
}

// Checagem de conflito de interesses (Fase 5) — nome digitado no "Nome do Contato" contra a parte
// adversa de qualquer processo do escritório (CaseParty.name + o campo legado
// Case.opposingPartyName). Comparação tolerante (sem acento/caixa/espaços — ver
// lib/textNormalize.ts) porque o mesmo nome quase nunca é digitado igual duas vezes. Não bloqueia
// nada — só avisa (ver NewAttendanceModal.tsx); a decisão de seguir ou não é sempre do advogado.
export async function checkOpposingPartyConflict(
  name: string
): Promise<{ id: string; title: string; processNumber: string | null }[]> {
  const q = name.trim();
  if (q.length < 3) return [];
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const target = normalizeForCompare(q);

  const [byParty, byLegacyField] = await Promise.all([
    prisma.caseParty.findMany({
      where: { case: { officeId: viewer.officeId } },
      select: { name: true, case: { select: { id: true, title: true, processNumber: true } } },
    }),
    prisma.case.findMany({
      where: { officeId: viewer.officeId, opposingPartyName: { not: null } },
      select: { id: true, title: true, processNumber: true, opposingPartyName: true },
    }),
  ]);

  const matches = new Map<string, { id: string; title: string; processNumber: string | null }>();
  for (const p of byParty) {
    if (normalizeForCompare(p.name) === target) matches.set(p.case.id, p.case);
  }
  for (const c of byLegacyField) {
    if (c.opposingPartyName && normalizeForCompare(c.opposingPartyName) === target) {
      matches.set(c.id, { id: c.id, title: c.title, processNumber: c.processNumber });
    }
  }
  return Array.from(matches.values());
}

export async function markAttendanceResponded(attendanceId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  await prisma.attendance.updateMany({
    where: { id: attendanceId, officeId: viewer.officeId, firstResponseAt: null },
    data: { firstResponseAt: new Date() },
  });
  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

// Rascunho: salva o que já foi preenchido para retomar depois. Nunca cria um Client novo
// aqui (mesmo que o modo "novo cliente" estivesse selecionado) para não deixar cadastro
// órfão no caso do rascunho nunca ser finalizado.
export async function saveAttendanceDraft(
  data: Omit<CreateAttendanceInput, "isNewClient">
): Promise<{ id: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    throw new Error("O módulo Atendimento não está incluído no plano deste escritório.");
  }
  await assertAttendanceRelationsInOffice(data, viewer.officeId);

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
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : new Date(Date.now() + 24 * 3600 * 1000),
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
    },
  });

  if (data.pendencias && data.pendencias.length > 0) {
    await createAttendancePendencias(created.id, data.pendencias);
  }

  revalidatePath("/atendimento");
  return { id: created.id };
}

export async function searchClients(query: string): Promise<{ id: string; name: string; phone: string | null; email: string | null }[]> {
  const q = query.trim();
  if (!q) return [];
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const clients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" }, officeId: viewer.officeId },
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
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  await prisma.client.updateMany({
    where: { id: clientId, officeId: viewer.officeId },
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
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.attendance.updateMany({ where: { id, officeId: viewer.officeId }, data: { status } });
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/m/atendimento");
  revalidatePath(`/m/atendimento/${id}`);
}

// ===== Funil comercial (CRM de captação) — eixo independente do status operacional =====

export async function setAttendanceStage(id: string, stage: string, lostReason?: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");

  // Motivo da perda passou a ser OBRIGATÓRIO (Fase 5) — é o que alimenta o relatório de captação.
  // Quem chama isto para PERDIDO precisa já ter coletado o motivo antes (ver
  // components/AttendanceLostReasonModal.tsx, opções fechadas + "Outro" com texto livre) — aqui só
  // se recusa a gravar um PERDIDO sem motivo, não decide QUAL motivo.
  if (stage === "PERDIDO" && !lostReason?.trim()) {
    return { error: "Informe o motivo da perda antes de mover para Perdido." };
  }

  await prisma.attendance.updateMany({
    where: { id, officeId: viewer.officeId },
    data: {
      stage,
      stageChangedAt: new Date(),
      // motivo só é gravado (ou limpo) quando o estágio é PERDIDO
      lostReason: stage === "PERDIDO" ? lostReason!.trim() : null,
      // não mexe no `status` operacional: os dois eixos são independentes
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
  return {};
}

export async function updateAttendanceCommercial(
  id: string,
  data: {
    estimatedValue?: number | null;
    leadSource?: string | null;
    nextContactAt?: string | null;
    // Fase 5 — honorário pretendido e prazo de resposta, editáveis junto com o resto do bloco
    // "Comercial (Funil)" da tela de detalhe (ver AttendanceCommercialForm.tsx).
    feeMode?: string | null;
    feePercentual?: number | null;
    feePercentualBase?: string | null;
    responseDeadline?: string | null;
  }
) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.attendance.updateMany({
    where: { id, officeId: viewer.officeId },
    data: {
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : null,
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

  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: user.officeId } });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.waPhone) return { error: "Este atendimento não tem WhatsApp vinculado." };

  const result = await sendWhatsappText(user.officeId, attendance.waPhone, text);
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
      officeId: user.officeId,
    },
  });

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      waLastMessageAt: new Date(),
      // Primeira resposta ao lead (Fase 5) — só carimba se ainda estiver nula, nunca sobrescreve.
      firstResponseAt: attendance.firstResponseAt ?? new Date(),
    },
  });

  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

// ===== E-mail: responder ao cliente usando a conta Google do próprio advogado logado =====

export async function updateAttendanceClientEmail(attendanceId: string, clientEmail: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const email = clientEmail.trim();
  await prisma.attendance.updateMany({ where: { id: attendanceId, officeId: viewer.officeId }, data: { clientEmail: email || null } });
  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

export async function replyEmail(attendanceId: string, subject: string, body: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const subjectText = subject.trim();
  const bodyText = body.trim();
  if (!subjectText || !bodyText) return { error: "Preencha o assunto e a mensagem antes de enviar." };

  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: user.officeId } });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.clientEmail) return { error: "Este atendimento não tem e-mail do cliente cadastrado." };

  const result = await sendEmailReply(user.id, attendance.clientEmail, subjectText, bodyText);

  // fromAddress para exibição no histórico: a conta Google conectada do usuário (a que efetivamente envia),
  // com fallback para o e-mail de login caso ele ainda não tenha conectado nenhuma conta.
  const cred = await prisma.googleCredential.findFirst({ where: { userId: user.id, officeId: user.officeId } });
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
      officeId: user.officeId,
    },
  });

  // Primeira resposta ao lead (Fase 5) — só quando o envio realmente saiu, e só carimba se ainda
  // estiver nula (nunca sobrescreve a primeira resposta de verdade por uma resposta posterior).
  if (result.ok && !attendance.firstResponseAt) {
    await prisma.attendance.update({ where: { id: attendanceId }, data: { firstResponseAt: new Date() } });
  }

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
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");

  // Escopo por escritório logo na busca do atendimento: impede que alguém converta um
  // atendimento de OUTRO escritório só por conhecer/adivinhar o id.
  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: viewer.officeId } });
  if (!attendance) throw new Error("Atendimento não encontrado.");

  // Client/Case criados a partir daqui usam o officeId do PRÓPRIO atendimento (não o do viewer)
  // — na prática são sempre o mesmo escritório (já filtrado acima), mas a intenção correta é
  // "a conversão fica dentro do escritório dono do atendimento", não "dono de quem clicou".
  const officeId = attendance.officeId;

  // Prioriza o vínculo direto (cliente selecionado na busca ou recém-cadastrado ao criar
  // o atendimento); só recorre à busca/criação por nome para atendimentos antigos sem clientId.
  let client = attendance.clientId
    ? await prisma.client.findFirst({ where: { id: attendance.clientId, officeId } })
    : null;
  if (!client) {
    client = await prisma.client.findFirst({
      where: { name: { equals: attendance.clientName, mode: "insensitive" }, officeId },
    });
  }
  if (!client) {
    client = await prisma.client.create({ data: { name: attendance.clientName, type: "PF", officeId } });
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
      assessoriaId: attendance.assessoriaId,
      officeId,
    },
  });

  // Ownership do atendimento já foi verificada acima (findFirst com officeId), então o
  // update por id aqui é seguro.
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { status: "CONVERTIDO", convertedCaseId: created.id },
  });

  // Os anexos já enviados no atendimento passam a pertencer ao processo criado — e a MESMA
  // pasta do Drive (se já existir) é só renomeada e transferida, em vez de deixar uma pasta
  // órfã pra trás e criar outra do zero no próximo anexo.
  await prisma.attachment.updateMany({
    where: { attendanceId, officeId },
    data: { caseId: created.id, attendanceId: null },
  });
  if (attendance.driveFolderId) {
    try {
      await renameDriveFolder(attendance.driveFolderId, created.title, officeId);
      await prisma.case.update({ where: { id: created.id }, data: { driveFolderId: attendance.driveFolderId } });
    } catch {
      // Best-effort — se o Drive não estiver conectado ou a chamada falhar, o processo segue
      // criado normalmente; uma pasta nova será criada no próximo anexo, se precisar.
    }
  }

  revalidatePath("/atendimento");
  revalidatePath("/processos");
  revalidatePath("/m/atendimento");
  revalidatePath("/m/processos");

  // Honorário pretendido (Fase 5) — passado por querystring para o Processo novo só PRÉ-PREENCHER
  // o Lançar Honorários (ver LancarHonorariosModal.tsx, prop `prefill`/`autoOpen`); nunca cria a
  // cobrança sozinho. A tela mobile do Processo ignora esses parâmetros (não tem esse modal), então
  // é seguro incluir sempre, mesmo quando redirectBasePath é "/m/processos".
  const feeParams = new URLSearchParams();
  if (attendance.feeMode) {
    feeParams.set("honorarioPretendido", "1");
    feeParams.set("feeMode", attendance.feeMode);
    if (attendance.estimatedValue != null) feeParams.set("feeAmount", String(attendance.estimatedValue));
    if (attendance.feePercentual != null) feeParams.set("feePercentual", String(attendance.feePercentual));
    if (attendance.feePercentualBase) feeParams.set("feePercentualBase", attendance.feePercentualBase);
  }
  const qs = feeParams.toString();
  redirect(`${redirectBasePath}/${created.id}${qs ? `?tab=financeiro&${qs}` : ""}`);
}
