"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import type { MaskKind } from "@/lib/mask";

// Break-glass INTERNO — a própria equipe do escritório revelando um campo mascarado (documento
// 07, Fase 4). Não confundir com lib/actions/breakGlass.ts (quebra-vidro do SUPORTE DA
// PLATAFORMA durante "atuar como", grava em AccessAuditLog, ator é PlatformMember) — este arquivo
// grava em AuditEvent (ver prisma/schema.prisma), ator é sempre um User do próprio escritório.

const REVEAL_MINUTES = 15;
const REASON_MIN_LENGTH = 20;

// Grava a revelação (AuditEvent, append-only — ver comentário no model) e recusa motivo curto
// demais. De propósito, esta action NÃO lê nem devolve o valor cru do campo: quem chama já é um
// Server Component de tela que carregou o próprio registro do banco (com officeId conferido pela
// query de sempre) — não existe aqui um acesso genérico "leia qualquer campo de qualquer tabela
// pelo nome", que seria uma superfície de risco à toa. Esta action só AUTORIZA e REGISTRA; a
// decisão de qual valor mostrar depois do sucesso é de quem chamou.
export async function registrarRevelacao({
  entityType,
  entityId,
  field,
  reason,
}: {
  entityType: string;
  entityId: string;
  field: MaskKind;
  reason: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const motivo = reason.trim();
  if (motivo.length < REASON_MIN_LENGTH) {
    return { error: `Motivo precisa ter pelo menos ${REASON_MIN_LENGTH} caracteres.` };
  }
  await prisma.auditEvent.create({
    data: { officeId: user.officeId, actorId: user.id, kind: "REVELACAO", entityType, entityId, field, reason: motivo },
  });
  return {};
}

// Há uma revelação ativa (últimos 15 minutos, deste usuário, para este registro+campo)? Não
// existe uma tabela própria de "sessão de revelação" com update/expiração — o AuditEvent
// append-only já basta: expira sozinho por construção, é só uma janela de tempo sobre
// `createdAt`, nunca uma linha que precisa ser apagada ou marcada como encerrada.
export async function revelacaoAtiva({
  entityType,
  entityId,
  field,
}: {
  entityType: string;
  entityId: string;
  field: MaskKind;
}): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const desde = new Date(Date.now() - REVEAL_MINUTES * 60 * 1000);
  const evento = await prisma.auditEvent.findFirst({
    where: { officeId: user.officeId, actorId: user.id, kind: "REVELACAO", entityType, entityId, field, createdAt: { gte: desde } },
    select: { id: true },
  });
  return Boolean(evento);
}
