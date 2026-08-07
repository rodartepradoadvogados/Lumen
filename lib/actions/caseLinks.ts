"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

// Vínculo entre dois processos, por qualquer motivo (não perguntado nem guardado, ver proposta
// aprovada em 2026-08-07) — model CaseLink em prisma/schema.prisma. Bidirecional: caseAId/caseBId
// não têm um lado "certo", então toda leitura busca pelos dois.

// Devolve os vínculos de um processo já resolvidos do ponto de vista DELE — outro.id/title/
// processNumber é sempre o OUTRO lado do vínculo, e role diz o papel do processo passado
// (`caseId`) neste vínculo específico: "PRINCIPAL" | "VINCULADO" | "NENHUM_PRINCIPAL".
export async function getCaseLinks(caseId: string): Promise<
  { linkId: string; other: { id: string; title: string; processNumber: string | null }; role: "PRINCIPAL" | "VINCULADO" | "NENHUM_PRINCIPAL" }[]
> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const links = await prisma.caseLink.findMany({
    where: { officeId: viewer.officeId, OR: [{ caseAId: caseId }, { caseBId: caseId }] },
    include: {
      caseA: { select: { id: true, title: true, processNumber: true } },
      caseB: { select: { id: true, title: true, processNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return links.map((l) => {
    const other = l.caseAId === caseId ? l.caseB : l.caseA;
    const role: "PRINCIPAL" | "VINCULADO" | "NENHUM_PRINCIPAL" =
      !l.principalCaseId ? "NENHUM_PRINCIPAL" : l.principalCaseId === caseId ? "PRINCIPAL" : "VINCULADO";
    return { linkId: l.id, other: { id: other.id, title: other.title, processNumber: other.processNumber }, role };
  });
}

// "SELF" = o processo que abriu o formulário é o principal; "OTHER" = o processo escolhido na
// busca é o principal; "NONE" = nenhum dos dois.
export async function addCaseLink(caseId: string, targetCaseId: string, principal: "SELF" | "OTHER" | "NONE"): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (caseId === targetCaseId) return { error: "Um processo não pode ser vinculado a si mesmo." };

  const [caseOk, targetOk] = await Promise.all([
    prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, select: { id: true } }),
    prisma.case.findFirst({ where: { id: targetCaseId, officeId: viewer.officeId }, select: { id: true } }),
  ]);
  if (!caseOk || !targetOk) return { error: "Processo não encontrado." };

  // Bidirecional — verifica os dois sentidos antes de criar, pra não duplicar o mesmo par
  // vinculado de dois jeitos diferentes (a unique constraint só cobre um sentido).
  const already = await prisma.caseLink.findFirst({
    where: {
      officeId: viewer.officeId,
      OR: [
        { caseAId: caseId, caseBId: targetCaseId },
        { caseAId: targetCaseId, caseBId: caseId },
      ],
    },
    select: { id: true },
  });
  if (already) return { error: "Esses dois processos já estão vinculados." };

  const principalCaseId = principal === "SELF" ? caseId : principal === "OTHER" ? targetCaseId : null;

  await prisma.caseLink.create({
    data: { caseAId: caseId, caseBId: targetCaseId, principalCaseId, officeId: viewer.officeId },
  });

  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/processos/${targetCaseId}`);
  return {};
}

export async function removeCaseLink(linkId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const link = await prisma.caseLink.findFirst({ where: { id: linkId, officeId: viewer.officeId }, select: { caseAId: true, caseBId: true } });
  if (!link) return { error: "Vínculo não encontrado." };

  await prisma.caseLink.delete({ where: { id: linkId } });

  revalidatePath(`/processos/${link.caseAId}`);
  revalidatePath(`/processos/${link.caseBId}`);
  return {};
}
