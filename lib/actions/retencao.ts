"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { prazoDeRetencaoValido } from "@/lib/retencaoRegras";

/**
 * Liga (12, 18, 24 ou 36 meses) ou desliga (null) a eliminação automática de atendimentos sem
 * desfecho do escritório. Só administrador, e a checagem é aqui, e não só na tela: quem souber o
 * nome da ação a chamaria do console do navegador. Eliminar é irreversível, então nada além dos
 * prazos da lista é aceito.
 */
export async function salvarRetencaoDeAtendimentos(meses: number | null): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user || !user.active || !user.isAdmin) {
    return { error: "Apenas administradores do escritório podem mudar o prazo de guarda das conversas." };
  }
  if (meses !== null && !prazoDeRetencaoValido(meses)) return { error: "Prazo inválido." };

  const config = await prisma.whatsappConfig.findUnique({ where: { officeId: user.officeId }, select: { id: true } });
  if (!config) return { error: "Conecte o WhatsApp do escritório antes de definir a guarda das conversas." };

  await prisma.whatsappConfig.update({
    where: { officeId: user.officeId },
    data: { retencaoAtendimentosMeses: meses },
  });
  revalidatePath("/configuracoes");
  return {};
}
