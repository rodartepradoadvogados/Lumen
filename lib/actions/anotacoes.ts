"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice, isAttendanceInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { naturezaOf } from "@/lib/caseNatureza";
import {
  type AnotacaoLinkType,
  anotacaoLinkNeedsEntity,
  isAnotacaoLinkType,
  isAnotacaoContentEmpty,
  sanitizeAnotacaoHtml,
} from "@/lib/anotacoes";

export type CreateAnotacaoInput = {
  linkType: AnotacaoLinkType;
  // caseId (Processo Judicial/Administrativo/Caso), attendanceId (Atendimento) ou assessoriaId
  // (Assessoria) — sempre a mesma chave `entityId` do lado do chamador, resolvida aqui para a FK
  // certa conforme linkType. Ausente/ignorado para Financeiro e Outros.
  entityId?: string;
  content: string; // HTML do editor (ou já convertido de texto simples, ver plainTextToHtml)
  referenceDate: string; // yyyy-mm-dd
};

export type CreateAnotacaoResult = { id: string } | { error: string };

export async function createAnotacao(data: CreateAnotacaoInput): Promise<CreateAnotacaoResult> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  if (!isAnotacaoLinkType(data.linkType)) return { error: "Tipo de vínculo inválido." };

  const content = sanitizeAnotacaoHtml(data.content ?? "");
  if (isAnotacaoContentEmpty(content)) return { error: "Escreva algo na anotação." };

  // Mesma convenção de toda data-calendário do produto (Task.dueDate, vencimento de conta...):
  // string "yyyy-mm-dd" pura de um <input type="date"> passada direto para `new Date()`, que o
  // JS interpreta como meia-noite UTC — NUNCA "T00:00:00" (isso seria meia-noite no fuso do
  // servidor, um dia errado quando lido de volta em UTC — ver comentário de
  // formatCalendarDate em components/ui.tsx).
  const referenceDate = new Date(data.referenceDate);
  if (!data.referenceDate || Number.isNaN(referenceDate.getTime())) {
    return { error: "Informe uma data válida para consignar a anotação." };
  }

  let caseId: string | undefined;
  let attendanceId: string | undefined;
  let assessoriaId: string | undefined;

  if (anotacaoLinkNeedsEntity(data.linkType)) {
    if (!data.entityId) return { error: "Selecione a qual item esta anotação se vincula." };

    if (data.linkType === "ASSESSORIA") {
      if (!(await isAssessoriaInOffice(data.entityId, viewer.officeId))) return { error: "Assessoria não encontrada." };
      assessoriaId = data.entityId;
    } else if (data.linkType === "ATENDIMENTO") {
      if (!(await isAttendanceInOffice(data.entityId, viewer.officeId))) return { error: "Atendimento não encontrado." };
      attendanceId = data.entityId;
    } else {
      // PROCESSO_JUDICIAL | PROCESSO_ADMINISTRATIVO | CASO — todos apontam para o mesmo model
      // Case, diferenciados pela natureza derivada de Case.type (ver lib/caseNatureza.ts).
      if (!(await isCaseInOffice(data.entityId, viewer.officeId))) return { error: "Processo/Caso não encontrado." };
      const found = await prisma.case.findUnique({ where: { id: data.entityId }, select: { type: true } });
      const nat = naturezaOf(found?.type);
      const expected = data.linkType === "PROCESSO_JUDICIAL" ? "JUDICIAL" : data.linkType === "PROCESSO_ADMINISTRATIVO" ? "ADMINISTRATIVO" : "CASO";
      if (nat !== expected) return { error: "O item selecionado não corresponde ao vínculo escolhido." };
      caseId = data.entityId;
    }
  }

  const anotacao = await prisma.anotacao.create({
    data: {
      content,
      referenceDate,
      linkType: data.linkType,
      officeId: viewer.officeId,
      authorId: viewer.id,
      caseId,
      attendanceId,
      assessoriaId,
    },
  });

  if (caseId) revalidatePath(`/processos/${caseId}`);
  if (attendanceId) revalidatePath(`/atendimento/${attendanceId}`);
  if (assessoriaId) revalidatePath(`/assessoria/${assessoriaId}`);

  return { id: anotacao.id };
}

// Exclusão simples e direta (sem fila de aprovação, diferente de lib/actions/deletion.ts): a
// anotação é sempre pessoal, então só o próprio autor pode apagar a que ele mesmo criou — nunca
// passa pelo fluxo de "solicitar exclusão" pensado para registros compartilhados pelo escritório.
export async function deleteAnotacao(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const anotacao = await prisma.anotacao.findFirst({ where: { id, officeId: viewer.officeId, authorId: viewer.id } });
  if (!anotacao) return { error: "Anotação não encontrada." };

  await prisma.anotacao.delete({ where: { id } });

  if (anotacao.caseId) revalidatePath(`/processos/${anotacao.caseId}`);
  if (anotacao.attendanceId) revalidatePath(`/atendimento/${anotacao.attendanceId}`);
  if (anotacao.assessoriaId) revalidatePath(`/assessoria/${anotacao.assessoriaId}`);

  return {};
}
