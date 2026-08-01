"use server";

// Apuração do êxito (Fase 4) — transforma uma parcela percentual A_APURAR (nascida em
// lib/actions/honorarioLancamento.ts com amount=0, sem vencimento, porque a base do processo
// ainda não era conhecida) em dinheiro de verdade, no desfecho do processo. Ver
// components/honorarios/ApurarHonorarioModal.tsx para a tela e as três portas de entrada
// (automática por publicação em lib/alerts.ts, botão manual na aba Financeiro do Processo, e o
// aviso ao arquivar em CaseStatusSelect.tsx).
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { requireFinanceOfficeId } from "@/lib/actions/financeiro";
import { isCaseInOffice } from "@/lib/officeScope";
import { valorPercentualApurado } from "@/lib/financeCalc";

// Mesmo catálogo de bases de lib/honorarioLancamento.ts:PERCENTUAL_BASE_LABELS, aqui como o campo
// do Case que cada uma grava quando apurada.
const CASE_FIELD_BY_BASE: Record<string, "caseValue" | "economicBenefitValue" | "convictionValue" | "agreementValue"> = {
  VALOR_CAUSA: "caseValue",
  PROVEITO_ECONOMICO: "economicBenefitValue",
  CONDENACAO: "convictionValue",
  ACORDO: "agreementValue",
};

const DESFECHO_LABELS: Record<string, string> = {
  SENTENCA_PROCEDENTE: "Sentença procedente",
  ACORDAO: "Acórdão",
  ACORDO: "Acordo",
  IMPROCEDENTE: "Improcedente (sem êxito)",
};

function revalidateApuracao(caseId: string) {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receitas");
  revalidatePath("/financeiro/fluxo-de-caixa");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath("/agenda");
  revalidatePath("/kanban");
  revalidatePath(`/processos/${caseId}`);
}

// "Já pago em dinheiro" deste HonorarioLancamento no momento da apuração — usado só quando a
// parcela tem abaterEntrada=true (ver lib/financeCalc.ts:valorPercentualApurado). Diferente do
// cálculo feito na criação (que usava só o que já se sabia ali na hora): aqui, meses/anos depois,
// a fonte da verdade é a soma real de FinancePayment das parcelas FIXO do mesmo cabeçalho — mais
// precisa que reconstruir a partir do formulário original.
async function jaPagoEmDinheiroDoLancamento(honorarioLancamentoId: string): Promise<number> {
  const fixos = await prisma.receivable.findMany({
    where: { honorarioLancamentoId, valueType: "FIXO" },
    include: { payments: true },
  });
  return fixos.reduce((s, r) => s + r.payments.reduce((s2, p) => s2 + p.amount, 0), 0);
}

export type ApurarHonorarioInput = {
  caseId: string;
  percentualBase: string; // VALOR_CAUSA | PROVEITO_ECONOMICO | CONDENACAO | ACORDO
  desfecho: "SENTENCA_PROCEDENTE" | "ACORDAO" | "ACORDO" | "IMPROCEDENTE";
  valorApurado?: string; // dispensado quando desfecho é IMPROCEDENTE
  decisionDate: string;
  transitoDate: string; // presumida (addDiasUteis) ou informada à mão — decidido na tela
  transitoPresumido: boolean;
};

