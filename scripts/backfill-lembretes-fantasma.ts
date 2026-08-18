import { prisma } from "../lib/prisma";

// Backfill do achado A26 da revisão gauntlet: antes do fix (syncReminderTask em
// lib/actions/financeiro.ts), pagar/baixar uma parcela não concluía o lembrete de vencimento
// (Task type=PRAZO, criado por createInstallmentReminder) vinculado a ela — o lembrete ficava
// PENDENTE para sempre, mesmo com a conta já paga, poluindo Agenda, Kanban, Central de Alertas e
// o e-mail diário. O fix já cobre toda baixa daqui pra frente (syncPayableStatus/
// syncReceivableStatus chamam syncReminderTask a cada recálculo de status); este script conclui
// os lembretes que ficaram "fantasma" de baixas feitas ANTES do fix existir.
//
// Não mexe em Task já CANCELADO (usuário descartou de propósito, mesma regra de
// syncReminderTask) nem em parcela excluída (Task.payableId/receivableId têm onDelete: Cascade
// no schema — a Task já é apagada junto da parcela, não sobra lembrete órfão desse tipo aqui).
// Rodar uma vez, contra o DATABASE_URL de produção: npx tsx scripts/backfill-lembretes-fantasma.ts
async function main() {
  const [payableTasks, receivableTasks] = await Promise.all([
    prisma.task.findMany({
      where: { type: "PRAZO", status: { notIn: ["CONCLUIDO", "CANCELADO"] }, payableId: { not: null }, payable: { status: "PAGO" } },
      select: { id: true, title: true, officeId: true },
    }),
    prisma.task.findMany({
      where: { type: "PRAZO", status: { notIn: ["CONCLUIDO", "CANCELADO"] }, receivableId: { not: null }, receivable: { status: "PAGO" } },
      select: { id: true, title: true, officeId: true },
    }),
  ]);

  const all = [...payableTasks, ...receivableTasks];
  for (const t of all) {
    console.log(`Concluindo lembrete fantasma: "${t.title}" (Task ${t.id}, escritório ${t.officeId})`);
  }

  if (all.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: all.map((t) => t.id) } },
      data: { status: "CONCLUIDO", completedAt: new Date() },
    });
  }

  console.log(
    `Lembretes fantasma encontrados: ${all.length} (${payableTasks.length} de contas a pagar, ${receivableTasks.length} de contas a receber). Todos marcados como CONCLUIDO.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
