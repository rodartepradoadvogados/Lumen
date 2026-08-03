"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

type EntityType = "TASK" | "CASE" | "ATTENDANCE" | "PAYABLE" | "RECEIVABLE" | "HONORARIO_LANCAMENTO";

// ONLY = comportamento de sempre (exclui só o lançamento clicado, sem olhar agrupamento nenhum).
// FOLLOWING/ALL só fazem sentido para RECEIVABLE/PAYABLE que pertencem a um dos três agrupamentos
// existentes (ver performDeleteScoped abaixo) — usados fora disso, caem de volta em ONLY.
export type DeletionScope = "ONLY" | "FOLLOWING" | "ALL";

// warning: só preenchido quando alsoDeleteLinked pediu para apagar um registro vinculado
// (reembolso ↔ despesa, ver Payable.reimbursementReceivable/Receivable.reimbursesPayableId) mas
// o vinculado estava com status PAGO — nesse caso ele é PRESERVADO (mesma proteção usada em toda
// exclusão em lote deste arquivo: nunca apagar de fato um registro financeiro já quitado) e o
// aviso volta para quem chamou explicar por quê o vínculo não sumiu junto.
async function performDelete(entityType: string, entityId: string, officeId: string, alsoDeleteLinked?: boolean): Promise<{ warning?: string }> {
  let warning: string | undefined;
  if (entityType === "TASK") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { taskId: entityId } } }),
      prisma.comment.deleteMany({ where: { officeId, taskId: entityId } }),
      prisma.task.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/kanban");
    revalidatePath("/agenda");
    revalidatePath("/painel");
    revalidatePath("/alertas");
  } else if (entityType === "CASE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } } }),
      prisma.comment.deleteMany({ where: { officeId, OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } }),
      prisma.attachment.deleteMany({ where: { officeId, caseId: entityId } }),
      prisma.publication.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.payable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.receivable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.task.deleteMany({ where: { officeId, caseId: entityId } }),
      prisma.case.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/processos");
    revalidatePath("/kanban");
    revalidatePath("/agenda");
  } else if (entityType === "ATTENDANCE") {
    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { task: { attendanceId: entityId } } } }),
      prisma.comment.deleteMany({ where: { officeId, task: { attendanceId: entityId } } }),
      prisma.attachment.deleteMany({ where: { officeId, attendanceId: entityId } }),
      prisma.task.deleteMany({ where: { officeId, attendanceId: entityId } }),
      prisma.attendance.deleteMany({ where: { id: entityId, officeId } }),
    ]);
    revalidatePath("/atendimento");
  } else if (entityType === "PAYABLE") {
    const payable = await prisma.payable.findFirst({ where: { id: entityId, officeId }, include: { reimbursementReceivable: true } });
    if (!payable) return {};
    let deletedReimbursement = false;
    if (alsoDeleteLinked && payable.reimbursementReceivable) {
      if (payable.reimbursementReceivable.status === "PAGO") {
        warning = "O reembolso vinculado já estava pago e foi preservado (apenas desvinculado).";
      } else {
        await prisma.receivable.delete({ where: { id: payable.reimbursementReceivable.id } });
        deletedReimbursement = true;
      }
    }
    await prisma.payable.delete({ where: { id: entityId } });
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/despesas");
    revalidatePath("/financeiro/dre");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/alertas");
    revalidatePath("/painel");
    if (deletedReimbursement) revalidatePath("/financeiro/receitas");
    if (payable.caseId) revalidatePath(`/processos/${payable.caseId}`);
  } else if (entityType === "RECEIVABLE") {
    const receivable = await prisma.receivable.findFirst({ where: { id: entityId, officeId }, include: { reimbursesPayable: true } });
    if (!receivable) return {};
    let deletedReimbursedPayable = false;
    if (alsoDeleteLinked && receivable.reimbursesPayable) {
      if (receivable.reimbursesPayable.status === "PAGO") {
        warning = "A despesa vinculada já estava paga e foi preservada (apenas desvinculada).";
      } else {
        await prisma.payable.delete({ where: { id: receivable.reimbursesPayable.id } });
        deletedReimbursedPayable = true;
      }
    }
    // Receita gerada pelo cron mensal de honorários de Assessoria (lib/actions/assessoria.ts:
    // generateAllMonthlyHonorarios) tem um registro Honorario apontando pra cá sem onDelete
    // Cascade — apagar a receita direto batia em violação de chave estrangeira e derrubava a
    // página com erro genérico. Remove o vínculo primeiro (não é um registro financeiro em si,
    // só a marcação de qual receita é a mensalidade de qual competência).
    await prisma.honorario.deleteMany({ where: { receivableId: entityId } });
    await prisma.receivable.delete({ where: { id: entityId } });
    // Se esta era a última parcela de um lançamento de honorários parcelado, o cabeçalho fica
    // órfão (sem nenhuma parcela) — apaga junto para não sobrar um HonorarioLancamento vazio.
    if (receivable.honorarioLancamentoId) {
      const restantes = await prisma.receivable.count({ where: { honorarioLancamentoId: receivable.honorarioLancamentoId } });
      if (restantes === 0) await prisma.honorarioLancamento.deleteMany({ where: { id: receivable.honorarioLancamentoId } });
    }
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/receitas");
    revalidatePath("/financeiro/dre");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/alertas");
    revalidatePath("/painel");
    if (deletedReimbursedPayable) revalidatePath("/financeiro/despesas");
    if (receivable.caseId) revalidatePath(`/processos/${receivable.caseId}`);
    if (deletedReimbursedPayable && receivable.reimbursesPayable?.caseId && receivable.reimbursesPayable.caseId !== receivable.caseId) {
      revalidatePath(`/processos/${receivable.reimbursesPayable.caseId}`);
    }
  } else if (entityType === "HONORARIO_LANCAMENTO") {
    const lancamento = await prisma.honorarioLancamento.findFirst({ where: { id: entityId, officeId } });
    if (!lancamento) return {};
    // As parcelas já PAGAS são registro financeiro definitivo — excluir o lançamento inteiro só
    // desvincula essas parcelas (viram Receivable soltas, preservando o histórico de baixa) e
    // apaga as parcelas ainda pendentes junto com o cabeçalho.
    await prisma.receivable.updateMany({
      where: { honorarioLancamentoId: entityId, status: "PAGO" },
      data: { honorarioLancamentoId: null },
    });
    await prisma.receivable.deleteMany({ where: { honorarioLancamentoId: entityId, status: { not: "PAGO" } } });
    await prisma.honorarioLancamento.delete({ where: { id: entityId } });
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/receitas");
    revalidatePath("/financeiro/dre");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/alertas");
    revalidatePath("/painel");
    revalidatePath(`/processos/${lancamento.caseId}`);
  }
  return { warning };
}

