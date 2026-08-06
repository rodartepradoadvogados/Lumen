import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive, uploadFileToDriveFolder, getOrCreateParecerFolder } from "@/lib/storageProvider";

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
  // Opcional: quando presente, o arquivo entra DENTRO de um Parecer (pasta de documentos, ver
  // model Parecer) em vez de ir direto para a pasta da categoria na raiz da empresa — ver
  // components/assessoria/ParecerFolderRow.tsx, que é quem manda este campo.
  const parecerId = formData.get("parecerId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (typeof assessoriaId !== "string" || !assessoriaId) {
    return NextResponse.json({ error: "Assessoria inválida." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId }, include: { client: true } });
  if (!assessoria) {
    return NextResponse.json({ error: "Assessoria não encontrada." }, { status: 404 });
  }

  let parecer: { id: string; name: string } | null = null;
  if (typeof parecerId === "string" && parecerId) {
    parecer = await prisma.parecer.findFirst({ where: { id: parecerId, assessoriaId, officeId: user.officeId }, select: { id: true, name: true } });
    if (!parecer) {
      return NextResponse.json({ error: "Parecer não encontrado." }, { status: 404 });
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    let folderId: string | null = null;
    if (parecer) {
      folderId = await getOrCreateParecerFolder(parecer.id, assessoria.client.name, parecer.name, user.officeId);
    } else {
      folderId = assessoria.driveFolderId;
    }

    const result = folderId
      ? await uploadFileToDriveFolder(file.name, file.type || "application/octet-stream", buffer, folderId, user.officeId)
      : await uploadFileToDrive(file.name, file.type || "application/octet-stream", buffer, user.officeId);

    const doc = await prisma.assessoriaDocumento.create({
      data: {
        officeId: user.officeId,
        assessoriaId,
        name: typeof name === "string" && name ? name : file.name,
        docType: typeof docType === "string" && docType ? docType : "OUTRO",
        driveUrl: result.webViewLink,
        uploadedById: user.id,
        storageProvider: result.storageProvider,
        storageFileId: result.id,
        parecerId: parecer?.id || null,
      },
    });

    return NextResponse.json({ id: doc.id, name: doc.name, driveUrl: doc.driveUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
