"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

async function requireAdmin(): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem gerenciar workflows." };
  return {};
}

export async function createWorkflowTemplate(data: {
  name: string;
  area?: string;
  description?: string;
}): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if (auth.error) return auth;
  if (!data.name.trim()) return { error: "Informe um nome para o workflow." };
  await prisma.workflowTemplate.create({
    data: {
      name: data.name.trim(),
      area: data.area?.trim() || null,
      description: data.description?.trim() || null,
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
  if (auth.error) return auth;
  if (!data.name.trim()) return { error: "Informe um nome para o workflow." };
  await prisma.workflowTemplate.update({
    where: { id },
    data: {
      name: data.name.trim(),
      area: data.area?.trim() || null,
      description: data.description?.trim() || null,
      active: data.active,
    },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function toggleWorkflowActive(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if (auth.error) return auth;
  const template = await prisma.workflowTemplate.findUnique({ where: { id } });
  if (!template) return { error: "Workflow não encontrado." };
  await prisma.workflowTemplate.update({ where: { id }, data: { active: !template.active } });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWorkflowTemplate(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if (auth.error) return auth;
  await prisma.workflowTemplate.delete({ where: { id } });
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
  if (auth.error) return auth;
  if (!data.title.trim()) return { error: "Informe um título para o passo." };
  const template = await prisma.workflowTemplate.findUnique({ where: { id: data.templateId } });
  if (!template) return { error: "Workflow não encontrado." };
  const count = await prisma.workflowStep.count({ where: { templateId: data.templateId } });
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
    },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWorkflowStep(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if (auth.error) return auth;
  await prisma.workflowStep.delete({ where: { id } });
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
    prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }),
    prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!caseExists) return { error: "Processo não encontrado." };
  if (!template) return { error: "Workflow não encontrado." };
  if (!template.active) return { error: "Este workflow está inativo." };
  if (template.steps.length === 0) return { error: "Este workflow não tem passos cadastrados." };

  const [firstColumn, typePoints, activeUsers] = await Promise.all([
    prisma.kanbanColumn.findFirst({ orderBy: { order: "asc" } }),
    prisma.taskTypePoints.findMany(),
    prisma.user.findMany({ where: { active: true }, select: { id: true, role: true } }),
  ]);
  const pointsByType = new Map(typePoints.map((t) => [t.type, t.points]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.$transaction(
    template.steps.map((step) => {
      const due = new Date(today);
      due.setDate(due.getDate() + step.offsetDays);

      // Se o passo indica um cargo e existe exatamente um usuário ativo com ele, usa-o; senão, o responsável padrão.
      let stepResponsible = responsibleId || null;
      if (step.role) {
        const matches = activeUsers.filter((u) => u.role === step.role);
        if (matches.length === 1) stepResponsible = matches[0].id;
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
        },
      });
    })
  );

  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  return { count: template.steps.length };
}
