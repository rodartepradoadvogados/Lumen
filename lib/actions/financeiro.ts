"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinanceAccess } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice, isClientInOffice, isCategoryInOffice, isCostCenterInOffice, isSupplierInOffice, isBankAccountInOffice } from "@/lib/officeScope";
import { valorLiquido, statusPorPagamentos } from "@/lib/financeCalc";
import { renameDriveFile } from "@/lib/storageProvider";
import { buildReceiptFileName, extensionFromFileName } from "@/lib/financeReceiptNaming";

// Exportado para lib/actions/honorarioLancamento.ts reaproveitar a mesma checagem de vínculos
// (categoria/centro de custo/cliente/processo do escritório do usuário logado) no lançamento
// de honorários parcelado, em vez de duplicar a função. bankAccountId (Fase 2 — bloco
// Recebimento do Lançamento de Honorários) é opcional pelo mesmo motivo dos demais: só é checado
// quando o chamador de fato manda um valor.
export async function assertFinanceRelationsInOffice(
  data: { caseId?: string; clientId?: string; categoryId?: string; costCenterId?: string; supplierId?: string; bankAccountId?: string },
  officeId: string
): Promise<void> {
  if (data.caseId && !(await isCaseInOffice(data.caseId, officeId))) throw new Error("Processo não encontrado.");
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.categoryId && !(await isCategoryInOffice(data.categoryId, officeId))) throw new Error("Categoria não encontrada.");
  if (data.costCenterId && !(await isCostCenterInOffice(data.costCenterId, officeId))) throw new Error("Centro de custo não encontrado.");
  if (data.supplierId && !(await isSupplierInOffice(data.supplierId, officeId))) throw new Error("Fornecedor não encontrado.");
  if (data.bankAccountId && !(await isBankAccountInOffice(data.bankAccountId, officeId))) throw new Error("Conta bancária não encontrada.");
}

// Não pode ser exportada (todo export de um arquivo "use server" precisa ser função async) —
// lib/actions/honorarioLancamento.ts mantém sua própria cópia local desta mesma lista de
// revalidatePath.
function revalidateFinance() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  revalidatePath("/financeiro/fluxo-de-caixa");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath("/agenda");
  revalidatePath("/kanban");
}

function firstOfNextMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

// Revalida a aba Financeiro do Processo nas duas versões (site e app) — algumas ações deste
// arquivo (dar baixa, reabrir) mexem no status/valor pago de uma conta vinculada a um processo
// mas só revalidavam os caminhos gerais de Financeiro; sem isto, quem estava com o Processo (ou
// o app mobile) aberto em outra aba/dispositivo podia continuar vendo o status antigo até um F5
// forçado — ver HonorarioLancamentoCard.tsx (site) e MobileCaseFinanceTab.tsx (app).
function revalidateCase(caseId: string | null | undefined) {
  if (!caseId) return;
  revalidatePath(`/processos/${caseId}`);
  revalidatePath(`/m/processos/${caseId}`);
}

// Confere acesso ao módulo Financeiro (requireFinanceAccess) e devolve o officeId do
// usuário logado, para uso em todo where/data deste arquivo — nunca operar em
// Payable/Receivable/FinancialCategory/CostCenter sem passar por aqui. Exportado para
// lib/actions/honorarioLancamento.ts reaproveitar a mesma checagem.
export async function requireFinanceOfficeId(): Promise<string> {
  await requireFinanceAccess();
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão inválida.");
  return user.officeId;
}

// Comprovante de pagamento/recebimento — ver lib/financeReceiptNaming.ts (o formato do nome) e
// app/api/financeiro/comprovante/upload/route.ts (o upload em si, que grava
// receiptDriveUrl/receiptStorageProvider/receiptStorageFileId/receiptFileName pela primeira vez).
//
// Chamada DEPOIS que updatePayable/updateReceivable já salvaram os campos editados: relê a conta
// do zero (nunca confia em `data`/`existing` de quem chamou — description/fornecedor podem ter
// sido recusados/normalizados no meio do caminho) e, só se já existir um comprovante anexado,
// recalcula o nome que ele DEVERIA ter agora. Se mudou (descrição, fornecedor/cliente, ou a data
// de pagamento passou a existir/mudou), renomeia o arquivo no provedor de armazenamento.
//
// Best-effort de propósito — nunca deixa lançar: uma falha ao renomear (Drive fora do ar, token
// expirado) não pode desfazer a edição que o usuário já salvou; o arquivo só fica com o nome
// antigo até a próxima edição bem-sucedida tentar de novo.
async function maybeRenameFinanceReceipt(kind: "PAYABLE" | "RECEIVABLE", id: string, officeId: string): Promise<void> {
  try {
    if (kind === "PAYABLE") {
      const p = await prisma.payable.findFirst({
        where: { id, officeId },
        select: { description: true, supplier: true, paidDate: true, dueDate: true, receiptStorageFileId: true, receiptFileName: true },
      });
      if (!p?.receiptStorageFileId) return;
      const desired = buildReceiptFileName({
        date: p.paidDate ?? p.dueDate,
        counterpart: p.supplier,
        description: p.description,
        extension: extensionFromFileName(p.receiptFileName || "arquivo.pdf"),
      });
      if (desired === p.receiptFileName) return;
      await renameDriveFile(p.receiptStorageFileId, desired, officeId);
      await prisma.payable.update({ where: { id }, data: { receiptFileName: desired } });
    } else {
      const r = await prisma.receivable.findFirst({
        where: { id, officeId },
        select: {
          description: true,
          payerName: true,
          paidDate: true,
          dueDate: true,
          receiptStorageFileId: true,
          receiptFileName: true,
          client: { select: { name: true } },
        },
      });
      if (!r?.receiptStorageFileId) return;
      const desired = buildReceiptFileName({
        date: r.paidDate ?? r.dueDate,
        counterpart: r.client?.name ?? r.payerName ?? null,
        description: r.description,
        extension: extensionFromFileName(r.receiptFileName || "arquivo.pdf"),
      });
      if (desired === r.receiptFileName) return;
      await renameDriveFile(r.receiptStorageFileId, desired, officeId);
      await prisma.receivable.update({ where: { id }, data: { receiptFileName: desired } });
    }
  } catch (e) {
    console.error(`[financeiro] falha ao renomear comprovante de ${kind === "PAYABLE" ? "despesa" : "receita"} ${id}:`, e);
  }
}

