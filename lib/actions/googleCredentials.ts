"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

// Remove uma conta Google de captura de publicações (GoogleCredential) — conexão pessoal de um
// advogado ou caixa compartilhada conectada pelo admin (ver Conexões → Arquivos → Google Drive).
// A conta PRINCIPAL do Drive do escritório (isPrimaryDrive) nunca é removida por aqui: ela também
// guarda os ids de pasta em cache (rootFolderId/folderId/...) e apagá-la quebraria os anexos —
// quem quiser trocar essa conta usa o botão "Reconectar Google (Drive)", que já trata isso (ver
// lib/googleDrive.ts:saveTokensFromCode).
export async function removerEmailPublicacoes(credentialId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };

  const cred = await prisma.googleCredential.findUnique({ where: { id: credentialId } });
  if (!cred || cred.officeId !== viewer.officeId) {
    return { error: "E-mail não encontrado." };
  }
  if (cred.isPrimaryDrive) {
    return { error: 'Esta é a conta principal do Google Drive do escritório — use o botão "Reconectar Google (Drive)" para trocá-la.' };
  }
  // Admin remove qualquer e-mail do escritório; um advogado comum só o próprio.
  if (!viewer.isAdmin && cred.userId !== viewer.id) {
    return { error: "Você só pode remover o seu próprio e-mail." };
  }

  await prisma.googleCredential.delete({ where: { id: credentialId } });
  revalidatePath("/conexoes");
  revalidatePath("/perfil");
  return {};
}
