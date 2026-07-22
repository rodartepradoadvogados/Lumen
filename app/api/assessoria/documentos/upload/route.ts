import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive, uploadFileToDriveFolder } from "@/lib/googleDrive";

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
  const assessoriaId = formData.get("assessoriaId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (typeof assessoriaId !== "string" || !assessoriaId) {
    return NextResponse.json({ error: "Assessoria inválida." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  const assessoria = await prisma.assessoria.findUnique({ where: { id: assessoriaId } });
  if (!assessoria) {
    return NextResponse.json({ error: "Assessoria não encontrada." }, { status: 404 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { webViewLink } = assessoria.driveFolderId
      ? await uploadFileToDriveFolder(file.name, file.type || "application/octet-stream", buffer, assessoria.driveFolderId)
      : await uploadFileToDrive(file.name, file.type || "application/octet-stream", buffer);

    const doc = await prisma.assessoriaDocumento.create({
      data: {
        assessoriaId,
        name: typeof name === "string" && name ? name : file.name,
        docType: typeof docType === "string" && docType ? docType : "OUTRO",
        driveUrl: webViewLink,
        uploadedById: user.id,
      },
    });

    return NextResponse.json({ id: doc.id, name: doc.name, driveUrl: doc.driveUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