// Cria um lembrete de vencimento na Agenda/Kanban para uma parcela recorrente
// de contas a pagar/receber, vinculado ao processo quando houver. Exportado para
// lib/actions/honorarioLancamento.ts reaproveitar no lembrete da parcela de entrada.
export async function createInstallmentReminder(officeId: string, kind: "pagar" | "receber", title: string, dueDate: Date, caseId?: string | null) {
  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId }, orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      officeId,
      title: `${kind === "pagar" ? "Vencimento a pagar" : "Vencimento a receber"}: ${title}`,
      type: "PRAZO",
      dueDate,
      priority: "MEDIA",
      caseId: caseId || null,
      columnId: firstColumn?.id,
    },
  });
}

// Recalcula status/campos legados de uma Payable a partir da SOMA real dos FinancePayment dela —
// chamada depois de toda operação que cria/apaga uma linha em FinancePayment (baixa, baixa em
// bloco, reabertura), para os dois nunca divergirem (várias telas ainda leem só os campos
// legados: status/paidAmount/paidDate/paymentReceiptNumber/paymentMethod). paidAmount passa a
// guardar a SOMA (não mais "o último valor pago"); paidDate/paymentReceiptNumber/paymentMethod
// espelham o pagamento mais recente (createdAt desc), única aproximação possível já que são
// campos singulares e um lançamento pode ter N pagamentos (Fase 3 — baixa parcial).
async function syncPayableStatus(id: string, officeId: string): Promise<void> {
  const p = await prisma.payable.findFirst({ where: { id, officeId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!p) return;
  const soma = p.payments.reduce((s, x) => s + x.amount, 0);
  const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
  const status = statusPorPagamentos(liquido, soma);
  const last = p.payments[0];
  await prisma.payable.update({
    where: { id },
    data: {
      status,
      paidAmount: soma > 0 ? soma : null,
      paidDate: last ? last.paidDate : null,
      paymentReceiptNumber: last?.documentNumber ?? null,
      paymentMethod: last?.paymentMethod ?? null,
    },
  });
}

// Mesma conta acima, para Receivable — nunca chamada para uma linha A_APURAR (provisão de
// honorário percentual sem valor real, ver lib/actions/honorarioLancamento.ts): o botão de baixa
// não aparece para essas linhas na UI (HonorarioLancamentoCard), e statusPorPagamentos só devolve
// PENDENTE/PARCIAL/PAGO, nunca A_APURAR — não há como esta função "promover" uma provisão sem
// querer.
async function syncReceivableStatus(id: string, officeId: string): Promise<void> {
  const r = await prisma.receivable.findFirst({ where: { id, officeId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!r) return;
  const soma = r.payments.reduce((s, x) => s + x.amount, 0);
  const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
  const status = statusPorPagamentos(liquido, soma);
  const last = r.payments[0];
  await prisma.receivable.update({
    where: { id },
    data: {
      status,
      paidAmount: soma > 0 ? soma : null,
      paidDate: last ? last.paidDate : null,
      paymentReceiptNumber: last?.documentNumber ?? null,
      paymentMethod: last?.paymentMethod ?? null,
    },
  });
}

// Dar baixa (Fase 3 — aceita valor PARCIAL, menor que o saldo em aberto): cada chamada cria UM
// FinancePayment novo (nunca sobrescreve os anteriores) e recalcula o status pela soma real —
// ver syncPayableStatus. bankAccountId é opcional pelo mesmo motivo dos demais vínculos
// opcionais deste arquivo: só checado quando informado.
export async function markPayablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string, paymentMethod?: string, bankAccountId?: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true, caseId: true } });
  if (!existing) throw new Error("Conta a pagar não encontrada.");
  if (bankAccountId) await assertFinanceRelationsInOffice({ bankAccountId }, officeId);
  await prisma.financePayment.create({
    data: {
      officeId,
      amount: paidAmount,
      paidDate: new Date(paidDate),
      paymentMethod: paymentMethod || null,
      documentNumber: receiptNumber || null,
      bankAccountId: bankAccountId || null,
      payableId: id,
    },
  });
  await syncPayableStatus(id, officeId);
  revalidateFinance();
  revalidateCase(existing.caseId);
}

