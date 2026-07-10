"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { copyAndFillTemplate, extractDriveFileId } from "@/lib/googleDrive";

function buildFileName(templateName: string, subject: string) {
  const today = new Date().toLocaleDateString("pt-BR");
  return `${templateName} - ${subject} - ${today}`;
}

export async function generateDocumentFromTemplate(
  templateId: string,
  target: { caseId?: string; attendanceId?: string }
): Promise<{ driveUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { error: "Modelo não encontrado." };

  const fileId = extractDriveFileId(template.driveUrl);
  if (!fileId) return { error: "Não foi possível identificar o arquivo do modelo no Google Drive." };

  const replacements: Record<string, string> = {
    DATA: new Date().toLocaleDateString("pt-BR"),
  };
  let subject = "Documento";

  if (target.caseId) {
    const c = await prisma.case.findUnique({ where: { id: target.caseId }, include: { client: true, responsible: true } });
    if (!c) return { error: "Processo/caso não encontrado." };
    replacements.CLIENTE = c.client?.name ?? "";
    replacements.PROCESSO = c.title;
    replacements.NUMERO_PROCESSO = c.processNumber ?? "";
    replacements.VARA = c.court ?? "";
    replacements.FORO = c.forum ?? "";
    replacements.ADVOGADO = c.responsible?.name ?? "";
    replacements.PARTE_ADVERSA = c.opposingPartyName ?? "";
    replacements.POLO_PARTE_ADVERSA = c.opposingPartyRole ?? "";
    replacements.VALOR_CAUSA = c.caseValue != null ? c.caseValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
    replacements.MATERIA = c.area ?? "";
    subject = c.client?.name || c.title;
  } else if (target.attendanceId) {
    const a = await prisma.attendance.findUnique({ where: { id: target.attendanceId }, include: { responsible: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    replacements.CLIENTE = a.clientName;
    replacements.ASSUNTO = a.subject;
    replacements.MATERIA = a.area ?? "";
    replacements.DESCRICAO = a.description ?? "";
    replacements.ADVOGADO = a.responsible?.name ?? "";
    subject = a.clientName;
  } else {
    return { error: "Nenhum processo ou atendimento informado." };
  }

  try {
    const { webViewLink } = await copyAndFillTemplate(fileId, buildFileName(template.name, subject), replacements);

    await prisma.attachment.create({
      data: {
        name: buildFileName(template.name, subject),
        driveUrl: webViewLink,
        caseId: target.caseId || null,
        attendanceId: target.attendanceId || null,
        uploadedById: user.id,
      },
    });

    if (target.caseId) revalidatePath(`/processos/${target.caseId}`);
    if (target.attendanceId) revalidatePath(`/atendimento/${target.attendanceId}`);

    return { driveUrl: webViewLink };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const message = /invalid_request|invalid_grant|File not found|404/i.test(raw)
      ? "Não foi possível acessar o modelo no Google Drive. Verifique se o link do modelo está correto e se o Google Drive está conectado em Configurações."
      : raw || "Erro ao gerar documento.";
    return { error: message };
  }
}
