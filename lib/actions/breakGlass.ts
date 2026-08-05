"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revealRecord, requestRecordAccess, type RevealResult, type RequestAccessResult } from "@/lib/breakGlass";
import { isRecordScopeType } from "@/lib/recordScope";
import type { AccessReasonCode } from "@/lib/supportAccessConstants";

// Server Actions do quebra-vidro POR REGISTRO (Fase B) — lado do SUPORTE. A lógica de
// autorização mora em lib/breakGlass.ts (testável sem cookies/requisição); aqui só se resolve
// QUEM está chamando (getCurrentUser) e se valida o que vem do client antes de repassar.
//
// As duas ações abaixo só fazem sentido de dentro de uma sessão de suporte mascarada já aberta
// (viewer.supportMasked && viewer.actingAsOffice) — nunca chamadas pelo escritório-cliente, e
// nunca abrem sessão nova nem tocam em openSupportAccess/lib/officeActing.ts.

// Resolve o PlatformMember de quem está de fato chamando. Em sessão mascarada, viewer.id
// continua sendo o User.id REAL do platform owner (lib/currentUser.ts não sobrescreve `id` no
// override de "atuar como" — só officeId/isAdmin/actingAsOffice/supportMasked/supportVisibility),
// então basta olhar o vínculo userId -> PlatformMember. Sem vínculo, sem quebra-vidro: falha
// fecha, não cria nada sob demanda aqui (diferente do bootstrap de lib/supportAccess.ts —
// abrir uma sessão de suporte já exige esse vínculo existir antes, então se chegou até aqui
// dentro de uma sessão ativa, o vínculo já deveria existir; se não existir, algo está errado e é
// melhor recusar do que adivinhar).
async function resolveActingMemberId(realUserId: string): Promise<string | null> {
  const member = await prisma.platformMember.findUnique({ where: { userId: realUserId }, select: { id: true } });
  return member?.id ?? null;
}

export async function solicitarAcessoRegistro(input: {
  scopeType: string;
  scopeId: string;
  reasonCode: AccessReasonCode;
  reasonNote?: string;
}): Promise<RequestAccessResult> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.supportMasked || !viewer.actingAsOffice) {
    return { error: "Isto só existe de dentro de uma sessão de suporte ativa." };
  }
  if (!input.scopeId) return { error: "Registro inválido." };
  if (!isRecordScopeType(input.scopeType)) return { error: "Tipo de registro inválido." };

  const memberId = await resolveActingMemberId(viewer.id);
  if (!memberId) return { error: "Não foi possível identificar o membro da Lúmen desta sessão." };

  return requestRecordAccess({
    officeId: viewer.actingAsOffice.id,
    memberId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
  });
}

export async function revelarRegistro(scopeType: string, scopeId: string): Promise<RevealResult> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.supportMasked || !viewer.actingAsOffice) {
    return { error: "Isto só existe de dentro de uma sessão de suporte ativa." };
  }
  if (!scopeId) return { error: "Registro inválido." };
  if (!isRecordScopeType(scopeType)) return { error: "Tipo de registro inválido." };

  const memberId = await resolveActingMemberId(viewer.id);
  if (!memberId) return { error: "Não foi possível identificar o membro da Lúmen desta sessão." };

  return revealRecord({ officeId: viewer.actingAsOffice.id, memberId, scopeType, scopeId });
}