export async function markReceivablePaid(id: string, paidAmount: number, paidDate: string, receiptNumber?: string, paymentMethod?: string, bankAccountId?: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true, caseId: true } });
  if (!existing) throw new Error("Conta a receber não encontrada.");
  if (bankAccountId) await assertFinanceRelationsInOffice({ bankAccountId }, officeId);
  await prisma.financePayment.create({
    data: {
      officeId,
      amount: paidAmount,
      paidDate: new Date(paidDate),
      paymentMethod: paymentMethod || null,
      documentNumber: receiptNumber || null,
      bankAccountId: bankAccountId || null,
      receivableId: id,
    },
  });
  await syncReceivableStatus(id, officeId);
  revalidateFinance();
  revalidateCase(existing.caseId);
}

// Baixa em bloco: várias contas quitadas na mesma transferência/pagamento — SEMPRE integral
// (quita exatamente o saldo em aberto de cada uma, nunca um valor arbitrário), diferente da baixa
// individual (markPayablePaid/markReceivablePaid), que aceita parcial. Uma conta já PAGA (saldo
// zero) é ignorada silenciosamente — na prática nunca chega selecionável aqui (as listas só
// deixam marcar contas com status != PAGO), mas o guard evita criar um FinancePayment de valor
// zero se algo mudar por trás enquanto a tela estava aberta.
export async function markManyPayablesPaid(ids: string[], paidDate: string, receiptNumber?: string, paymentMethod?: string, bankAccountId?: string): Promise<{ count: number }> {
  const officeId = await requireFinanceOfficeId();
  if (ids.length === 0) return { count: 0 };
  if (bankAccountId) await assertFinanceRelationsInOffice({ bankAccountId }, officeId);
  const items = await prisma.payable.findMany({ where: { id: { in: ids }, officeId }, include: { payments: true } });
  const date = new Date(paidDate);
  for (const p of items) {
    const soma = p.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = Math.max(0, valorLiquido(p.amount, p.discount, p.surcharge) - soma);
    if (saldo <= 0) continue;
    await prisma.financePayment.create({
      data: {
        officeId,
        amount: saldo,
        paidDate: date,
        paymentMethod: paymentMethod || null,
        documentNumber: receiptNumber || null,
        bankAccountId: bankAccountId || null,
        payableId: p.id,
      },
    });
    await syncPayableStatus(p.id, officeId);
  }
  revalidateFinance();
  for (const caseId of new Set(items.map((p) => p.caseId).filter((id): id is string => Boolean(id)))) revalidateCase(caseId);
  return { count: items.length };
}

export async function markManyReceivablesPaid(ids: string[], paidDate: string, receiptNumber?: string, paymentMethod?: string, bankAccountId?: string): Promise<{ count: number }> {
  const officeId = await requireFinanceOfficeId();
  if (ids.length === 0) return { count: 0 };
  if (bankAccountId) await assertFinanceRelationsInOffice({ bankAccountId }, officeId);
  const items = await prisma.receivable.findMany({ where: { id: { in: ids }, officeId }, include: { payments: true } });
  const date = new Date(paidDate);
  for (const r of items) {
    const soma = r.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = Math.max(0, valorLiquido(r.amount, r.discount, r.surcharge) - soma);
    if (saldo <= 0) continue;
    await prisma.financePayment.create({
      data: {
        officeId,
        amount: saldo,
        paidDate: date,
        paymentMethod: paymentMethod || null,
        documentNumber: receiptNumber || null,
        bankAccountId: bankAccountId || null,
        receivableId: r.id,
      },
    });
    await syncReceivableStatus(r.id, officeId);
  }
  revalidateFinance();
  for (const caseId of new Set(items.map((r) => r.caseId).filter((id): id is string => Boolean(id)))) revalidateCase(caseId);
  return { count: items.length };
}

// Reabrir (Fase 3): apaga TODOS os FinancePayment da conta, não só limpa os campos legados —
// senão uma conta PARCIAL reaberta voltaria a exibir "PENDENTE" nos campos legados enquanto o
// histórico de pagamentos parciais continuaria por baixo, e a próxima baixa recalcularia errado
// (a soma incluiria pagamentos que o usuário queria desfazer). Reabrir é sempre "voltar à
// estaca zero": quem quiser corrigir só uma baixa específica cancela e lança de novo.
export async function reopenPayable(id: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({ where: { id, officeId }, select: { id: true, caseId: true } });
  if (!existing) throw new Error("Conta a pagar não encontrada.");
  await prisma.$transaction([
    prisma.financePayment.deleteMany({ where: { payableId: id, officeId } }),
    prisma.payable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null, paymentMethod: null } }),
  ]);
  revalidateFinance();
  revalidateCase(existing.caseId);
}

export async function reopenReceivable(id: string) {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true, caseId: true } });
  if (!existing) throw new Error("Conta a receber não encontrada.");
  await prisma.$transaction([
    prisma.financePayment.deleteMany({ where: { receivableId: id, officeId } }),
    prisma.receivable.update({ where: { id }, data: { status: "PENDENTE", paidAmount: null, paidDate: null, paymentReceiptNumber: null, paymentMethod: null } }),
  ]);
  revalidateFinance();
  revalidateCase(existing.caseId);
}

async function supplierDisplayName(supplierId: string | undefined, officeId: string): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, officeId }, select: { name: true } });
  return supplier?.name ?? null;
}

