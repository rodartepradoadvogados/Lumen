"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { closeSupportAccess } from "@/lib/supportAccess";

// Ação do lado do ESCRITÓRIO: qualquer usuário do escritório pode encerrar uma sessão de
// suporte da Lúmen ativa — é o cliente no controle, não o fornecedor (ver
// components/SupportAccessBanner.tsx e app/(app)/configuracoes/acessos/page.tsx). Confirma que
// a sessão pertence ao escritório de quem está chamando antes de encerrar, pra ninguém
// conseguir encerrar a sessão de outro escritório só adivinhando um id.
export async function endSupportAccessAsOffice(sessionId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const session = await prisma.accessSession.findUnique({
    where: { id: sessionId },
    include: { request: { select: { officeId: true } } },
  });
  // Sessão já não existe (ou já foi encerrada e limpa) — trata como sucesso, idempotente: o
  // objetivo do usuário ("parar de estar sob acesso de suporte") já está satisfeito.
  if (!session) return {};
  if (session.request.officeId !== viewer.officeId) {
    return { error: "Esta sessão não pertence ao seu escritório." };
  }

  await closeSupportAccess(sessionId, "ESCRITORIO");
  revalidatePath("/configuracoes/acessos");
  return {};
}
