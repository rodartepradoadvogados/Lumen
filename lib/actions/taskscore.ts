"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

const TASK_TYPES = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"] as const;

// Define a pontuação padrão (TaskScore) de um tipo de tarefa. Apenas administradores (sócios).
export async function setTaskTypePoints(type: string, points: number): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas Jairo ou Rodrigo podem alterar a pontuação padrão." };
  if (!(TASK_TYPES as readonly string[]).includes(type)) return { error: "Tipo de tarefa inválido." };
  const value = Number.isFinite(points) && points >= 0 ? Math.round(points) : 0;
  await prisma.taskTypePoints.upsert({
    where: { officeId_type: { officeId: viewer.officeId, type } },
    create: { type, points: value, officeId: viewer.officeId },
    update: { points: value },
  });
  revalidatePath("/configuracoes");
  return {};
}
