// Motor de materialização de RecurringFee (honorário até o arquivamento) e RecurringExpense
// (despesa recorrente sem data de fim) — gera os próximos RECURRING_FEE_MONTHS_AHEAD meses em
// Receivable/Payable. Chamado de dois lugares: os crons diários (app/api/cron/recurring-fees e
// recurring-expenses/route.ts, sem officeId — varrem a plataforma inteira de propósito, atrás do
// CRON_SECRET) e lib/actions/financeiro.ts (createRecurringFee/createRecurringExpense, com o
// officeId do usuário logado, pra materializar na hora em vez de esperar o cron do dia seguinte).
//
// SEGURANÇA (achado V10, auditoria de 05/09/2026): as duas funções abaixo viviam dentro de
// lib/actions/financeiro.ts, um arquivo "use server" — lá, TODO export async vira um Server
// Action com endpoint HTTP próprio, chamável diretamente por qualquer requisição que descubra o
// id da action, mesmo sem nenhum import client-side (o Next não sabe, só pela definição do
// arquivo, que a intenção era "só uso interno"). officeId opcional e sem checagem de sessão
// dentro da própria função — createRecurringFee/createRecurringExpense já validam o officeId via
// requireFinanceOfficeId() antes de chamar, e o cron já valida CRON_SECRET antes, mas nenhuma das
// duas checagens estava DENTRO da função em si, então uma chamada direta ao Server Action (sem
// passar por nenhum dos dois caminhos legítimos) rodava sem nenhuma autorização — sem officeId,
// materializando/desativando a plataforma inteira; com um officeId arbitrário, mexendo nos dados
// de outro escritório. Mover para este módulo comum (sem "use server") fecha essa superfície por
// completo: a função deixa de existir como endpoint HTTP e só pode ser chamada por outro código
// do servidor que já a importa por nome.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const RECURRING_FEE_MONTHS_AHEAD = 4;

function competenciaFor(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// min(dueDay, últimoDiaDoMês) — evita "31 de fevereiro" virar 3 de março sozinho, que é o que
// Date faz por padrão quando o dia não existe naquele mês.
function dueDateFor(year: number, month0: number, dueDay: number): Date {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return new Date(year, month0, Math.min(dueDay, daysInMonth));
}

// Cópia local da lista de revalidatePath do Financeiro (mesmo padrão já usado por
// lib/actions/honorarioLancamento.ts) — evita um import cruzado com lib/actions/financeiro.ts sem
// necessidade real (as duas únicas razões seriam esta lista e payablePayeeDisplayName abaixo).
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

async function supplierDisplayName(supplierId: string | undefined, officeId: string): Promise<string | null> {
  if (!supplierId) return null;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, officeId }, select: { name: true } });
  return supplier?.name ?? null;
}

// Cópia local de lib/actions/financeiro.ts:payablePayeeDisplayName (mesmo raciocínio do
// revalidateFinance acima).
async function payablePayeeDisplayName(
  supplierId: string | undefined,
  payeeUserId: string | undefined,
  officeId: string,
  payeeClientId?: string
): Promise<string | null> {
  if (payeeUserId) {
    const user = await prisma.user.findFirst({ where: { id: payeeUserId, officeId }, select: { name: true } });
    return user?.name ?? null;
  }
  if (payeeClientId) {
    const client = await prisma.client.findFirst({ where: { id: payeeClientId, officeId }, select: { name: true } });
    return client?.name ?? null;
  }
  return supplierDisplayName(supplierId, officeId);
}

