"use server";

// Lançamento de honorários na aba Financeiro do Processo (Fase 2) — a partir de agora um
// honorário não é mais "uma conta a receber": tem NATUREZA (contratual/sucumbencial), PAGADOR
// (cliente/parte adversa/outro), DOCUMENTO, FORMA DE COBRANÇA (dinheiro e/ou percentual sobre uma
// das quatro bases do processo), VENCIMENTO (ou "sem vencimento"), pode nascer PARCELADO (com
// tabela de parcelas editável) ou JÁ RECEBIDO — mas nunca as duas coisas ao mesmo tempo (ver
// createHonorarioLancamento abaixo, bloco `recebido = data.recebido && !data.parcelado`).
//
// Um HonorarioLancamento (cabeçalho) só é criado quando há parcelamento OU parte percentual —
// é ele que amarra as parcelas geradas juntas e, no caso do percentual, que permite ao abatimento
// (abaterEntrada) encontrar "o que já foi pago em dinheiro" no mesmo lançamento (ver
// lib/financeCalc.ts:valorPercentualApurado). Um honorário único e simples em dinheiro continua
// sendo uma Receivable solta, sem HonorarioLancamento, exatamente como antes da Fase 2.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  assertFinanceRelationsInOffice,
  createInstallmentReminder,
  requireFinanceOfficeId,
} from "@/lib/actions/financeiro";
import { baseValueFor, type CaseValueBases } from "@/lib/honorarioLancamento";
import { valorLiquido, valorPercentualApurado, statusPorPagamentos } from "@/lib/financeCalc";

// Cópia local da mesma lista de revalidatePath de lib/actions/financeiro.ts — não dá para
// importar de lá porque um arquivo "use server" só pode exportar função async, e esta é síncrona.
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

async function caseValueBases(caseId: string, officeId: string): Promise<CaseValueBases> {
  const c = await prisma.case.findFirst({
    where: { id: caseId, officeId },
    select: { caseValue: true, economicBenefitValue: true, convictionValue: true, agreementValue: true },
  });
  if (!c) throw new Error("Processo não encontrado.");
  return c;
}

function firstOfNextMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

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

export type CreateHonorarioInput = {
  description: string;
  caseId: string;
  clientId?: string;
  costCenterId?: string;
  categoryId?: string;
  natureza: "CONTRATUAL" | "SUCUMBENCIAL";
  payerType: "CLIENTE" | "ADVERSA" | "OUTRO";
  payerName?: string;
  responsibleId?: string;
  documentType?: string;
  documentNumber?: string;
  issueDate?: string;
  cobranca: "DINHEIRO" | "PERCENTUAL" | "AMBOS";
  amount?: string; // parte em dinheiro (cobranca DINHEIRO ou AMBOS)
  discount?: string;
  surcharge?: string;
  percentual?: string; // parte percentual (cobranca PERCENTUAL ou AMBOS)
  percentualBase?: string;
  abaterEntrada?: boolean; // só relevante em AMBOS — ver lib/financeCalc.ts:valorPercentualApurado
  dueDate?: string;
  noDueDate?: boolean;
  parcelado: boolean;
  valorTotalIndicado?: string;
  parcelas?: ParcelaInput[];
  recebido: boolean;
  pagamento?: PagamentoInput;
};

// Grava a baixa de uma Receivable recém-criada: soma no FinancePayment (histórico que viabiliza
// pagamento parcial no futuro) E nos campos legados status/paidAmount/paidDate (ainda lidos por
// SettleButton/listagens existentes) — as duas fontes ficam consistentes porque aqui só existe UM
// pagamento (o informado na criação).
async function registrarRecebimento(
  receivableId: string,
  amount: number,
  discount: number,
  surcharge: number,
  pagamento: PagamentoInput,
  officeId: string
): Promise<void> {
  const paidAmount = parseFloat(pagamento.paidAmount || "0") || 0;
  const paidDate = new Date(pagamento.paidDate || "");
  const status = statusPorPagamentos(valorLiquido(amount, discount, surcharge), paidAmount);
  await prisma.receivable.update({
    where: { id: receivableId },
    data: {
      status,
      paidAmount,
      paidDate,
      paymentReceiptNumber: pagamento.documentNumber || null,
      paymentMethod: pagamento.paymentMethod || null,
    },
  });
  await prisma.financePayment.create({
    data: {
      officeId,
      amount: paidAmount,
      paidDate,
      paymentMethod: pagamento.paymentMethod || null,
      documentNumber: pagamento.documentNumber || null,
      bankAccountId: pagamento.bankAccountId || null,
      receivableId,
    },
  });
}

