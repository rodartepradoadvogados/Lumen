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
    // Prisma aplica onDelete: Restrict por padrão em toda relação OBRIGATÓRIA sem `onDelete`
    // explícito. HonorarioLancamento/ProtocoloLote/RecurringFee são registro de negócio (não
    // derivado do processo) — apagar em cascata perderia lançamento financeiro/protocolo sem o
    // usuário saber. Em vez de deixar a transação estourar violação de FK com um erro genérico
    // (e, no fluxo de aprovação não-admin, ser engolida silenciosamente — ver approveDeletion),
    // barra ANTES com uma mensagem explicando o que precisa ser resolvido primeiro.
    const [honorarios, protocolos, recorrentes] = await Promise.all([
      prisma.honorarioLancamento.count({ where: { caseId: entityId, officeId } }),
      prisma.protocoloLote.count({ where: { caseId: entityId, officeId } }),
      prisma.recurringFee.count({ where: { caseId: entityId, officeId } }),
    ]);
    const bloqueios: string[] = [];
    if (honorarios > 0) bloqueios.push(`${honorarios} lançamento(s) de honorário`);
    if (protocolos > 0) bloqueios.push(`${protocolos} protocolo(s)`);
    if (recorrentes > 0) bloqueios.push(`${recorrentes} honorário(s) recorrente(s) até o arquivamento`);
    if (bloqueios.length > 0) {
      throw new Error(`Não é possível excluir: este processo tem ${bloqueios.join(", ")} vinculado(s). Exclua-os primeiro.`);
    }

    await prisma.$transaction([
      prisma.mention.deleteMany({ where: { officeId, comment: { OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } } }),
      prisma.comment.deleteMany({ where: { officeId, OR: [{ caseId: entityId }, { task: { caseId: entityId } }] } }),
      prisma.attachment.deleteMany({ where: { officeId, caseId: entityId } }),
      prisma.publication.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.payable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.receivable.updateMany({ where: { officeId, caseId: entityId }, data: { caseId: null } }),
      prisma.task.deleteMany({ where: { officeId, caseId: entityId } }),
      // Derivados do processo (nada de negócio próprio) — seguros para apagar junto.
      prisma.caseLink.deleteMany({ where: { officeId, OR: [{ caseAId: entityId }, { caseBId: entityId }] } }),
      prisma.caseInstanceEscalation.deleteMany({ where: { caseId: entityId, case: { officeId } } }),
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
    // página com erro genérico. NÃO apaga o Honorario junto (isso era o achado A27 da revisão
    // gauntlet): ele é a própria trava de idempotência que o cron consulta por (assessoriaId,
    // competencia) antes de gerar — apagando os dois, o cron não via mais nada e recriava a
    // mesma competência na manhã seguinte. Em vez disso vira um tombstone (receivableId null +
    // canceladoEm), que continua bloqueando o cron mas some das telas de Honorários (ver
    // getAssessoriaDetail, que filtra por receivableId não-nulo).
    await prisma.honorario.updateMany({ where: { receivableId: entityId }, data: { receivableId: null, canceladoEm: new Date() } });
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
    // As parcelas que JÁ RECEBERAM ALGO são registro financeiro definitivo — excluir o lançamento
    // inteiro só desvincula essas parcelas (viram Receivable soltas, preservando o histórico de
    // baixa) e apaga as que nunca receberam nada, junto com o cabeçalho.
    // O critério é "tem FinancePayment", não `status === "PAGO"`: uma parcela PARCIAL (baixa
    // parcial, ver statusPorPagamentos em lib/financeCalc.ts) também é dinheiro que entrou, e
    // apagá-la levava junto os pagamentos por onDelete: Cascade (prisma/schema.prisma).
    await prisma.receivable.updateMany({
      where: { honorarioLancamentoId: entityId, payments: { some: {} } },
      data: { honorarioLancamentoId: null },
    });
    await prisma.receivable.deleteMany({ where: { honorarioLancamentoId: entityId, payments: { none: {} } } });
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
// para os agrupamentos que existem hoje (ver comentário de cada ramo abaixo); fora deles cai de
// volta em performDelete (comportamento de sempre, sem lote nenhum).
//
// Regra de escopo (pedido explícito do dono do produto): FOLLOWING ("este e os seguintes") nunca
// apaga uma parcela/linha já PAGA de fato — ou desvincula do cabeçalho (honorário parcelado) ou
// simplesmente pula (parcelamento genérico e recorrente), preservando o histórico. ALL ("todos os
// lançamentos") é a exceção: apaga a série INTEIRA, PAGAS incluídas — o usuário está lixando o
// agrupamento inteiro de propósito, e como FinancePayment tem onDelete Cascade a partir de
// Payable/Receivable (ver schema), o histórico de baixa some junto automaticamente, então Livro
// Caixa/DRE (que leem Payable/Receivable.status="PAGO" direto, não via FinancePayment solto)
// refletem a exclusão sem sobrar nada órfão.
//
// alsoDeleteLinked (ver performDelete acima) só tem efeito no ramo ONLY/avulso — quando o
// lançamento pertence de fato a um dos agrupamentos abaixo, a exclusão em lote continua sem
// olhar para reembolso vinculado nenhum: na prática a UI (DeleteEntityButton) nunca mostra o
// checkbox de "excluir também o vinculado" junto com a escolha de escopo FOLLOWING/ALL, então este
// parâmetro chega como false/undefined nesses ramos.
async function performDeleteScoped(entityType: "PAYABLE" | "RECEIVABLE", entityId: string, officeId: string, scope: DeletionScope, alsoDeleteLinked?: boolean): Promise<{ warning?: string }> {
  if (scope === "ONLY") {
    // Mesma proteção que DeleteEntityButton.tsx já aplica na UI (não oferece "só este" para
    // groupKind RECORRENTE) — coberta aqui também, caso esta função seja alcançada sem passar
    // pela UI. Para uma série gerada por cron, a própria linha é a trava de idempotência
    // (ensureRecurringFeeReceivables/ensureRecurringExpensePayables); sem desligar a recorrência
    // junto, o cron recria a mesma competência no dia seguinte (achado A28 da revisão gauntlet).
    if (entityType === "PAYABLE") {
      const anchor = await prisma.payable.findFirst({ where: { id: entityId, officeId }, select: { recurringExpenseId: true } });
      if (anchor?.recurringExpenseId) {
        await prisma.recurringExpense.update({ where: { id: anchor.recurringExpenseId }, data: { active: false } });
      }
    } else {
      const anchor = await prisma.receivable.findFirst({ where: { id: entityId, officeId }, select: { recurringFeeId: true } });
      if (anchor?.recurringFeeId) {
        await prisma.recurringFee.update({ where: { id: anchor.recurringFeeId }, data: { active: false } });
      }
    }
    return performDelete(entityType, entityId, officeId, alsoDeleteLinked);
  }
  const includePago = scope === "ALL";

  if (entityType === "PAYABLE") {
    const anchor = await prisma.payable.findFirst({ where: { id: entityId, officeId } });
    if (!anchor) return {};

    if (anchor.recurringExpenseId) {
      // Despesa recorrente sem data de fim (ver RecurringExpense, lib/actions/financeiro.ts) —
      // não existem parcelas futuras já criadas no banco (nascem mês a mês via
      // ensureRecurringExpensePayables), então FOLLOWING/ALL não apagam nada que ainda vai
      // nascer: o que garante que não volta é RecurringExpense.active=false, desligado aqui
      // independente do escopo — excluir "este e os seguintes" (ou "todos") da série implica
      // parar de gerar as próximas competências também, não só apagar o que já existe.
      const recurringExpenseId = anchor.recurringExpenseId;
      const siblings = await prisma.payable.findMany({ where: { recurringExpenseId, officeId } });
      const alvo =
        scope === "FOLLOWING" && anchor.competencia
          ? siblings.filter((s) => (s.competencia ?? "") >= (anchor.competencia as string))
          : siblings;
      const idsParaExcluir = (includePago ? alvo : alvo.filter((s) => s.status !== "PAGO")).map((s) => s.id);
      if (idsParaExcluir.length > 0) {
        await prisma.payable.deleteMany({ where: { id: { in: idsParaExcluir } } });
      }
      await prisma.recurringExpense.update({ where: { id: recurringExpenseId }, data: { active: false } });
    } else if (anchor.groupId) {
      const siblingsWhere =
        scope === "FOLLOWING"
          ? { groupId: anchor.groupId, officeId, installmentNumber: { gte: anchor.installmentNumber ?? 0 } }
          : { groupId: anchor.groupId, officeId };
      // Mesmo critério do lado de Receivable: fora do includePago (exclusão deliberada de tudo),
      // preserva a conta que já teve pagamento — inclusive PARCIAL. FinancePayment.payable também
      // é onDelete: Cascade (prisma/schema.prisma), então apagar levaria o histórico junto.
      await prisma.payable.deleteMany({ where: includePago ? siblingsWhere : { ...siblingsWhere, payments: { none: {} } } });
    } else {
      // Avulso (sem parcelamento nem recorrência) — "seguintes"/"todos" não têm o que agrupar,
      // comporta-se como ONLY.
      return performDelete(entityType, entityId, officeId, alsoDeleteLinked);
    }
    revalidateFinanceScoped();
    revalidateCaseScoped(anchor.caseId);
    return {};
  }

  // RECEIVABLE
  const anchor = await prisma.receivable.findFirst({ where: { id: entityId, officeId } });
  if (!anchor) return {};

  if (anchor.honorarioLancamentoId) {
    // Honorário parcelado (Fase 2). "Seguintes" só faz sentido quando a parcela tem
    // installmentNumber (nasceu de um parcelamento de verdade, ver createHonorarioLancamento);
    // nos lançamentos "dinheiro + percentual" sem parcelamento (installmentNumber nulo) não
    // existe ordem nenhuma entre as linhas, então "seguintes" cai no mesmo efeito de "todos" — a
    // única leitura que faz sentido ali.
    const honorarioLancamentoId = anchor.honorarioLancamentoId;
    const siblingsWhere =
      scope === "FOLLOWING" && anchor.installmentNumber != null
        ? { honorarioLancamentoId, officeId, installmentNumber: { gte: anchor.installmentNumber } }
        : { honorarioLancamentoId, officeId };
    if (includePago) {
      // "Excluir todos" apaga a série inteira, pagas incluídas — diferente do "excluir
      // lançamento inteiro" pelo próprio HonorarioLancamento (entityType HONORARIO_LANCAMENTO em
      // performDelete, acima), que continua preservando parcelas pagas (motivo de produto
      // diferente: lá é "apaguei sem querer o cabeçalho", aqui é "quero mesmo excluir tudo").
      await prisma.receivable.deleteMany({ where: siblingsWhere });
    } else {
      // Mesmo critério de performDelete/HONORARIO_LANCAMENTO: preserva o que já recebeu algo
      // (inclusive PARCIAL), não só o que está PAGO — senão o FinancePayment ia junto em cascata.
      await prisma.receivable.updateMany({ where: { ...siblingsWhere, payments: { some: {} } }, data: { honorarioLancamentoId: null } });
      await prisma.receivable.deleteMany({ where: { ...siblingsWhere, payments: { none: {} } } });
    }
    // Cabeçalho órfão (nenhuma parcela mais vinculada) some junto — mesma limpeza de
    // performDelete/HONORARIO_LANCAMENTO, olhando o lançamento inteiro (não só o escopo desta
    // exclusão), já que "seguintes" pode ter deixado o cabeçalho vazio.
    const restantes = await prisma.receivable.count({ where: { honorarioLancamentoId } });
    if (restantes === 0) {
      const lancamento = await prisma.honorarioLancamento.findFirst({ where: { id: honorarioLancamentoId } });
      await prisma.honorarioLancamento.deleteMany({ where: { id: honorarioLancamentoId } });
      revalidateCaseScoped(lancamento?.caseId);
    } else {
      revalidateCaseScoped(anchor.caseId);
    }
  } else if (anchor.recurringFeeId) {
    // Honorário recorrente até o arquivamento — mesmo raciocínio do PAYABLE.recurringExpenseId
    // acima: RecurringFee.active=false sempre, independente do escopo.
    const recurringFeeId = anchor.recurringFeeId;
    const siblings = await prisma.receivable.findMany({ where: { recurringFeeId, officeId } });
    const alvo =
      scope === "FOLLOWING" && anchor.competencia
        ? siblings.filter((s) => (s.competencia ?? "") >= (anchor.competencia as string))
        : siblings;
    const idsParaExcluir = (includePago ? alvo : alvo.filter((s) => s.status !== "PAGO")).map((s) => s.id);
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
    // includePago = a pessoa pediu explicitamente para apagar tudo, pagas incluídas. Fora disso,
    // preserva o que já recebeu algo (inclusive PARCIAL) — não só o que está PAGO.
    await prisma.receivable.deleteMany({ where: includePago ? siblingsWhere : { ...siblingsWhere, payments: { none: {} } } });
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
    try {
      const result = await performDelete(entityType, entityId, user.officeId, alsoDeleteLinked);
      return { warning: result.warning };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não foi possível excluir." };
    }
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
  } catch (e) {
    // P2025 (registro já não existe — foi removido por outro caminho) é benigno: segue para
    // marcar a solicitação como resolvida, é exatamente o caso que este catch foi escrito para
    // cobrir. Qualquer outro erro (ex.: P2003 de violação de FK, ou o bloqueio explícito do bloco
    // CASE acima) NÃO pode virar "APROVADA" silenciosamente — o solicitante entenderia que o
    // registro foi excluído quando na verdade continua inteiro no sistema.
    const isRecordNotFound = typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2025";
    if (!isRecordNotFound) {
      return { error: e instanceof Error ? e.message : "Não foi possível excluir." };
    }
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