// ---- Fase 3 — Contas a Pagar/Receber com a mesma casca de Lançar Honorários -----------------
// Tipos compartilhados entre createPayable/createReceivable, no mesmo formato de
// lib/actions/honorarioLancamento.ts:ParcelaInput/PagamentoInput — duplicados aqui (não
// importados de lá) porque um arquivo "use server" só pode exportar função async, e os dois
// arquivos não têm nenhuma outra razão para se importar um ao outro.
export type ParcelaInput = {
  dueDate: string;
  amount: string;
  installmentBoleto?: string;
  pago: boolean;
};

export type PagamentoInput = {
  paidDate: string;
  paidAmount: string;
  bankAccountId?: string;
  documentNumber?: string;
  paymentMethod?: string;
};

async function registrarPagamentoPayable(payableId: string, pagamento: PagamentoInput, officeId: string): Promise<void> {
  const paidAmount = parseFloat(pagamento.paidAmount || "0") || 0;
  await prisma.financePayment.create({
    data: {
      officeId,
      amount: paidAmount,
      paidDate: new Date(pagamento.paidDate || ""),
      paymentMethod: pagamento.paymentMethod || null,
      documentNumber: pagamento.documentNumber || null,
      bankAccountId: pagamento.bankAccountId || null,
      payableId,
    },
  });
  await syncPayableStatus(payableId, officeId);
}

async function registrarPagamentoReceivable(receivableId: string, pagamento: PagamentoInput, officeId: string): Promise<void> {
  const paidAmount = parseFloat(pagamento.paidAmount || "0") || 0;
  await prisma.financePayment.create({
    data: {
      officeId,
      amount: paidAmount,
      paidDate: new Date(pagamento.paidDate || ""),
      paymentMethod: pagamento.paymentMethod || null,
      documentNumber: pagamento.documentNumber || null,
      bankAccountId: pagamento.bankAccountId || null,
      receivableId,
    },
  });
  await syncReceivableStatus(receivableId, officeId);
}

export async function updatePayable(id: string, data: {
  description: string;
  supplierId?: string;
  costCenterId?: string;
  categoryId?: string;
  caseId?: string;
  responsibleId?: string;
  documentType?: string;
  documentNumber?: string;
  issueDate?: string;
  installmentBoleto?: string;
  amount: string;
  discount?: string;
  surcharge?: string;
  dueDate: string;
  noDueDate?: boolean;
  // ---- Despesas do Processo (Fase 10) — mesmos campos de CreatePayableInput, agora também
  // editáveis depois que a despesa já existe (ver EditPayableModal.tsx). Só têm efeito quando há
  // processo vinculado (caseId, vindo deste próprio `data` ou já existente na Payable). ----
  kind?: string;
  expensePayer?: string;
  // Só relevante quando expensePayer = CLIENTE e a Payable AINDA NÃO TEM reembolso vinculado —
  // reembolso retroativo (a despesa já existia sem reembolso e o usuário decidiu criar um agora),
  // reaproveitando a mesma createReimbursementReceivable de createPayable abaixo. Se já existe um
  // reimbursementReceivable, este campo é ignorado (nunca cria um segundo — o @unique de
  // reimbursesPayableId barra por trás mesmo assim, mas não queremos chegar nele).
  createReimbursement?: boolean;
}): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.payable.findFirst({
    where: { id, officeId },
    include: { reimbursementReceivable: { select: { id: true } } },
  });
  if (!existing) return { error: "Conta a pagar não encontrada." };
  try {
    await assertFinanceRelationsInOffice(data, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }
  if (!data.description.trim()) return { error: "Informe a descrição." };
  const noDueDate = data.noDueDate ?? false;
  if (!noDueDate && isNaN(new Date(data.dueDate).getTime())) {
    return { error: 'Informe a data de vencimento, ou marque "Sem vencimento definido".' };
  }

  const hasReimbursement = Boolean(existing.reimbursementReceivable);
  // Já existe reembolso vinculado: além de travar a troca de expensePayer de volta pra
  // ESCRITORIO (ver abaixo), também trava o PROCESSO desta despesa no que já estava — trocar de
  // processo com um reembolso vinculado deixaria o reembolso "sobrando" ligado a um caseId
  // diferente do da própria despesa, uma inconsistência que a UI nem oferece (EditPayableModal
  // não deixa mexer no processo neste caso), mas o servidor garante de qualquer jeito.
  const effectiveCaseId = hasReimbursement ? (existing.caseId ?? undefined) : (data.caseId || undefined);
  // kind/expensePayer só existem quando há processo vinculado (mesma regra de createPayable) —
  // sem caseId, a edição não pode deixar nenhum dos dois "preso" num valor que não faz mais
  // sentido fora de um processo.
  const kind = effectiveCaseId ? (data.kind || "OUTROS") : "OUTROS";
  let expensePayer = effectiveCaseId && data.expensePayer === "CLIENTE" ? "CLIENTE" : "ESCRITORIO";
  // Já existe reembolso vinculado: a UI (EditPayableModal) já trava a troca de volta pra
  // ESCRITORIO e nem mostra a opção — o servidor nunca confia só nisso. Se por algum motivo
  // chegar aqui pedindo ESCRITORIO com reembolso já criado, ignora o pedido: para desfazer, o
  // usuário precisa excluir o reembolso primeiro (ver DeleteEntityButton.tsx/deletion.ts).
  if (hasReimbursement) expensePayer = "CLIENTE";

  const wantsReimbursement =
    !hasReimbursement && Boolean(data.createReimbursement) && expensePayer === "CLIENTE" && Boolean(effectiveCaseId);

  const supplierName = await supplierDisplayName(data.supplierId, officeId);
  const amount = parseFloat(data.amount);
  const discount = parseFloat(data.discount || "0") || 0;
  const surcharge = parseFloat(data.surcharge || "0") || 0;
  // Usada só para o reembolso retroativo, quando pedido — dueDate real do vencimento informado
  // agora, ou o vencimento que a própria Payable já tinha (nunca null: dueDate é obrigatório no
  // schema, mesmo quando noDueDate = true, ver createPayable).
  const reimbursementDueDate = noDueDate ? existing.dueDate : new Date(data.dueDate);

  await prisma.payable.update({
    where: { id },
    data: {
      description: data.description,
      supplierId: data.supplierId || null,
      supplier: supplierName,
      costCenterId: data.costCenterId || null,
      categoryId: data.categoryId || null,
      caseId: effectiveCaseId || null,
      responsibleId: data.responsibleId || null,
      documentType: data.documentType || null,
      documentNumber: data.documentNumber || null,
      issueDate: data.issueDate ? new Date(data.issueDate) : null,
      installmentBoleto: data.installmentBoleto || null,
      amount,
      discount,
      surcharge,
      dueDate: noDueDate ? undefined : new Date(data.dueDate),
      noDueDate,
      kind,
      expensePayer,
    },
  });

  if (wantsReimbursement && effectiveCaseId) {
    await createReimbursementReceivable({
      officeId,
      caseId: effectiveCaseId,
      payableId: id,
      payableDescription: data.description,
      amount: valorLiquido(amount, discount, surcharge),
      dueDate: reimbursementDueDate,
    });
  }

  await maybeRenameFinanceReceipt("PAYABLE", id, officeId);

  revalidateFinance();
  revalidateCase(effectiveCaseId ?? existing.caseId);
  return {};
}

