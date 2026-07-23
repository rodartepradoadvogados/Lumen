"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

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
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem gerenciar modelos de documento." };

  await prisma.documentTemplate.create({
    data: { name: data.name, category: data.category, driveUrl: data.driveUrl, uploadedById: user.id, officeId: user.officeId },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteDocumentTemplate(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem excluir modelos de documento." };

  await prisma.documentTemplate.deleteMany({ where: { id, officeId: user.officeId } });
  revalidatePath("/configuracoes");
  return {};
}
