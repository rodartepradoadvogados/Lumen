"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import type { OfficeModules } from "@/lib/officeModules";

// Liga/desliga os módulos do plano contratado (Financeiro, WhatsApp, Atendimento, Assessoria).
// Desligar um módulo NUNCA apaga dados — só esconde a navegação e passa a recusar a criação de
// dados novos daquele módulo (ver checagens em lib/permissions.ts, lib/actions/{attendance,
// assessoria,whatsappConfig}.ts). Religar devolve o acesso aos dados já existentes.
export async function updateOfficeModules(modules: OfficeModules): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem alterar os módulos contratados." };

  await prisma.office.update({
    where: { id: viewer.officeId },
    data: {
      moduloFinanceiro: modules.financeiro,
      moduloWhatsapp: modules.whatsapp,
      moduloAtendimento: modules.atendimento,
      moduloAssessoria: modules.assessoria,
    },
  });
  revalidatePath("/configuracoes");
  return {};
}