export async function updateReceivable(id: string, data: {
  description: string;
  amount: string;
  discount?: string;
  surcharge?: string;
  dueDate: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  clientId?: string;
  caseId?: string;
  responsibleId?: string;
  documentType?: string;
  documentNumber?: string;
  issueDate?: string;
  installmentBoleto?: string;
  noDueDate?: boolean;
}): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.receivable.findFirst({ where: { id, officeId }, select: { id: true } });
  if (!existing) return { error: "Conta a receber não encontrada." };
  try {
    await assertFinanceRelationsInOffice(data, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }
  if (!data.description.trim()) return { error: "Informe a descrição." };
  const noDueDate = data.noDueDate ?? false;
  if (!noDueDate && isNaN(new Date(data.dueDate).getTime())) {
    return { error: 'Informe a data de vencimento, ou marque "Sem vencimento definido".' };
  }
  await prisma.receivable.update({
    where: { id },
    data: {
      description: data.description,
      amount: parseFloat(data.amount),
      discount: parseFloat(data.discount || "0") || 0,
      surcharge: parseFloat(data.surcharge || "0") || 0,
      dueDate: noDueDate ? undefined : new Date(data.dueDate),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      clientId: data.clientId || null,
      caseId: data.caseId || null,
      responsibleId: data.responsibleId || null,
      documentType: data.documentType || null,
      documentNumber: data.documentNumber || null,
      issueDate: data.issueDate ? new Date(data.issueDate) : null,
      installmentBoleto: data.installmentBoleto || null,
      noDueDate,
    },
  });

  await maybeRenameFinanceReceipt("RECEIVABLE", id, officeId);

  revalidateFinance();
  return {};
}

// Cria o Receivable de reembolso vinculado a uma Payable — reaproveitado por createPayable
// (reembolso nascendo junto da despesa) e updatePayable (reembolso retroativo, lançado numa
// despesa que já existia — ver EditPayableModal.tsx). Quem chama já garante que a Payable ainda
// não tem nenhum reembolso vinculado (createPayable, porque acabou de nascer; updatePayable,
// checando existing.reimbursementReceivable antes de chegar aqui) — o @unique de
// reimbursesPayableId barra por trás mesmo assim, mas não queremos um erro feio de constraint
// chegando à tela por causa de uma corrida rara (duas abas editando a mesma despesa ao mesmo
// tempo). Sem cliente cadastrado no processo, não cria nada (a despesa continua existindo
// normalmente, só sem o reembolso).
async function createReimbursementReceivable(params: {
  officeId: string;
  caseId: string;
  payableId: string;
  payableDescription: string;
  amount: number;
  dueDate: Date;
}): Promise<void> {
  const caseInfo = await prisma.case.findFirst({ where: { id: params.caseId, officeId: params.officeId }, select: { clientId: true } });
  if (!caseInfo?.clientId) return;
  await prisma.receivable.create({
    data: {
      officeId: params.officeId,
      caseId: params.caseId,
      clientId: caseInfo.clientId,
      kind: "REEMBOLSO",
      description: `Reembolso — ${params.payableDescription}`,
      amount: params.amount,
      dueDate: params.dueDate,
      noDueDate: true,
      status: "PENDENTE",
      reimbursesPayableId: params.payableId,
    },
  });
}