// Roda diariamente via cron (app/api/cron/recurring-fees/route.ts), sem argumento — varre a
// plataforma inteira de propósito. officeId é passado só pelo caminho de requisição do usuário
// (createRecurringFee, lib/actions/financeiro.ts), pra não repetir o trabalho (e as ESCRITAS de
// desativação abaixo) de todo escritório da plataforma dentro do clique de um único usuário.
// Idempotente: a constraint única (recurringFeeId, competencia) em Receivable garante que rodar
// todo dia em vez de só no dia 1 não duplica nada. Também é quem desliga sozinho um RecurringFee
// cujo processo já foi arquivado, sem precisar de nenhum hook em updateCaseStatus.
export async function ensureRecurringFeeReceivables(officeId?: string): Promise<{ created: number; deactivated: number; failed: number }> {
  const now = new Date();
  const fees = await prisma.recurringFee.findMany({
    where: { active: true, ...(officeId ? { officeId } : {}) },
    include: { case: { select: { status: true, clientId: true } } },
  });

  let created = 0;
  let deactivated = 0;
  let failed = 0;
  // try/catch por item (mesmo padrão de lib/driveSync.ts:syncAllOfficesDrive) — sem isso, uma
  // exceção num único RecurringFee (FK de categoria/centro de custo já removida, timeout de
  // conexão no meio da lista) propagava e travava a geração de TODOS os escritórios seguintes
  // na ordem do findMany, todo dia, até alguém notar (achado A75 da revisão gauntlet).
  for (const fee of fees) {
    try {
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
    } catch (e) {
      failed++;
      console.error(`[recurring-fees] falha ao gerar receivable do RecurringFee ${fee.id} (escritório ${fee.officeId}):`, e);
    }
  }

  revalidateFinance();
  return { created, deactivated, failed };
}

// Roda diariamente via cron (app/api/cron/recurring-expenses/route.ts), sem argumento — varre a
// plataforma inteira de propósito. officeId só é passado pelo caminho de requisição do usuário
// (createRecurringExpense, lib/actions/financeiro.ts) — idempotente, mesma constraint única
// (recurringExpenseId, competencia) em Payable que RecurringFee usa do lado das Receivable.
// Diferente de ensureRecurringFeeReceivables: NUNCA desativa sozinha (não existe processo pra
// arquivar aqui) — só para quando o usuário encerra manualmente.
export async function ensureRecurringExpensePayables(officeId?: string): Promise<{ created: number; failed: number }> {
  const now = new Date();
  const expenses = await prisma.recurringExpense.findMany({ where: { active: true, ...(officeId ? { officeId } : {}) } });

  let created = 0;
  let failed = 0;
  // try/catch por item — mesmo raciocínio de ensureRecurringFeeReceivables acima (achado A75):
  // uma despesa recorrente com dado ruim não pode travar a geração das despesas de todos os
  // outros escritórios que vêm depois dela na lista.
  for (const expense of expenses) {
    try {
      const supplierName = await payablePayeeDisplayName(expense.supplierId ?? undefined, expense.payeeUserId ?? undefined, expense.officeId, expense.payeeClientId ?? undefined);
      for (let i = 0; i < RECURRING_FEE_MONTHS_AHEAD; i++) {
        const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = target.getFullYear();
        const month0 = target.getMonth();
        const competencia = competenciaFor(year, month0);
        const exists = await prisma.payable.findUnique({
          where: { recurringExpenseId_competencia: { recurringExpenseId: expense.id, competencia } },
        });
        if (exists) continue;

        const dueDate = dueDateFor(year, month0, expense.dueDay);
        const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        await prisma.payable.create({
          data: {
            officeId: expense.officeId,
            description: `${expense.description} — ${monthLabel}`,
            amount: expense.amount,
            dueDate,
            categoryId: expense.categoryId,
            costCenterId: expense.costCenterId,
            supplierId: expense.supplierId,
            payeeUserId: expense.payeeUserId,
            payeeClientId: expense.payeeClientId,
            supplier: supplierName,
            recurringExpenseId: expense.id,
            competencia,
          },
        });
        created++;
      }
    } catch (e) {
      failed++;
      console.error(`[recurring-expenses] falha ao gerar payable do RecurringExpense ${expense.id} (escritório ${expense.officeId}):`, e);
    }
  }

  revalidateFinance();
  return { created, failed };
}