export async function createHonorarioLancamento(data: CreateHonorarioInput): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  try {
    await assertFinanceRelationsInOffice({ ...data, bankAccountId: data.pagamento?.bankAccountId }, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }

  if (!data.description.trim()) return { error: "Informe a descrição." };
  if (data.payerType === "OUTRO" && !data.payerName?.trim()) return { error: "Informe o nome do pagador." };

  // Regra do dono do produto: parcelado e já recebido são mutuamente exclusivos — a UI já
  // desabilita um quando o outro está marcado, mas o Server Action nunca confia só nisso.
  const parcelado = data.parcelado;
  const recebido = data.recebido && !parcelado;

  const bases = await caseValueBases(data.caseId, officeId);
  const kind = data.natureza === "SUCUMBENCIAL" ? "HONORARIOS_SUCUMBENCIAIS" : "HONORARIOS_CONTRATUAIS";

  const cobrancaHasDinheiro = data.cobranca !== "PERCENTUAL";
  const cobrancaHasPercentual = data.cobranca !== "DINHEIRO";
  const dinheiroAmount = cobrancaHasDinheiro ? parseFloat(data.amount || "0") || 0 : 0;
  const discount = parseFloat(data.discount || "0") || 0;
  const surcharge = parseFloat(data.surcharge || "0") || 0;
  const noDueDate = data.noDueDate ?? false;
  const dueDate = noDueDate ? firstOfNextMonth() : new Date(data.dueDate || "");
  if (!noDueDate && isNaN(dueDate.getTime())) {
    return { error: 'Informe a data de vencimento, ou marque "Sem vencimento definido".' };
  }

  const shared = {
    officeId,
    kind,
    categoryId: data.categoryId || null,
    costCenterId: data.costCenterId || null,
    clientId: data.clientId || null,
    caseId: data.caseId,
  };
  const commonFields = {
    documentType: data.documentType || null,
    documentNumber: data.documentNumber || null,
    issueDate: data.issueDate ? new Date(data.issueDate) : null,
    responsibleId: data.responsibleId || null,
    payerType: data.payerType,
    payerName: data.payerType === "OUTRO" ? data.payerName || null : null,
  };

  // Header (HonorarioLancamento) só existe quando há parcelamento OU parte percentual — ver
  // nota no topo do arquivo. Um honorário único e simples em dinheiro vira Receivable solta.
  const needsHeader = parcelado || cobrancaHasPercentual;

  if (!needsHeader) {
    const receivable = await prisma.receivable.create({
      data: {
        ...shared,
        ...commonFields,
        description: data.description,
        amount: dinheiroAmount,
        discount,
        surcharge,
        dueDate,
        noDueDate,
        valueType: "FIXO",
      },
    });
    if (recebido && data.pagamento) {
      await registrarRecebimento(receivable.id, dinheiroAmount, discount, surcharge, data.pagamento, officeId);
    } else if (!noDueDate) {
      await createInstallmentReminder(officeId, "receber", data.description, dueDate, data.caseId);
    }
    revalidateFinance();
    revalidatePath(`/processos/${data.caseId}`);
    return {};
  }

  const lancamento = await prisma.honorarioLancamento.create({
    data: {
      ...shared,
      ...commonFields,
      valorTotalIndicado: parcelado && data.valorTotalIndicado ? parseFloat(data.valorTotalIndicado) : null,
    },
  });

  // Presente quando a parte em dinheiro vira UMA Receivable própria (cobrança DINHEIRO/AMBOS,
  // sem parcelamento) — usado só para não aplicar o mesmo desconto/acréscimo duas vezes (uma na
  // parcela de dinheiro, outra na percentual) quando as duas existem sob o mesmo cabeçalho.
  let dinheiroReceivableId: string | null = null;

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
          documentType: commonFields.documentType,
          documentNumber: commonFields.documentNumber,
          issueDate: commonFields.issueDate,
          responsibleId: commonFields.responsibleId,
          payerType: commonFields.payerType,
          payerName: commonFields.payerName,
          description,
          amount: rowAmount,
          dueDate: rowDueDate,
          groupId,
          installmentNumber: i + 1,
          installmentTotal: rows.length,
          installmentBoleto: row.installmentBoleto || null,
          valueType: "FIXO",
          vinculadoAoTotal: true,
          honorarioLancamentoId: lancamento.id,
          ...(row.pago ? { status: "PAGO", paidAmount: rowAmount, paidDate: rowDueDate } : {}),
        },
      });
      if (row.pago) {
        // Único caminho para lançamento retroativo parcelado: a parcela já quitada antes do
        // cadastro se marca na própria linha da tabela — sem data/conta/forma de pagamento
        // próprias (a tabela não tem esses campos por linha), então o FinancePayment nasce só
        // com valor e vencimento como data do pagamento (a melhor aproximação disponível aqui).
        await prisma.financePayment.create({
          data: {
            officeId,
            amount: rowAmount,
            paidDate: rowDueDate,
            documentNumber: row.installmentBoleto || null,
            receivableId: receivable.id,
          },
        });
      } else {
        await createInstallmentReminder(officeId, "receber", description, rowDueDate, data.caseId);
      }
    }
  } else if (cobrancaHasDinheiro) {
    const receivable = await prisma.receivable.create({
      data: {
        ...shared,
        ...commonFields,
        description: `${data.description} (dinheiro)`,
        amount: dinheiroAmount,
        discount,
        surcharge,
        dueDate,
        noDueDate,
        valueType: "FIXO",
        vinculadoAoTotal: true,
        honorarioLancamentoId: lancamento.id,
      },
    });
    dinheiroReceivableId = receivable.id;
    if (recebido && data.pagamento) {
      await registrarRecebimento(receivable.id, dinheiroAmount, discount, surcharge, data.pagamento, officeId);
    } else if (!noDueDate) {
      await createInstallmentReminder(officeId, "receber", `${data.description} (dinheiro)`, dueDate, data.caseId);
    }
  }

  if (cobrancaHasPercentual) {
    const percentual = parseFloat(data.percentual || "0") || 0;
    const baseValue = baseValueFor(data.percentualBase, bases);
    const abaterEntrada = !!data.abaterEntrada;
    // "Já pago em dinheiro" para o abatimento: soma das parcelas marcadas Pago quando o
    // lançamento é parcelado, senão o valor do campo "Valor em dinheiro" da seção Forma de
    // Cobrança — as duas são a mesma ideia (o que já entrou em caixa neste lançamento).
    const jaPagoEmDinheiro = parcelado
      ? (data.parcelas ?? []).filter((p) => p.pago).reduce((s, p) => s + (parseFloat(p.amount || "0") || 0), 0)
      : dinheiroAmount;
    // Desconto/acréscimo só recaem sobre a parcela percentual quando ela é a ÚNICA parcela deste
    // lançamento (senão já foram aplicados na parcela de dinheiro, acima) — evita contar o mesmo
    // ajuste duas vezes quando cobrança é "Dinheiro + Percentual".
    const percentualGetsAdjustments = !dinheiroReceivableId;

    if (baseValue) {
      const apurado = valorPercentualApurado({ percentual, base: baseValue, abaterEntrada, jaPagoEmDinheiro });
      const receivable = await prisma.receivable.create({
        data: {
          ...shared,
          ...commonFields,
          description: `${data.description} (percentual)`,
          amount: apurado,
          discount: percentualGetsAdjustments ? discount : 0,
          surcharge: percentualGetsAdjustments ? surcharge : 0,
          dueDate,
          noDueDate,
          valueType: "PERCENTUAL",
          percentual,
          percentualBase: data.percentualBase || null,
          abaterEntrada,
          isSuccessPortion: true,
          vinculadoAoTotal: false,
          honorarioLancamentoId: lancamento.id,
        },
      });
      if (recebido && data.pagamento && !dinheiroReceivableId) {
        await registrarRecebimento(
          receivable.id,
          apurado,
          percentualGetsAdjustments ? discount : 0,
          percentualGetsAdjustments ? surcharge : 0,
          data.pagamento,
          officeId
        );
      } else if (!noDueDate) {
        await createInstallmentReminder(officeId, "receber", `${data.description} (percentual)`, dueDate, data.caseId);
      }
    } else if (recebido && data.pagamento && !dinheiroReceivableId) {
      // A base ainda não tem valor cadastrado no processo, mas dinheiro de verdade já chegou
      // (o usuário marcou "Já foi recebido" e informou quanto) — o valor recebido vale mais que
      // a estimativa desconhecida, então esta parcela nasce PAGA com o valor informado, não como
      // provisão A_APURAR (que é só para quando ainda NADA foi recebido).
      const paidAmount = parseFloat(data.pagamento.paidAmount || "0") || 0;
      const receivable = await prisma.receivable.create({
        data: {
          ...shared,
          ...commonFields,
          description: `${data.description} (percentual)`,
          amount: paidAmount,
          dueDate,
          noDueDate,
          valueType: "PERCENTUAL",
          percentual,
          percentualBase: data.percentualBase || null,
          abaterEntrada,
          isSuccessPortion: true,
          vinculadoAoTotal: false,
          honorarioLancamentoId: lancamento.id,
        },
      });
      await registrarRecebimento(receivable.id, paidAmount, 0, 0, data.pagamento, officeId);
    } else {
      // Provisão a apurar: nasce com amount=0 e sem vencimento definido — fora do fluxo de caixa
      // e do DRE (ver lib/financeQuery.ts) até alguém registrar o desfecho do processo (apuração
      // do êxito, Fase 4).
      await prisma.receivable.create({
        data: {
          ...shared,
          ...commonFields,
          description: `${data.description} (percentual — a apurar)`,
          amount: 0,
          dueDate: firstOfNextMonth(),
          noDueDate: true,
          status: "A_APURAR",
          valueType: "PERCENTUAL",
          percentual,
          percentualBase: data.percentualBase || null,
          abaterEntrada,
          isSuccessPortion: true,
          vinculadoAoTotal: false,
          honorarioLancamentoId: lancamento.id,
        },
      });
    }
  }

  revalidateFinance();
  revalidatePath(`/processos/${data.caseId}`);
  return {};
}