export type CreatePayableInput = {
  description: string;
  supplierId?: string;
  costCenterId?: string;
  categoryId?: string;
  caseId?: string;
  responsibleId?: string;
  documentType?: string;
  documentNumber?: string;
  issueDate?: string;
  amount?: string; // valor único, quando não parcelado
  discount?: string;
  surcharge?: string;
  dueDate?: string;
  noDueDate?: boolean;
  parcelado: boolean;
  parcelas?: ParcelaInput[];
  pago: boolean;
  pagamento?: PagamentoInput;
  // ---- Despesas do Processo (Fase 10) — só usados quando caseId está preenchido; ver
  // lib/despesaProcesso.ts. Ignorados (ficam no default) para despesa sem processo vinculado. ----
  kind?: string; // ver lib/despesaProcesso.ts:PAYABLE_KIND_OPTIONS
  expensePayer?: string; // ESCRITORIO (default) | CLIENTE
  // Só relevante quando expensePayer = CLIENTE: cria, na mesma operação, um Receivable de
  // reembolso vinculado (kind "REEMBOLSO") para o cliente do processo — ver bloco abaixo.
  createReimbursement?: boolean;
};

export async function createPayable(data: CreatePayableInput): Promise<{ error?: string; id?: string }> {
  const officeId = await requireFinanceOfficeId();
  try {
    await assertFinanceRelationsInOffice({ ...data, bankAccountId: data.pagamento?.bankAccountId }, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }
  if (!data.description.trim()) return { error: "Informe a descrição." };

  // Trava do produto (mesma do Lançamento de Honorários, ver lib/actions/honorarioLancamento.ts):
  // parcelado e já pago são mutuamente exclusivos — a UI já desabilita um quando o outro está
  // marcado, mas o Server Action nunca confia só nisso.
  const parcelado = data.parcelado;
  const pago = data.pago && !parcelado;
  const noDueDate = data.noDueDate ?? false;
  const kind = data.kind || "OUTROS";
  const expensePayer = data.expensePayer === "CLIENTE" ? "CLIENTE" : "ESCRITORIO";
  // Reembolso só faz sentido com despesa de processo adiantada pelo escritório em nome do
  // cliente — sem caseId (despesa geral) ou com expensePayer ESCRITORIO, nunca cria nada além
  // da Payable, mesmo que createReimbursement venha true por engano do chamador.
  const wantsReimbursement = Boolean(data.createReimbursement) && expensePayer === "CLIENTE" && Boolean(data.caseId);

  const supplierName = await supplierDisplayName(data.supplierId, officeId);
  const shared = {
    officeId,
    categoryId: data.categoryId || null,
    costCenterId: data.costCenterId || null,
    caseId: data.caseId || null,
    supplierId: data.supplierId || null,
    supplier: supplierName,
    responsibleId: data.responsibleId || null,
    documentType: data.documentType || null,
    documentNumber: data.documentNumber || null,
    issueDate: data.issueDate ? new Date(data.issueDate) : null,
    kind,
    expensePayer,
  };

  // Soma do valor líquido total desta despesa (parcelada ou não) — usada só para o Receivable de
  // reembolso, quando pedido. Decisão de produto (parcelamento de despesa + reembolso): o
  // reembolso nasce sempre como valor ÚNICO pelo TOTAL, mesmo quando a despesa original é
  // parcelada — cobrar o cliente parcela a parcela, na mesma cadência do adiantamento do
  // escritório, teria pouco valor prático (o cliente não "sente" o parcelamento interno do
  // escritório) e complicaria a rastreabilidade 1:1 pedida (Receivable.reimbursesPayableId é
  // @unique, isto é, uma Payable só pode gerar UM Receivable de reembolso — não uma por parcela).
  // Simples e suficiente para o caso de uso descrito (adiantar custas/perícia/cópia e cobrar de
  // volta em um único lançamento).
  let reimbursementTotal = 0;
  let reimbursementDueDate: Date | null = null;
  let firstPayableId: string | null = null;

  if (parcelado) {
    const rows = data.parcelas ?? [];
    if (rows.length === 0) return { error: "Informe ao menos uma parcela." };
    const groupId = crypto.randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowAmount = parseFloat(row.amount || "0") || 0;
      const rowDueDate = new Date(row.dueDate || "");
      if (isNaN(rowDueDate.getTime())) return { error: `Parcela ${i + 1}/${rows.length}: informe o vencimento.` };
      const description = `${data.description} (${i + 1}/${rows.length})`;
      const payable = await prisma.payable.create({
        data: {
          ...shared,
          description,
          amount: rowAmount,
          dueDate: rowDueDate,
          groupId,
          installmentNumber: i + 1,
          installmentTotal: rows.length,
          installmentBoleto: row.installmentBoleto || null,
        },
      });
      if (i === 0) {
        firstPayableId = payable.id;
        reimbursementDueDate = rowDueDate;
      }
      reimbursementTotal += rowAmount;
      if (row.pago) {
        // Único caminho para lançamento retroativo parcelado: a parcela já quitada antes do
        // cadastro se marca na própria linha da tabela (mesma regra da Fase 2).
        await prisma.financePayment.create({
          data: { officeId, amount: rowAmount, paidDate: rowDueDate, documentNumber: row.installmentBoleto || null, payableId: payable.id },
        });
        await syncPayableStatus(payable.id, officeId);
      } else {
        await createInstallmentReminder(officeId, "pagar", description, rowDueDate, data.caseId);
      }
    }
  } else {
    const amount = parseFloat(data.amount || "0") || 0;
    const discount = parseFloat(data.discount || "0") || 0;
    const surcharge = parseFloat(data.surcharge || "0") || 0;
    const dueDate = noDueDate ? firstOfNextMonth() : new Date(data.dueDate || "");
    if (!noDueDate && isNaN(dueDate.getTime())) {
      return { error: 'Informe a data de vencimento, ou marque "Sem vencimento definido".' };
    }
    const payable = await prisma.payable.create({
      data: { ...shared, description: data.description, amount, discount, surcharge, dueDate, noDueDate },
    });
    firstPayableId = payable.id;
    reimbursementDueDate = dueDate;
    reimbursementTotal = valorLiquido(amount, discount, surcharge);
    if (pago && data.pagamento) {
      await registrarPagamentoPayable(payable.id, data.pagamento, officeId);
    } else if (!noDueDate) {
      await createInstallmentReminder(officeId, "pagar", data.description, dueDate, data.caseId);
    }
  }

  if (wantsReimbursement && firstPayableId) {
    await createReimbursementReceivable({
      officeId,
      caseId: data.caseId!,
      payableId: firstPayableId,
      payableDescription: data.description,
      amount: reimbursementTotal,
      dueDate: reimbursementDueDate ?? firstOfNextMonth(),
    });
  }

  revalidateFinance();
  revalidateCase(data.caseId);
  // id do primeiro lançamento criado (único, se não parcelado; a 1ª parcela, se parcelado) —
  // usado por NewPayableModal.tsx/MobileNewPayableForm.tsx para anexar o comprovante de
  // pagamento/recebimento (ver app/api/financeiro/comprovante/upload/route.ts) assim que a conta
  // existe, já que o upload precisa de um id de Payable real (o arquivo é catalogado com dados
  // que só existem depois do create, e a pasta do Drive/OneDrive/Dropbox é resolvida por conta).
  return { id: firstPayableId ?? undefined };
}

