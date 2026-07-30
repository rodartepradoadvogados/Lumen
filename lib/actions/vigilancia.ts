"use server";

// Server actions do Radar de Publicações Administrativas — cadastro dos termos que o coletor
// (PNCP/DOU/Diários/tribunais de contas, ver tarefa futura "Coletor PNCP") vai procurar nas
// fontes públicas. Arquivo separado de lib/actions/cases.ts porque, embora TermoVigilancia possa
// nascer vinculado a um Case, ele também nasce solto (LIVRE) ou vinculado a um Client — não é uma
// operação do processo, é uma operação própria do setor administrativo.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice, isClientInOffice } from "@/lib/officeScope";

// Cadastra um termo vigiado. Dedup é silencioso: o @@unique([officeId, termo, caseId]) do
// schema garante que cadastrar o mesmo termo duas vezes para o mesmo processo (ou duas vezes
// solto, caseId null) não duplica — createMany + skipDuplicates absorve o conflito sem precisar
// de um try/catch em cima de erro de unique constraint (mesmo padrão já usado em
// lib/actions/publications.ts para PublicationRead).
export async function addTermoVigilancia(data: {
  termo: string;
  tipo?: string;
  caseId?: string;
  clientId?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const termo = data.termo.trim();
  if (!termo) return { error: "Informe o termo a vigiar." };

  if (data.caseId && !(await isCaseInOffice(data.caseId, viewer.officeId))) return { error: "Processo não encontrado." };
  if (data.clientId && !(await isClientInOffice(data.clientId, viewer.officeId))) return { error: "Cliente não encontrado." };

  await prisma.termoVigilancia.createMany({
    data: [
      {
        termo,
        tipo: data.tipo || "LIVRE",
        officeId: viewer.officeId,
        caseId: data.caseId || null,
        clientId: data.clientId || null,
        criadoPorId: viewer.id,
      },
    ],
    skipDuplicates: true,
  });

  if (data.caseId) revalidatePath(`/processos/${data.caseId}`);
  return {};
}

// Liga/desliga o termo — desligado, o coletor ignora na próxima varredura (mantém o histórico de
// ultimoHitAt em vez de apagar, caso reative depois).
export async function toggleTermoVigilancia(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const termo = await prisma.termoVigilancia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!termo) return { error: "Termo não encontrado." };

  await prisma.termoVigilancia.update({ where: { id }, data: { ativo: !termo.ativo } });
  if (termo.caseId) revalidatePath(`/processos/${termo.caseId}`);
  return {};
}

export async function removeTermoVigilancia(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const termo = await prisma.termoVigilancia.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!termo) return { error: "Termo não encontrado." };

  await prisma.termoVigilancia.delete({ where: { id } });
  if (termo.caseId) revalidatePath(`/processos/${termo.caseId}`);
  return {};
}
