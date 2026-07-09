import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive } from "@/lib/googleDrive";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const caseId = formData.get("caseId");
  const attendanceId = formData.get("attendanceId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { webViewLink } = await uploadFileToDrive(file.name, file.type || "application/octet-stream", buffer);

    const attachment = await prisma.attachment.create({
      data: {
        name: file.name,
        driveUrl: webViewLink,
        caseId: typeof caseId === "string" && caseId ? caseId : null,
        attendanceId: typeof attendanceId === "string" && attendanceId ? attendanceId : null,
        uploadedById: user.id,
      },
    });

    return NextResponse.json({ id: attachment.id, name: attachment.name, driveUrl: attachment.driveUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
