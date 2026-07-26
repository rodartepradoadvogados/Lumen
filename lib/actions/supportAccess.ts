"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { closeSupportAccess, approveAccessRequest, denyAccessRequest } from "@/lib/supportAccess";

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

// Ação do lado do ESCRITÓRIO (Passo 3a): só um sócio (isAdmin) escolhe a política de acesso de
// suporte do próprio escritório.
export async function setSupportAccessPolicy(policy: "AUTO" | "APROVACAO"): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Só administradores podem mudar esta política." };

  await prisma.office.update({ where: { id: viewer.officeId }, data: { supportAccessPolicy: policy } });
  revalidatePath("/configuracoes/acessos");
  return {};
}

// Ações do lado do ESCRITÓRIO (Passo 3a): só um sócio (isAdmin) aprova ou nega um pedido de
// acesso de suporte pendente. A validação de que o pedido pertence a este escritório acontece
// dentro de lib/supportAccess.ts (approveAccessRequest/denyAccessRequest) — aqui só resolve
// quem está chamando e repassa officeId/id de verdade, nunca confia em nada vindo do cliente
// além do requestId.
export async function approveAccessRequestAsOffice(requestId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Só administradores podem aprovar acesso de suporte." };

  const result = await approveAccessRequest(requestId, viewer.officeId, viewer.id);
  revalidatePath("/configuracoes/acessos");
  return result;
}

export async function denyAccessRequestAsOffice(requestId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Só administradores podem negar acesso de suporte." };

  const result = await denyAccessRequest(requestId, viewer.officeId, viewer.id);
  revalidatePath("/configuracoes/acessos");
  return result;
}