// Revalidação comum das listas/relatórios de Financeiro afetados por qualquer exclusão em lote de
// RECEIVABLE/PAYABLE — mesmo conjunto de caminhos usado pelas ramificações RECEIVABLE/PAYABLE de
// performDelete acima, sem o revalidatePath específico de processo (cada chamador decide isso,
// já que o caseId pode variar dentro do próprio agrupamento — ver RecurringFee/HonorarioLancamento
// que sempre têm um único caseId, mas o groupId genérico pode, em teoria, não ter).
function revalidateFinanceScoped() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receitas");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

function revalidateCaseScoped(caseId: string | null | undefined) {
  if (!caseId) return;
  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
}

// Exclusão em lote de RECEIVABLE/PAYABLE por escopo ("este e os seguintes" / "todos") — só chamada
// para os três agrupamentos que existem hoje (ver comentário de cada ramo abaixo); fora deles cai
// de volta em performDelete (comportamento de sempre, sem lote nenhum). Regra que vale para TODO
// agrupamento aqui: uma parcela/linha já PAGA nunca é apagada de fato — ou é desvinculada do
// cabeçalho (honorário parcelado) ou simplesmente pulada (parcelamento genérico e recorrente), pra
// nunca sumir um registro financeiro definitivo de dentro de uma exclusão em lote.
// alsoDeleteLinked (ver performDelete acima) só tem efeito no ramo ONLY/avulso — quando o
// lançamento pertence de fato a um dos três agrupamentos abaixo, a exclusão em lote continua sem
// olhar para reembolso vinculado nenhum: na prática a UI (DeleteEntityButton) nunca mostra o
// checkbox de "excluir também o vinculado" junto com a escolha de escopo FOLLOWING/ALL, então este
// parâmetro chega como false/undefined nesses ramos.
async function performDeleteScoped(entityType: "PAYABLE" | "RECEIVABLE", entityId: string, officeId: string, scope: DeletionScope, alsoDeleteLinked?: boolean): Promise<{ warning?: string }> {
  if (scope === "ONLY") {
    return performDelete(entityType, entityId, officeId, alsoDeleteLinked);
  }

  if (entityType === "PAYABLE") {
    const anchor = await prisma.payable.findFirst({ where: { id: entityId, officeId } });
    if (!anchor) return {};
    if (!anchor.groupId) {
      // Avulso (sem parcelamento) — "seguintes"/"todos" não têm o que agrupar, comporta-se como ONLY.
      return performDelete(entityType, entityId, officeId, alsoDeleteLinked);
    }
    const siblingsWhere =
      scope === "FOLLOWING"
        ? { groupId: anchor.groupId, officeId, installmentNumber: { gte: anchor.installmentNumber ?? 0 } }
        : { groupId: anchor.groupId, officeId };
    await prisma.payable.deleteMany({ where: { ...siblingsWhere, status: { not: "PAGO" } } });
    revalidateFinanceScoped();
    revalidateCaseScoped(anchor.caseId);
    return {};
  }

  // RECEIVABLE
  const anchor = await prisma.receivable.findFirst({ where: { id: entityId, officeId } });
  if (!anchor) return {};

  if (anchor.honorarioLancamentoId) {
    // Honorário parcelado (Fase 2) — mesma proteção do entityType HONORARIO_LANCAMENTO em
    // performDelete: parcela PAGA nunca é apagada, só desvinculada (vira Receivable solta,
    // preservando a baixa). "Seguintes" só faz sentido quando a parcela tem installmentNumber
    // (nasceu de um parcelamento de verdade, ver createHonorarioLancamento); nos lançamentos
    // "dinheiro + percentual" sem parcelamento (installmentNumber nulo) não existe ordem nenhuma
    // entre as linhas, então "seguintes" cai no mesmo efeito de "todos" — a única leitura que faz
    // sentido ali.
    const honorarioLancamentoId = anchor.honorarioLancamentoId;
    const siblingsWhere =
      scope === "FOLLOWING" && anchor.installmentNumber != null
        ? { honorarioLancamentoId, officeId, installmentNumber: { gte: anchor.installmentNumber } }
        : { honorarioLancamentoId, officeId };
    await prisma.receivable.updateMany({ where: { ...siblingsWhere, status: "PAGO" }, data: { honorarioLancamentoId: null } });
    await prisma.receivable.deleteMany({ where: { ...siblingsWhere, status: { not: "PAGO" } } });
    // Cabeçalho órfão (nenhuma parcela mais vinculada, nem as pagas desvinculadas acima) some
    // junto — mesma limpeza de performDelete/HONORARIO_LANCAMENTO, olhando o lançamento inteiro
    // (não só o escopo desta exclusão), já que "seguintes" pode ter deixado o cabeçalho vazio.
    const restantes = await prisma.receivable.count({ where: { honorarioLancamentoId } });
    if (restantes === 0) {
      const lancamento = await prisma.honorarioLancamento.findFirst({ where: { id: honorarioLancamentoId } });
      await prisma.honorarioLancamento.deleteMany({ where: { id: honorarioLancamentoId } });
      revalidateCaseScoped(lancamento?.caseId);
    } else {
      revalidateCaseScoped(anchor.caseId);
    }
  } else if (anchor.recurringFeeId) {
    // Honorário recorrente até o arquivamento — não existem parcelas futuras já criadas no banco
    // (nascem mês a mês via ensureRecurringFeeReceivables), então "excluir os seguintes"/"todos"
    // não apaga nada que ainda vai nascer: o que garante que não volta é RecurringFee.active=false,
    // que o cron respeita (para de gerar competência nova para um fee inativo).
    const recurringFeeId = anchor.recurringFeeId;
    const siblings = await prisma.receivable.findMany({ where: { recurringFeeId, officeId } });
    const alvo =
      scope === "FOLLOWING" && anchor.competencia
        ? siblings.filter((s) => (s.competencia ?? "") >= (anchor.competencia as string))
        : siblings;
    const idsParaExcluir = alvo.filter((s) => s.status !== "PAGO").map((s) => s.id);
    if (idsParaExcluir.length > 0) {
      await prisma.receivable.deleteMany({ where: { id: { in: idsParaExcluir } } });
    }
    const fee = await prisma.recurringFee.update({ where: { id: recurringFeeId }, data: { active: false } });
    revalidateCaseScoped(fee.caseId);
  } else if (anchor.groupId) {
    // Parcelamento genérico (createReceivable com `parcelado`) — mesma lógica do PAYABLE acima.
    const siblingsWhere =
      scope === "FOLLOWING"
        ? { groupId: anchor.groupId, officeId, installmentNumber: { gte: anchor.installmentNumber ?? 0 } }
        : { groupId: anchor.groupId, officeId };
    await prisma.receivable.deleteMany({ where: { ...siblingsWhere, status: { not: "PAGO" } } });
    revalidateCaseScoped(anchor.caseId);
  } else {
    // Avulso — sem agrupamento nenhum, comporta-se como ONLY.
    return performDelete(entityType, entityId, officeId, alsoDeleteLinked);
  }

  revalidateFinanceScoped();
  return {};
}

