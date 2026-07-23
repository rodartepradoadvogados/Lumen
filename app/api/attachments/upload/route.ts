import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import {
  uploadFileToDrive,
  uploadFileToDriveFolder,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateCategoryFolder,
} from "@/lib/googleDrive";
import { getDocumentTypeLabel } from "@/lib/documentTypes";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name");
  const docType = formData.get("docType");
  const caseId = formData.get("caseId");
  const attendanceId = formData.get("attendanceId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  const resolvedDocType = typeof docType === "string" && docType ? docType : "OUTRO";
  const resolvedCaseId = typeof caseId === "string" && caseId ? caseId : null;
  const resolvedAttendanceId = typeof attendanceId === "string" && attendanceId ? attendanceId : null;

  try {
    // Organiza o upload direto no Drive: uma pasta por processo/atendimento (criada sob
    // demanda), com uma subpasta por categoria de documento dentro dela — em vez da antiga
    // pasta única e plana "RP Financeiro - Anexos" pra todo o escritório.
    //
    // IMPORTANTE: caseId/attendanceId vêm do cliente — precisam ser validados contra o
    // officeId do usuário logado ANTES de virar o vínculo gravado no Attachment. Sem essa
    // checagem, um usuário de outro escritório poderia anexar um arquivo a um processo/
    // atendimento de outro escritório (o Attachment.caseId apontaria pra um registro que
    // não pertence a ele), e o anexo passaria a aparecer na página daquele processo.
    let targetFolderId: string | null = null;
    if (resolvedCaseId) {
      const c = await prisma.case.findFirst({ where: { id: resolvedCaseId, officeId: user.officeId }, select: { title: true } });
      if (!c) {
        return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
      }
      const containerFolderId = await getOrCreateCaseFolder(resolvedCaseId, c.title, user.officeId);
      targetFolderId = await getOrCreateCategoryFolder(containerFolderId, getDocumentTypeLabel(resolvedDocType), user.officeId);
    } else if (resolvedAttendanceId) {
      const a = await prisma.attendance.findFirst({ where: { id: resolvedAttendanceId, officeId: user.officeId }, select: { subject: true } });
      if (!a) {
        return NextResponse.json({ error: "Atendimento não encontrado." }, { status: 404 });
      }
      const containerFolderId = await getOrCreateAttendanceFolder(resolvedAttendanceId, a.subject, user.officeId);
      targetFolderId = await getOrCreateCategoryFolder(containerFolderId, getDocumentTypeLabel(resolvedDocType), user.officeId);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { webViewLink } = targetFolderId
      ? await uploadFileToDriveFolder(file.name, file.type || "application/octet-stream", buffer, targetFolderId, user.officeId)
      : await uploadFileToDrive(file.name, file.type || "application/octet-stream", buffer, user.officeId);

    const attachment = await prisma.attachment.create({
      data: {
        officeId: user.officeId,
        name: typeof name === "string" && name ? name : file.name,
        driveUrl: webViewLink,
        docType: resolvedDocType,
        caseId: resolvedCaseId,
        attendanceId: resolvedAttendanceId,
        uploadedById: user.id,
      },
    });

    return NextResponse.json({ id: attachment.id, name: attachment.name, driveUrl: attachment.driveUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
