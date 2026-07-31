"use server";

// Lançamento de honorários parcelado na aba Financeiro do Processo — entrada em dinheiro +
// restante no êxito (dinheiro ou percentual sobre valor da causa/proveito econômico/condenação),
// com nota de divergência quando a soma das parcelas não bate com o valor total indicado na
// criação. Um honorário "único" (não parcelado) continua sendo uma Receivable solta, sem
// HonorarioLancamento — só passa por createReceivable (lib/actions/financeiro.ts), com os novos
// campos valueType/percentual/percentualBase quando for percentual.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  assertFinanceRelationsInOffice,
  createInstallmentReminder,
  requireFinanceOfficeId,
} from "@/lib/actions/financeiro";
import { estimatePercentualAmount } from "@/lib/honorarioLancamento";

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

async function caseValueBases(caseId: string, officeId: string) {
  const c = await prisma.case.findFirst({
    where: { id: caseId, officeId },
    select: { caseValue: true, economicBenefitValue: true, convictionValue: true },
  });
  if (!c) throw new Error("Processo não encontrado.");
  return c;
}

function firstOfNextMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

type ExitoInput =
  | { valueType: "FIXO"; amount: string; vinculadoAoTotal: boolean }
  | { valueType: "PERCENTUAL"; percentual: string; percentualBase: string; vinculadoAoTotal: boolean };

export async function createHonorarioLancamento(data: {
  description: string;
  kind: string;
  categoryId?: string;
  costCenterId?: string;
  clientId?: string;
  caseId: string;
  // "unico": uma única Receivable, dinheiro ou percentual, sem HonorarioLancamento.
  // "parcelado": HonorarioLancamento + entrada (dinheiro) + êxito (dinheiro ou percentual).
  modo: "unico" | "parcelado";
  valueType?: "FIXO" | "PERCENTUAL"; // modo "unico"
  amount?: string; // modo "unico", valueType FIXO
  dueDate?: string; // modo "unico", valueType FIXO
  percentual?: string; // modo "unico", valueType PERCENTUAL
  percentualBase?: string; // modo "unico", valueType PERCENTUAL
  valorTotalIndicado?: string; // modo "parcelado"
  entradaAmount?: string; // modo "parcelado"
  entradaDueDate?: string; // modo "parcelado"
  exito?: ExitoInput; // modo "parcelado"
}): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  try {
    await assertFinanceRelationsInOffice(data, officeId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dados inválidos." };
  }

  const shared = {
    officeId,
    kind: data.kind,
    categoryId: data.categoryId || null,
    costCenterId: data.costCenterId || null,
    clientId: data.clientId || null,
    caseId: data.caseId,
  };

  if (data.modo === "unico") {
    if (data.valueType === "PERCENTUAL") {
      const percentual = parseFloat(data.percentual || "0");
      const bases = await caseValueBases(data.caseId, officeId);
      await prisma.receivable.create({
        data: {
          ...shared,
          description: data.description,
          amount: estimatePercentualAmount(percentual, data.percentualBase, bases),
          dueDate: data.dueDate ? new Date(data.dueDate) : firstOfNextMonth(),
          noDueDate: !data.dueDate,
          valueType: "PERCENTUAL",
          percentual,
          percentualBase: data.percentualBase || null,
        },
      });
    } else {
      await prisma.receivable.create({
        data: {
          ...shared,
          description: data.description,
          amount: parseFloat(data.amount || "0"),
          dueDate: data.dueDate ? new Date(data.dueDate) : firstOfNextMonth(),
          noDueDate: !data.dueDate,
          valueType: "FIXO",
        },
      });
    }
  } else {
    if (!data.exito) return { error: "Informe a condição do êxito." };
    const bases = await caseValueBases(data.caseId, officeId);
    const exitoAmount =
      data.exito.valueType === "PERCENTUAL"
        ? estimatePercentualAmount(parseFloat(data.exito.percentual || "0"), data.exito.percentualBase, bases)
        : parseFloat(data.exito.amount || "0");

    const lancamento = await prisma.honorarioLancamento.create({
      data: {
        officeId,
        caseId: data.caseId,
        clientId: data.clientId || null,
        categoryId: data.categoryId || null,
        costCenterId: data.costCenterId || null,
        kind: data.kind,
        valorTotalIndicado: data.valorTotalIndicado ? parseFloat(data.valorTotalIndicado) : null,
      },
    });

    const entradaDescription = `${data.description} (entrada)`;
    const entradaDueDate = new Date(data.entradaDueDate || "");
    await prisma.receivable.create({
      data: {
        ...shared,
        description: entradaDescription,
        amount: parseFloat(data.entradaAmount || "0"),
        dueDate: entradaDueDate,
        valueType: "FIXO",
        vinculadoAoTotal: true,
        honorarioLancamentoId: lancamento.id,
      },
    });
    await createInstallmentReminder(officeId, "receber", entradaDescription, entradaDueDate, data.caseId);

    await prisma.receivable.create({
      data: {
        ...shared,
        description: `${data.description} (êxito)`,
        amount: exitoAmount,
        dueDate: firstOfNextMonth(),
        noDueDate: true,
        isSuccessPortion: true,
        valueType: data.exito.valueType,
        percentual: data.exito.valueType === "PERCENTUAL" ? parseFloat(data.exito.percentual || "0") : null,
        percentualBase: data.exito.valueType === "PERCENTUAL" ? data.exito.percentualBase || null : null,
        vinculadoAoTotal: data.exito.vinculadoAoTotal,
        honorarioLancamentoId: lancamento.id,
      },
    });
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
        p.valueType === "PERCENTUAL" ? estimatePercentualAmount(parseFloat(p.percentual || "0"), p.percentualBase, bases) : parseFloat(p.amount || "0");
      const noDueDate = p.noDueDate ?? false;
      await tx.receivable.create({
        data: {
          officeId,
          caseId: lancamento.caseId,
          clientId: lancamento.clientId,
          categoryId: lancamento.categoryId,
          costCenterId: lancamento.costCenterId,
          kind: lancamento.kind,
          description: p.description,
          amount,
          dueDate: noDueDate ? new Date() : new Date(p.dueDate || ""),
          noDueDate,
          isSuccessPortion: p.isSuccessPortion ?? false,
          valueType: p.valueType,
          percentual: p.valueType === "PERCENTUAL" ? parseFloat(p.percentual || "0") : null,
          percentualBase: p.valueType === "PERCENTUAL" ? p.percentualBase || null : null,
          vinculadoAoTotal: p.vinculadoAoTotal,
          honorarioLancamentoId: lancamentoId,
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
