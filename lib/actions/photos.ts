"use server";

import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

// Lista toda a biblioteca de fotos, mais recentes primeiro — usada tanto na
// aba de gerenciamento (Configurações → Blog Jurídico → Fotos) quanto na
// sugestão automática do picker de imagem do blog.
export async function listPhotos() {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  return prisma.photo.findMany({ where: { officeId: viewer.officeId }, orderBy: { createdAt: "desc" } });
}

// Exclui uma foto: remove o arquivo do Vercel Blob (se ainda existir lá) e o
// registro no banco.
export async function deletePhoto(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem excluir fotos da biblioteca." };

  const photo = await prisma.photo.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!photo) return { error: "Foto não encontrada." };

  try {
    await del(photo.url);
  } catch (err) {
    // Se o blob já não existir mais (ou o storage não estiver configurado),
    // seguimos em frente e removemos o registro do banco mesmo assim.
    console.error("Erro ao excluir foto do Vercel Blob (prosseguindo com a exclusão do registro):", err);
  }

  await prisma.photo.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}
