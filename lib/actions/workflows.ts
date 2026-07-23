"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

async function requireAdmin() {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem gerenciar workflows." } as const;
  return { viewer };
}

export async function createWorkflowTemplate(data: {
  name: string;
  area?: string;
  description?: string;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  if (!data.name.trim()) return { error: "Informe um nome para o workflow." };
  await prisma.workflowTemplate.create({
    data: {
      name: data.name.trim(),
      area: data.area?.trim() || null,
      description: data.description?.trim() || null,
      officeId: auth.viewer.officeId,
    },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function updateWorkflowTemplate(
  id: string,
  data: { name: string; area?: string; description?: string; active: boolean }
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  if (!data.name.trim()) return { error: "Informe um nome para o workflow." };
  const result = await prisma.workflowTemplate.updateMany({
    where: { id, officeId: auth.viewer.officeId },
    data: {
      name: data.name.trim(),
      area: data.area?.trim() || null,
      description: data.description?.trim() || null,
      active: data.active,
    },
  });
  if (result.count === 0) return { error: "Workflow não encontrado." };
  revalidatePath("/configuracoes");
  return {};
}

export async function toggleWorkflowActive(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  const template = await prisma.workflowTemplate.findFirst({ where: { id, officeId: auth.viewer.officeId } });
  if (!template) return { error: "Workflow não encontrado." };
  await prisma.workflowTemplate.update({ where: { id }, data: { active: !template.active } });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWorkflowTemplate(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  await prisma.workflowTemplate.deleteMany({ where: { id, officeId: auth.viewer.officeId } });
  revalidatePath("/configuracoes");
  return {};
}

export async function addWorkflowStep(data: {
  templateId: string;
  title: string;
  taskType: string;
  offsetDays: number;
  priority: string;
  role?: string;
  points?: number;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  if (!data.title.trim()) return { error: "Informe um título para o passo." };
  const template = await prisma.workflowTemplate.findFirst({ where: { id: data.templateId, officeId: auth.viewer.officeId } });
  if (!template) return { error: "Workflow não encontrado." };
  const count = await prisma.workflowStep.count({ where: { templateId: data.templateId, officeId: auth.viewer.officeId } });
  await prisma.workflowStep.create({
    data: {
      templateId: data.templateId,
      order: count,
      title: data.title.trim(),
      taskType: data.taskType || "TAREFA",
      offsetDays: Number.isFinite(data.offsetDays) ? Math.max(0, Math.round(data.offsetDays)) : 0,
      priority: data.priority || "MEDIA",
      role: data.role?.trim() || null,
      points: data.points != null && Number.isFinite(data.points) ? Math.max(0, Math.round(data.points)) : null,
      officeId: auth.viewer.officeId,
    },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWorkflowStep(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  await prisma.workflowStep.deleteMany({ where: { id, officeId: auth.viewer.officeId } });
  revalidatePath("/configuracoes");
  return {};
}

// Aplica um workflow a um processo, criando as tarefas correspondentes.
// Disparo sempre manual (botão na página do processo).
export async function applyWorkflowToCase(
  caseId: string,
  templateId: string,
  responsibleId: string
): Promise<{ error?: string; count?: number }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const [caseExists, template] = await Promise.all([
    prisma.case.findFirst({ where: { id: caseId, officeId: viewer.officeId }, select: { id: true } }),
    prisma.workflowTemplate.findFirst({
      where: { id: templateId, officeId: viewer.officeId },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!caseExists) return { error: "Processo não encontrado." };
  if (!template) return { error: "Workflow não encontrado." };
  if (!template.active) return { error: "Este workflow está inativo." };
  if (template.steps.length === 0) return { error: "Este workflow não tem passos cadastrados." };

  const [firstColumn, typePoints, activeUsers, openTaskCounts] = await Promise.all([
    prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } }),
    prisma.taskTypePoints.findMany({ where: { officeId: viewer.officeId } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true, role: true } }),
    prisma.task.groupBy({
      by: ["responsibleId"],
      where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, responsibleId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const pointsByType = new Map(typePoints.map((t) => [t.type, t.points]));

  // Contagem de tarefas abertas (PENDENTE/EM_ANDAMENTO) por usuário, incrementada em memória
  // a cada passo atribuído para distribuir de forma balanceada dentro da mesma aplicação.
  const openCountByUser = new Map<string, number>();
  for (const u of activeUsers) openCountByUser.set(u.id, 0);
  for (const c of openTaskCounts) {
    if (c.responsibleId) openCountByUser.set(c.responsibleId, c._count._all);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.$transaction(
    template.steps.map((step) => {
      const due = new Date(today);
      due.setDate(due.getDate() + step.offsetDays);

      // Resolve o responsável do passo:
      // - 0 usuários ativos com o cargo → responsável padrão;
      // - exatamente 1 → ele;
      // - mais de 1 → o com menos tarefas abertas (empate: ordem alfabética de nome).
      let stepResponsible = responsibleId || null;
      if (step.role) {
        const matches = activeUsers.filter((u) => u.role === step.role);
        if (matches.length === 1) {
          stepResponsible = matches[0].id;
        } else if (matches.length > 1) {
          const chosen = matches
            .slice()
            .sort((a, b) => {
              const ca = openCountByUser.get(a.id) ?? 0;
              const cb = openCountByUser.get(b.id) ?? 0;
              if (ca !== cb) return ca - cb;
              return a.name.localeCompare(b.name, "pt-BR");
            })[0];
          stepResponsible = chosen.id;
          openCountByUser.set(chosen.id, (openCountByUser.get(chosen.id) ?? 0) + 1);
        }
      }

      const points = step.points ?? pointsByType.get(step.taskType) ?? 10;

      return prisma.task.create({
        data: {
          title: step.title,
          type: step.taskType,
          dueDate: due,
          priority: step.priority,
          status: "PENDENTE",
          caseId,
          responsibleId: stepResponsible,
          columnId: firstColumn?.id ?? null,
          points,
          officeId: viewer.officeId,
        },
      });
    })
  );

  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  return { count: template.steps.length };
}
