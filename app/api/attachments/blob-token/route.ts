import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/currentUser";

// Gera o token de upload direto pro Vercel Blob (etapa 1 do fluxo de anexos grandes — ver
// lib/actions/attachments.ts:finalizeAttachmentUpload para a etapa 2). Isso existe porque uma
// Vercel Serverless Function tem um limite de payload de entrada bem menor que os 25MB que os
// anexos já suportavam (ex.: processo completo em PDF) — enviando o arquivo direto do navegador
// pro Blob, a function nunca recebe o corpo grande, só os poucos KB deste token.
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
      }),
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar token de upload." },
      { status: 400 }
    );
  }
}