export async function requestDeletion(
  entityType: EntityType,
  entityId: string,
  entityLabel: string,
  alsoDeleteLinked?: boolean
): Promise<{ error?: string; pending?: boolean; warning?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  if (user.isAdmin) {
    const result = await performDelete(entityType, entityId, user.officeId, alsoDeleteLinked);
    return { warning: result.warning };
  }

  const existing = await prisma.deletionRequest.findFirst({
    where: { entityType, entityId, status: "PENDENTE", officeId: user.officeId },
  });
  if (existing) return { pending: true };

  await prisma.deletionRequest.create({
    data: { entityType, entityId, entityLabel, status: "PENDENTE", requestedById: user.id, officeId: user.officeId, alsoDeleteLinked: Boolean(alsoDeleteLinked) },
  });
  revalidatePath("/alertas");
  return { pending: true };
}

// Igual a requestDeletion, mas para RECEIVABLE/PAYABLE com escolha de escopo ("só este" / "este e
// os seguintes" / "todos") — ver DeleteEntityButton.tsx (pop-up de confirmação com o texto exato
// pedido pelo dono do produto para cada opção) e performDeleteScoped acima para a lógica de cada
// um dos três agrupamentos.
export async function requestDeletionScoped(
  entityType: "PAYABLE" | "RECEIVABLE",
  entityId: string,
  entityLabel: string,
  scope: DeletionScope,
  alsoDeleteLinked?: boolean
): Promise<{ error?: string; pending?: boolean; warning?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  if (user.isAdmin) {
    const result = await performDeleteScoped(entityType, entityId, user.officeId, scope, alsoDeleteLinked);
    return { warning: result.warning };
  }

  const existing = await prisma.deletionRequest.findFirst({
    where: { entityType, entityId, status: "PENDENTE", officeId: user.officeId },
  });
  if (existing) return { pending: true };

  await prisma.deletionRequest.create({
    data: { entityType, entityId, entityLabel, scope, status: "PENDENTE", requestedById: user.id, officeId: user.officeId, alsoDeleteLinked: Boolean(alsoDeleteLinked) },
  });
  revalidatePath("/alertas");
  return { pending: true };
}