// Converte a(s) parcela(s) A_APURAR de uma base do processo em receita real (desfechos com
// êxito) ou as encerra sem gerar receita (Improcedente) — nunca as duas coisas parcialmente:
// olha SEMPRE todas as parcelas A_APURAR daquela base+processo, não uma única linha, porque mais
// de um HonorarioLancamento pode ter gerado provisão sobre a mesma base (ex.: contratual e
// sucumbencial, os dois sobre CONDENACAO).
export async function apurarHonorario(data: ApurarHonorarioInput): Promise<{ error?: string }> {
  const officeId = await requireFinanceOfficeId();
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!(await isCaseInOffice(data.caseId, officeId))) return { error: "Processo não encontrado." };

  const kase = await prisma.case.findFirst({ where: { id: data.caseId, officeId }, select: { id: true, title: true } });
  if (!kase) return { error: "Processo não encontrado." };

  const pendentes = await prisma.receivable.findMany({
    where: { caseId: data.caseId, officeId, status: "A_APURAR", percentualBase: data.percentualBase },
  });
  if (pendentes.length === 0) return { error: "Não há parcela a apurar para esta base neste processo." };

  const decisionDate = new Date(`${data.decisionDate}T00:00:00Z`);
  if (isNaN(decisionDate.getTime())) return { error: "Informe a data da decisão." };

  // Improcedente: não gera receita, nunca apaga a linha — só encerra (CANCELADO) e registra o
  // motivo no cabeçalho (HonorarioLancamento.encerradoEm/encerradoMotivo), preservando o
  // protocolo/histórico financeiro para consulta futura.
  if (data.desfecho === "IMPROCEDENTE") {
    const lancamentoIds = Array.from(new Set(pendentes.map((p) => p.honorarioLancamentoId).filter((id): id is string => Boolean(id))));
    const motivo = `Improcedente — sem êxito (desfecho registrado em ${data.decisionDate} por ${user.name}).`;
    await prisma.$transaction([
      prisma.receivable.updateMany({
        where: { id: { in: pendentes.map((p) => p.id) } },
        data: { status: "CANCELADO" },
      }),
      ...lancamentoIds.map((id) =>
        prisma.honorarioLancamento.update({ where: { id }, data: { encerradoEm: new Date(), encerradoMotivo: motivo } })
      ),
    ]);
    revalidateApuracao(data.caseId);
    return {};
  }

  const transitoDate = new Date(`${data.transitoDate}T00:00:00Z`);
  if (isNaN(transitoDate.getTime())) return { error: "Informe a data do trânsito em julgado." };
  const valorApurado = parseFloat(data.valorApurado || "0") || 0;
  if (valorApurado <= 0) return { error: "Informe o valor apurado." };

  const campo = CASE_FIELD_BY_BASE[data.percentualBase];
  if (!campo) return { error: "Base de cálculo inválida." };

  // Grava a base apurada no processo — é a MESMA base que qualquer outra parcela percentual
  // deste processo (já existente ou lançada no futuro) vai usar (ver
  // lib/honorarioLancamento.ts:baseValueFor).
  await prisma.case.update({ where: { id: data.caseId }, data: { [campo]: valorApurado } });

  for (const p of pendentes) {
    const jaPago = p.honorarioLancamentoId ? await jaPagoEmDinheiroDoLancamento(p.honorarioLancamentoId) : 0;
    const apurado = valorPercentualApurado({
      percentual: p.percentual ?? 0,
      base: valorApurado,
      abaterEntrada: p.abaterEntrada,
      jaPagoEmDinheiro: jaPago,
    });
    await prisma.receivable.update({
      where: { id: p.id },
      data: {
        amount: apurado,
        status: "PENDENTE",
        dueDate: transitoDate,
        noDueDate: false,
        description: p.description.replace(" — a apurar)", ")"),
        apuradoEm: new Date(),
        apuradoPorId: user.id,
      },
    });
  }

  // Tarefa de conferência — a data do trânsito (presumida ou informada) nunca é tratada como
  // definitiva sozinha; fica registrado na própria tarefa que ela pode ser presumida (ver
  // components/honorarios/ApurarHonorarioModal.tsx), para quem for confirmar saber que precisa
  // checar a intimação/certidão antes de dar como certa.
  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId }, orderBy: { order: "asc" } });
  await prisma.task.create({
    data: {
      officeId,
      title: `Conferir trânsito em julgado — ${kase.title}`,
      type: "PRAZO",
      dueDate: transitoDate,
      priority: "MEDIA",
      caseId: data.caseId,
      columnId: firstColumn?.id,
      description: data.transitoPresumido
        ? `Data PRESUMIDA (15 dias úteis a partir da decisão de ${data.decisionDate} — ${DESFECHO_LABELS[data.desfecho]}). Confirmar a intimação/certidão de trânsito antes de tratar como definitiva.`
        : `Data informada manualmente a partir da decisão de ${data.decisionDate} (${DESFECHO_LABELS[data.desfecho]}).`,
    },
  });

  revalidateApuracao(data.caseId);
  return {};
}
