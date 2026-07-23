"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { extractDriveFileId, isGoogleDocFile } from "@/lib/googleDrive";

export async function listDocumentTemplates(): Promise<{ id: string; name: string; category: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const templates = await prisma.documentTemplate.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true },
  });
  return templates;
}

export async function createDocumentTemplateLink(data: { name: string; category: string; driveUrl: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas administradores podem gerenciar modelos de documento." };

  // A geração de documento (lib/actions/generateDocument.ts) só consegue preencher os
  // placeholders {{CHAVE}} em Google Docs nativos — um link pra um .docx/.pdf salvo no Drive
  // "funciona" tecnicamente (copia o arquivo), mas devolve o documento sem nenhum dado
  // preenchido, sem erro nenhum. Melhor recusar aqui do que deixar o usuário descobrir depois.
  const fileId = extractDriveFileId(data.driveUrl);
  if (!fileId) return { error: "Não foi possível reconhecer esse link como um arquivo do Google Drive." };
  let isGoogleDoc: boolean;
  try {
    isGoogleDoc = await isGoogleDocFile(fileId, user.officeId);
  } catch {
    return { error: "Não foi possível acessar esse arquivo no Google Drive. Confira se o link está correto e se o Drive está conectado." };
  }
  if (!isGoogleDoc) {
    return {
      error:
        "Esse link não é de um Google Docs — é um arquivo do Word, PDF ou outro formato salvo no Drive. Para os dados serem preenchidos automaticamente, o modelo precisa ser um Google Docs nativo: abra o arquivo no Drive, use \"Abrir com > Google Docs\" (isso cria uma cópia convertida) e cole o link dessa cópia, ou envie o arquivo Word pelo botão de upload acima, que converte automaticamente.",
    };
  }

  await prisma.documentTemplate.create({
    data: { name: data.name, category: data.category, driveUrl: data.driveUrl, uploadedById: user.id, officeId: user.officeId },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteDocumentTemplate(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas administradores podem excluir modelos de documento." };

  await prisma.documentTemplate.deleteMany({ where: { id, officeId: user.officeId } });
  revalidatePath("/configuracoes");
  return {};
}