export async function approveDeletion(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas administradores podem aprovar exclusões." };

  const req = await prisma.deletionRequest.findFirst({ where: { id, officeId: user.officeId } });
  if (!req || req.status !== "PENDENTE") return { error: "Solicitação não encontrada ou já resolvida." };

  try {
    if (req.scope && (req.entityType === "RECEIVABLE" || req.entityType === "PAYABLE")) {
      await performDeleteScoped(req.entityType, req.entityId, user.officeId, req.scope as DeletionScope, req.alsoDeleteLinked);
    } else {
      await performDelete(req.entityType, req.entityId, user.officeId, req.alsoDeleteLinked);
    }
  } catch {
    // entidade pode já ter sido removida por outro caminho — segue para marcar a solicitação como resolvida
  }
  await prisma.deletionRequest.update({
    where: { id },
    data: { status: "APROVADA", resolvedById: user.id, resolvedAt: new Date() },
  });
  revalidatePath("/alertas");
  return {};
}

export async function rejectDeletion(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { error: "Apenas administradores podem recusar exclusões." };

  const result = await prisma.deletionRequest.updateMany({
    where: { id, officeId: user.officeId },
    data: { status: "REJEITADA", resolvedById: user.id, resolvedAt: new Date() },
  });
  if (result.count === 0) return { error: "Solicitação não encontrada." };
  revalidatePath("/alertas");
  return {};
}
