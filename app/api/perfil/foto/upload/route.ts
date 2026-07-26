import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Cada pessoa só envia a PRÓPRIA foto de perfil — sem officeId/admin, autosserviço puro (mesmo
// padrão de lib/actions/profile.ts). O Blob Store do projeto (lumen-attachments) está
// provisionado como PÚBLICO — access:"private" é rejeitado com "Cannot use private access on a
// public store" — então o blob já nasce com URL pública; /api/perfil/foto/[userId] só
// redireciona para ela, mantendo o mesmo caminho estável de sempre nas outras telas.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "O arquivo precisa ser uma imagem." }, { status: 400 });
  }

  try {
    const blob = await put(`perfil/${user.id}-${Date.now()}-${file.name}`, file, { access: "public" });
    await prisma.user.update({ where: { id: user.id }, data: { photoUrl: blob.url } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erro ao enviar foto de perfil para o Vercel Blob:", err);
    // Mostra o erro real do Vercel Blob em vez de assumir "não configurado" — o Blob Store já
    // existe neste projeto (usado pelas fotos do blog), então uma falha aqui é outra causa
    // (ex.: token sem permissão, limite de tamanho, etc.) e o texto do erro ajuda a identificar.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Erro ao enviar a foto: ${detail}` }, { status: 502 });
  }
}
