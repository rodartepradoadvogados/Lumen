import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { uploadFileToDrive } from "@/lib/googleDrive";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Apenas Jairo ou Rodrigo podem gerenciar modelos de documento." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name");
  const category = formData.get("category");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Informe um nome para o modelo." }, { status: 400 });
  }
  if (typeof category !== "string" || !category) {
    return NextResponse.json({ error: "Selecione a categoria do modelo." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { webViewLink } = await uploadFileToDrive(file.name, file.type || "application/octet-stream", buffer, "modelos");

    const template = await prisma.documentTemplate.create({
      data: { name: name.trim(), category, driveUrl: webViewLink, uploadedById: user.id },
    });

    return NextResponse.json({ id: template.id, name: template.name, category: template.category, driveUrl: template.driveUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
