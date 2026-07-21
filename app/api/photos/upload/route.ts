import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Apenas Jairo ou Rodrigo podem enviar fotos para a biblioteca." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const category = String(formData.get("category") || "").trim();
  const caption = String(formData.get("caption") || "").trim();

  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "O arquivo precisa ser uma imagem." }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Selecione uma categoria/área para a foto." }, { status: 400 });
  }

  try {
    const blob = await put(`photos/${Date.now()}-${file.name}`, file, { access: "public" });

    const photo = await prisma.photo.create({
      data: { url: blob.url, category, caption: caption || null },
    });

    return NextResponse.json({ photo });
  } catch (err) {
    console.error("Erro ao enviar foto para o Vercel Blob:", err);
    return NextResponse.json(
      {
        error:
          "Armazenamento de fotos ainda não configurado. Peça para o administrador criar um Blob Store em Storage → Create Database → Blob no painel do Vercel.",
      },
      { status: 503 }
    );
  }
}