export type CreateReceivableInput = {
  description: string;
  clientId?: string;
  costCenterId?: string;
  categoryId?: string;
  caseId?: string;
  responsibleId?: string;
  kind: string;
  documentType?: string;
  documentNumber?: string;
  issueDate?: string;
  amount?: string;
  discount?: string;
  surcharge?: string;
  dueDate?: string;
  noDueDate?: boolean;
  parcelado: boolean;
  parcelas?: ParcelaInput[];
  recebido: boolean;
  pagamento?: PagamentoInput;
};

export async function createReceivable(data: CreateReceivableInput): Promise<{ error?: string; id?: string }> {
  const officeId = await requireFinanceOfficeId();
  try {
    await assertFinanceRelationsInOffice({ ...data, bankAccountId: data.pagamento?.bankAccountId }, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }
  if (!data.description.trim()) return { error: "Informe a descrição." };

  // Mesma trava de createPayable acima.
  const parcelado = data.parcelado;
  const recebido = data.recebido && !parcelado;
  const noDueDate = data.noDueDate ?? false;

  const shared = {
    officeId,
    categoryId: data.categoryId || null,
    costCenterId: data.costCenterId || null,
    caseId: data.caseId || null,
    clientId: data.clientId || null,
    kind: data.kind || "HONORARIOS_CONTRATUAIS",
    responsibleId: data.responsibleId || null,
    documentType: data.documentType || null,
    documentNumber: data.documentNumber || null,
    issueDate: data.issueDate ? new Date(data.issueDate) : null,
  };

  let firstReceivableId: string | null = null;

  if (parcelado) {
    const rows = data.parcelas ?? [];
    if (rows.length === 0) return { error: "Informe ao menos uma parcela." };
    const groupId = crypto.randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowAmount = parseFloat(row.amount || "0") || 0;
      const rowDueDate = new Date(row.dueDate || "");
      if (isNaN(rowDueDate.getTime())) return { error: `Parcela ${i + 1}/${rows.length}: informe o vencimento.` };
      const description = `${data.description} (${i + 1}/${rows.length})`;
      const receivable = await prisma.receivable.create({
        data: {
          ...shared,
          description,
          amount: rowAmount,
          dueDate: rowDueDate,
          groupId,
          installmentNumber: i + 1,
          installmentTotal: rows.length,
          installmentBoleto: row.installmentBoleto || null,
        },
      });
      if (i === 0) firstReceivableId = receivable.id;
      if (row.pago) {
        await prisma.financePayment.create({
          data: { officeId, amount: rowAmount, paidDate: rowDueDate, documentNumber: row.installmentBoleto || null, receivableId: receivable.id },
        });
        await syncReceivableStatus(receivable.id, officeId);
      } else {
        await createInstallmentReminder(officeId, "receber", description, rowDueDate, data.caseId);
      }
    }
  } else {
    const amount = parseFloat(data.amount || "0") || 0;
    const discount = parseFloat(data.discount || "0") || 0;
    const surcharge = parseFloat(data.surcharge || "0") || 0;
    const dueDate = noDueDate ? firstOfNextMonth() : new Date(data.dueDate || "");
    if (!noDueDate && isNaN(dueDate.getTime())) {
      return { error: 'Informe a data de vencimento, ou marque "Sem vencimento definido".' };
    }
    const receivable = await prisma.receivable.create({
      data: { ...shared, description: data.description, amount, discount, surcharge, dueDate, noDueDate },
    });
    firstReceivableId = receivable.id;
    if (recebido && data.pagamento) {
      await registrarPagamentoReceivable(receivable.id, data.pagamento, officeId);
    } else if (!noDueDate) {
      await createInstallmentReminder(officeId, "receber", data.description, dueDate, data.caseId);
    }
  }

  revalidateFinance();
  revalidateCase(data.caseId);
  // Mesmo raciocínio de createPayable acima — id do primeiro lançamento, para
  // NewReceivableModal.tsx/MobileNewReceivableForm.tsx anexar o comprovante depois do create.
  return { id: firstReceivableId ?? undefined };
}