export type ParcelaEdicao = {
  id?: string; // presente = parcela existente (recriada); ausente = nova parcela
  description: string;
  valueType: "FIXO" | "PERCENTUAL";
  amount?: string;
  percentual?: string;
  percentualBase?: string;
  installmentBoleto?: string;
  dueDate?: string;
  noDueDate?: boolean;
  isSuccessPortion?: boolean;
  vinculadoAoTotal: boolean;
};

// Edita TODAS as parcelas não pagas de um lançamento de uma vez (apagar todas e recriar — mesmo
// padrão de updateCase para CaseClient/CaseParty e de updateProtocoloLoteItens), preservando
// intactas as parcelas já PAGAS (registro financeiro definitivo, nunca apagado/recriado por uma
// edição posterior). valorTotalIndicado também pode ser corrigido aqui.
export async function updateHonorarioLancamentoParcelas(
  lancamentoId: string,
  data: { valorTotalIndicado?: string; parcelas: ParcelaEdicao[] }
): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const lancamento = await prisma.honorarioLancamento.findFirst({ where: { id: lancamentoId, officeId } });
  if (!lancamento) return { error: "Lançamento de honorários não encontrado." };

  const bases = await caseValueBases(lancamento.caseId, officeId);

  await prisma.$transaction(async (tx) => {
    await tx.receivable.deleteMany({
      where: { honorarioLancamentoId: lancamentoId, status: { not: "PAGO" } },
    });
    for (const p of data.parcelas) {
      const amount =
        p.valueType === "PERCENTUAL"
          ? (() => {
              const baseValue = baseValueFor(p.percentualBase, bases);
              if (!baseValue) return 0;
              return (baseValue * parseFloat(p.percentual || "0")) / 100;
            })()
          : parseFloat(p.amount || "0");
      const noDueDate = p.noDueDate ?? false;
      const status = p.valueType === "PERCENTUAL" && !baseValueFor(p.percentualBase, bases) ? "A_APURAR" : undefined;
      await tx.receivable.create({
        data: {
          officeId,
          caseId: lancamento.caseId,
          clientId: lancamento.clientId,
          categoryId: lancamento.categoryId,
          costCenterId: lancamento.costCenterId,
          kind: lancamento.kind,
          documentType: lancamento.documentType,
          documentNumber: lancamento.documentNumber,
          issueDate: lancamento.issueDate,
          responsibleId: lancamento.responsibleId,
          payerType: lancamento.payerType,
          payerName: lancamento.payerName,
          description: p.description,
          amount,
          dueDate: noDueDate ? new Date() : new Date(p.dueDate || ""),
          noDueDate,
          installmentBoleto: p.installmentBoleto || null,
          isSuccessPortion: p.isSuccessPortion ?? false,
          valueType: p.valueType,
          percentual: p.valueType === "PERCENTUAL" ? parseFloat(p.percentual || "0") : null,
          percentualBase: p.valueType === "PERCENTUAL" ? p.percentualBase || null : null,
          vinculadoAoTotal: p.vinculadoAoTotal,
          honorarioLancamentoId: lancamentoId,
          ...(status ? { status } : {}),
        },
      });
    }
    await tx.honorarioLancamento.update({
      where: { id: lancamentoId },
      data: { valorTotalIndicado: data.valorTotalIndicado ? parseFloat(data.valorTotalIndicado) : null },
    });
  });

  revalidateFinance();
  revalidatePath(`/processos/${lancamento.caseId}`);
  return {};
}
