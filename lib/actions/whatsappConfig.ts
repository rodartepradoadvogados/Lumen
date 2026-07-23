"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export async function saveWhatsappConfig(data: {
  phoneNumberId: string;
  accessToken: string;
  displayPhone?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem configurar o WhatsApp do escritório." };

  const phoneNumberId = data.phoneNumberId.trim();
  const accessToken = data.accessToken.trim();
  if (!phoneNumberId) return { error: "Informe o Phone Number ID." };
  if (!accessToken) return { error: "Informe o token de acesso." };

  const conflicting = await prisma.whatsappConfig.findUnique({ where: { phoneNumberId } });
  if (conflicting && conflicting.officeId !== viewer.officeId) {
    return { error: "Esse Phone Number ID já está cadastrado em outro escritório." };
  }

  await prisma.whatsappConfig.upsert({
    where: { officeId: viewer.officeId },
    create: { officeId: viewer.officeId, phoneNumberId, accessToken, displayPhone: data.displayPhone?.trim() || null },
    update: { phoneNumberId, accessToken, displayPhone: data.displayPhone?.trim() || null },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWhatsappConfig(): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem desconectar o WhatsApp." };
  await prisma.whatsappConfig.deleteMany({ where: { officeId: viewer.officeId } });
  revalidatePath("/configuracoes");
  return {};
}
