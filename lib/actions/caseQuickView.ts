"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";
import { effectiveCaseClients, effectiveCaseParties, joinCaseNames } from "@/lib/caseParties";
import { classificarPrazo, type PrazoUrgencia } from "@/lib/dueStatus";

export type CaseQuickView =
  | {
      id: string;
      title: string;
      naturezaLabel: string;
      status: string;
      materias: string[];
      processNumber: string | null;
      tribunalSigla: string | null;
      clientsLabel: string | null;
      partiesLabel: string | null;
      responsibleName: string | null;
      caseValue: number | null;
      taskCount: number;
      nextTask: { title: string; dueDate: string; urgencia: PrazoUrgencia } | null;
    }
  | { error: string };

// Dado da gaveta "Ficha rápida" (Movimento 1 · deslizar, proposta "Slide & Sumir") — busca sob
// demanda, só quando a gaveta abre, em vez de embutir no SELECT de app/(app)/processos/page.tsx
// (que já lista dezenas/centenas de processos de uma vez; "próximo prazo" exigiria uma consulta
// de Task por processo, o que vira N+1 se feito para a lista inteira).
export async function getCaseQuickView(caseId: string): Promise<CaseQuickView> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada — atualize a página." };

  const c = await prisma.case.findFirst({
    where: { id: caseId, officeId: viewer.officeId },
    include: {
      client: true,
      clients: { include: { client: true } },
      parties: true,
      responsible: true,
      _count: { select: { tasks: true } },
    },
  });
  if (!c) return { error: "Processo não encontrado." };

  const nextTask = await prisma.task.findFirst({
    where: { caseId: c.id, officeId: viewer.officeId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    orderBy: { dueDate: "asc" },
    select: { title: true, dueDate: true },
  });

  const nat = naturezaOf(c.type);
  const clients = effectiveCaseClients(c);
  const parties = effectiveCaseParties(c);

  return {
    id: c.id,
    title: c.title,
    naturezaLabel: NATUREZA_LABELS[nat],
    status: c.status,
    materias: c.materias,
    processNumber: c.processNumber,
    tribunalSigla: c.tribunalSigla,
    clientsLabel: clients.length ? joinCaseNames(clients.map((x) => x.name)) : null,
    partiesLabel: parties.length ? joinCaseNames(parties.map((x) => x.name)) : null,
    responsibleName: c.responsible?.name ?? null,
    caseValue: c.caseValue,
    taskCount: c._count.tasks,
    nextTask: nextTask
      ? { title: nextTask.title, dueDate: nextTask.dueDate.toISOString(), urgencia: classificarPrazo(nextTask.dueDate) }
      : null,
  };
}
