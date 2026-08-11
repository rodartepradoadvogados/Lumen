"use server";

// Ação de servidor para "criar pasta a pedido" dentro de um processo/caso (Case.driveFolderId) —
// hoje só a Assessoria tem esse recurso (ver components/assessoria/*), agnóstica de provedor de
// armazenamento (Google Drive/OneDrive/Dropbox, ver lib/storageProvider.ts). A UI que consome esta
// ação NÃO é posse desta entrega — fica pronta e tipada aqui; ver relatório para a assinatura.
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getOrCreateCaseFolder, createNamedFolder } from "@/lib/storageProvider";
import { translateDriveError } from "@/lib/googleDrive";

export async function createCaseSubfolder(caseId: string, name: string): Promise<{ id?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Informe um nome para a pasta." };

  const c = await prisma.case.findFirst({ where: { id: caseId, officeId: user.officeId }, select: { title: true } });
  if (!c) return { error: "Processo não encontrado." };

  try {
    const containerFolderId = await getOrCreateCaseFolder(caseId, c.title, user.officeId);
    const folder = await createNamedFolder(containerFolderId, trimmed, user.officeId);
    return { id: folder.id };
  } catch (e) {
    console.error("[createCaseSubfolder] falha ao criar pasta:", e);
    return { error: translateDriveError(e, `criar a pasta "${trimmed}"`) };
  }
}