// Quantos meses (mês corrente + à frente) o RecurringFee sempre mantém materializados em
// Receivable — precisa cobrir a janela do Fluxo de Caixa (hoje: 3 meses à frente, ver
// app/(app)/financeiro/fluxo-de-caixa/page.tsx), senão os meses futuros aparecem zerados na
// projeção até o dia em que cada um "chegar" e o cron gerar a linha. Gerando com antecedência,
// a página de projeção não precisa de nenhuma lógica própria de extrapolação — ela já soma linhas
// reais como sempre fez.
const RECURRING_FEE_MONTHS_AHEAD = 4;

function competenciaFor(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// Usa o menor entre o dia configurado e o último dia do mês (evita "31 de fevereiro" virar 3 de
// março sozinho, que é o que Date faz por padrão quando o dia não existe naquele mês).
function dueDateFor(year: number, month0: number, dueDay: number): Date {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(dueDay, daysInMonth));
}

// Cria um honorário "até o arquivamento": diferente do parcelamento comum de createReceivable
// (quantidade fixa, tudo gerado de uma vez), aqui não existe uma quantidade final — o cron diário
// (ensureRecurringFeeReceivables, ver app/api/cron/recurring-fees/route.ts) mantém sempre os
// próximos RECURRING_FEE_MONTHS_AHEAD meses gerados, e para sozinho quando o processo é arquivado.
export async function createRecurringFee(data: {
  description: string;
  amount: string;
  dueDay: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  caseId: string;
}): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  if (!data.caseId) return { error: "Selecione um processo — honorário até o arquivamento precisa de um processo vinculado." };
  await assertFinanceRelationsInOffice(data, officeId);

  await prisma.recurringFee.create({
    data: {
      officeId,
      caseId: data.caseId,
      description: data.description,
      amount: parseFloat(data.amount),
      dueDay: Math.min(28, Math.max(1, parseInt(data.dueDay) || 10)),
      kind: data.kind,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
    },
  });
  // Materializa já os próximos meses (não espera o cron rodar amanhã) — a projeção de Fluxo de
  // Caixa reflete o novo honorário recorrente assim que ele é criado.
  await ensureRecurringFeeReceivables();
  revalidateFinance();
  revalidateCase(data.caseId);
  return {};
}

// Roda diariamente via cron (app/api/cron/recurring-fees/route.ts) — idempotente: a constraint
// única (recurringFeeId, competencia) em Receivable garante que rodar todo dia em vez de só no
// dia 1 não duplica nada. Também é quem desliga sozinho um RecurringFee cujo processo já foi
// arquivado, sem precisar de nenhum hook em updateCaseStatus.
export async function ensureRecurringFeeReceivables(): Promise<{ created: number; deactivated: number }> {
  const now = new Date();
  const fees = await prisma.recurringFee.findMany({
    where: { active: true },
    include: { case: { select: { status: true, clientId: true } } },
  });

  let created = 0;
  let deactivated = 0;
  for (const fee of fees) {
    if (fee.case.status === "ARQUIVADO") {
      await prisma.recurringFee.update({ where: { id: fee.id }, data: { active: false } });
      deactivated++;
      continue;
    }
    for (let i = 0; i < RECURRING_FEE_MONTHS_AHEAD; i++) {
      const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = target.getFullYear();
      const month0 = target.getMonth();
      const competencia = competenciaFor(year, month0);
      const exists = await prisma.receivable.findUnique({
        where: { recurringFeeId_competencia: { recurringFeeId: fee.id, competencia } },
      });
      if (exists) continue;

      const dueDate = dueDateFor(year, month0, fee.dueDay);
      const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      await prisma.receivable.create({
        data: {
          officeId: fee.officeId,
          description: `${fee.description} — ${monthLabel}`,
          amount: fee.amount,
          dueDate,
          kind: fee.kind,
          categoryId: fee.categoryId,
          costCenterId: fee.costCenterId,
          clientId: fee.case.clientId,
          caseId: fee.caseId,
          recurringFeeId: fee.id,
          competencia,
        },
      });
      created++;
    }
  }

  revalidateFinance();
  return { created, deactivated };
}

// Encerra manualmente um honorário até o arquivamento antes do processo ser arquivado (ex.:
// cliente renegociou, contrato encerrado) — as parcelas já geradas continuam existindo
// normalmente em Contas a Receber, só para de gerar as futuras.
export async function deactivateRecurringFee(id: string): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const existing = await prisma.recurringFee.findFirst({ where: { id, officeId } });
  if (!existing) return { error: "Honorário recorrente não encontrado." };
  await prisma.recurringFee.update({ where: { id }, data: { active: false } });
  revalidateFinance();
  revalidateCase(existing.caseId);
  return {};
}
