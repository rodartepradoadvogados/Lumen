import { prisma } from "@/lib/prisma";
import { normalizeProcessNumber } from "@/lib/processNumber";

// Bloqueio de processo (LinkPublicationMenu.tsx, botão "Bloquear") é por usuário — a Publication
// continua existindo normalmente pro escritório inteiro, só é escondida da listagem de quem
// bloqueou. Usado nas páginas de Publicações/Andamentos (desktop e mobile) e no badge de não
// lidas, pra filtrar depois da query do Prisma (o casamento é feito via normalizeProcessNumber,
// não dá pra fazer isso direto no where do banco).
export async function getBlockedProcessNumberSet(userId: string): Promise<Set<string>> {
  const rows = await prisma.blockedProcessNumber.findMany({ where: { userId }, select: { processNumber: true } });
  return new Set(rows.map((r) => r.processNumber));
}

export function isBlockedForViewer(processNumberRaw: string | null | undefined, blockedSet: Set<string>): boolean {
  if (!processNumberRaw || blockedSet.size === 0) return false;
  const normalized = normalizeProcessNumber(processNumberRaw);
  return normalized ? blockedSet.has(normalized) : false;
}
