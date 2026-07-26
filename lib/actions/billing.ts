"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPaymentStatus, markTenantInvoicePaidByAsaasPaymentId, isAsaasConfigured } from "@/lib/asaas";
import { sendPaymentReminderEmail, sendOverdueReminderEmail, sendOfficeSuspendedEmail } from "@/lib/email";

// Dias antes do vencimento em que o lembrete "ANTES_VENCIMENTO" é disparado (ver
// runBillingCycle abaixo). O prazo de carência após o vencimento (até o bloqueio automático)
// já é por escritório — ver Office.paymentGraceDays — então não vira constante aqui.
const REMINDER_DAYS_BEFORE_DUE = 3;

// ============================================================================
// Reconciliação de faturas Asaas — rede de segurança contra webhook perdido (a Asaas garante
// reenvio, mas nada é 100%: instabilidade de rede, deploy no meio do caminho, etc.). NUNCA
// confia em nada vindo de fora: só consulta a API da Asaas com a NOSSA chave de API secreta
// (ver lib/asaas.ts:getPaymentStatus) e reaproveita a MESMA função de "marcar paga + reativar
// escritório" usada pelo webhook (lib/asaas.ts:markTenantInvoicePaidByAsaasPaymentId), pra não
// duplicar a regra em dois lugares.
//
// Chamada pelo cron da Fase 2 (ainda não implementado nesta entrega) — aqui só a função em si,
// sem nenhum agendamento ligado a ela ainda.
// ============================================================================

export type ReconcileResult = { checked: number; updated: number };

export async function reconcilePendingInvoices(): Promise<ReconcileResult> {
  if (!isAsaasConfigured()) return { checked: 0, updated: 0 };

  const pendentes = await prisma.tenantInvoice.findMany({
    where: { status: "PENDENTE", asaasPaymentId: { not: null } },
  });

  let updated = 0;
  for (const inv of pendentes) {
    if (!inv.asaasPaymentId) continue; // guarda de tipo — o where já filtra, mas TS não sabe
    try {
      const status = await getPaymentStatus(inv.asaasPaymentId);
      if (status.status === "RECEIVED" || status.status === "CONFIRMED") {
        const result = await markTenantInvoicePaidByAsaasPaymentId(inv.asaasPaymentId, {
          externalStatus: status.status,
          paidAt: status.paidAt ? new Date(status.paidAt) : new Date(),
        });
        if (result.found && !result.alreadyPaid) updated++;
      }
    } catch (e) {
      // Uma falha ao consultar uma fatura (ex.: Asaas fora do ar) não deve interromper a
      // reconciliação das demais — loga e segue.
      console.error(`[billing] falha ao reconciliar TenantInvoice ${inv.id} (asaasPaymentId ${inv.asaasPaymentId}):`, e);
    }
  }

  return { checked: pendentes.length, updated };
}

// ============================================================================
// Ciclo diário de cobrança (Fase 2) — chamado pelo cron em app/api/cron/billing/route.ts.
// Nessa ordem: (1) reconcilia via Asaas (rede de segurança contra webhook perdido), (2) manda
// lembrete 3 dias antes do vencimento, (3) manda lembrete de fatura vencida avisando quantos
// dias faltam até o bloqueio, (4) suspende o escritório que estourou o prazo de carência
// (Office.paymentGraceDays) e ainda está PENDENTE. remindersSent em cada TenantInvoice evita
// reenviar o mesmo e-mail em toda rodada do cron.
// ============================================================================

export type BillingCycleResult = {
  reconciled: ReconcileResult;
  remindersAntesVencimento: number;
  remindersVencida: number;
  suspended: number;
  errors: string[];
};

export async function runBillingCycle(): Promise<BillingCycleResult> {
  const reconciled = await reconcilePendingInvoices();

  const errors: string[] = [];
  let remindersAntesVencimento = 0;
  let remindersVencida = 0;
  let suspended = 0;

  const pendentes = await prisma.tenantInvoice.findMany({
    where: { status: "PENDENTE" },
    include: { office: { include: { subscription: true } } },
  });

  const agora = new Date();

  for (const inv of pendentes) {
    try {
      const office = inv.office;
      const remindersSent = inv.remindersSent;
      // diasParaVencer > 0: ainda não venceu. === 0 ou negativo: já venceu (dia do vencimento
      // ou depois). Ver regras de cada lembrete abaixo.
      const diasParaVencer = Math.floor((inv.dueDate.getTime() - agora.getTime()) / 86400000);
      const emailOpts = {
        pixPayload: inv.pixQrCodePayload,
        pixImage: inv.pixQrCodeImage,
        boletoUrl: inv.boletoUrl,
      };

      // Lembrete "antes do vencimento" — dispara em diasParaVencer === 3 OU qualquer ponto
      // anterior a isso (cron perdeu uma execução, por exemplo), desde que ainda não tenha
      // vencido e o lembrete ainda não tenha sido enviado para esta fatura.
      if (diasParaVencer > 0 && diasParaVencer <= REMINDER_DAYS_BEFORE_DUE && !remindersSent.includes("ANTES_VENCIMENTO")) {
        if (office.billingEmail) {
          const result = await sendPaymentReminderEmail(office.billingEmail, office.name, inv.amount, inv.dueDate, emailOpts);
          if (result.sent) {
            await prisma.tenantInvoice.update({
              where: { id: inv.id },
              data: { remindersSent: { push: "ANTES_VENCIMENTO" } },
            });
            remindersAntesVencimento++;
          }
        } else {
          errors.push(`TenantInvoice ${inv.id}: escritório "${office.name}" sem billingEmail, lembrete ANTES_VENCIMENTO não enviado.`);
        }
      }

      // Lembrete "vencida" — a partir do próprio dia do vencimento, enquanto a fatura ainda
      // estiver PENDENTE. graceDaysLeft pode ser 0 ou negativo se já passou do dia de
      // vencimento por mais dias do que a carência — tratado como "hoje é o dia" no e-mail
      // (ver lib/email.ts:sendOverdueReminderEmail).
      if (diasParaVencer <= 0 && !remindersSent.includes("VENCIDA")) {
        const graceDaysLeft = office.paymentGraceDays + diasParaVencer;
        if (office.billingEmail) {
          const result = await sendOverdueReminderEmail(office.billingEmail, office.name, inv.amount, inv.dueDate, graceDaysLeft, emailOpts);
          if (result.sent) {
            await prisma.tenantInvoice.update({
              where: { id: inv.id },
              data: { remindersSent: { push: "VENCIDA" } },
            });
            remindersVencida++;
          }
        } else {
          errors.push(`TenantInvoice ${inv.id}: escritório "${office.name}" sem billingEmail, lembrete VENCIDA não enviado.`);
        }
      }

      // Bloqueio automático — passou do prazo de carência (Office.paymentGraceDays) contado a
      // partir do vencimento, escritório ainda ATIVA e não é o escritório interno.
      if (
        diasParaVencer <= -office.paymentGraceDays &&
        office.status === "ATIVA" &&
        office.isInternal === false &&
        !remindersSent.includes("SUSPENSAO")
      ) {
        // Defesa em profundidade: repete a MESMA guarda de
        // lib/actions/painelMestre.ts:setOfficeAccess — reconsulta o campo isInternal direto
        // do banco (não confia só no office já carregado acima) antes de suspender. O
        // escritório interno (Rodarte Prado) nunca pode ficar SUSPENSA.
        const officeCheck = await prisma.office.findUnique({ where: { id: office.id }, select: { isInternal: true } });
        if (officeCheck?.isInternal) {
          errors.push(`TenantInvoice ${inv.id}: escritório "${office.name}" marcado como interno na defesa em profundidade — suspensão abortada.`);
        } else {
          await prisma.office.update({ where: { id: office.id }, data: { status: "SUSPENSA" } });
          suspended++;
          if (office.billingEmail) {
            await sendOfficeSuspendedEmail(office.billingEmail, office.name);
          }
        }
        // Marca SUSPENSAO independente do e-mail ter sido enviado ou não — o bloqueio em si é
        // o que importa, o e-mail é best-effort.
        await prisma.tenantInvoice.update({
          where: { id: inv.id },
          data: { remindersSent: { push: "SUSPENSAO" } },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      errors.push(`TenantInvoice ${inv.id}: ${message}`);
      console.error(`[billing] falha ao processar TenantInvoice ${inv.id} no ciclo de cobrança:`, e);
    }
  }

  if (suspended > 0) {
    revalidatePath("/painel-mestre");
  }

  return { reconciled, remindersAntesVencimento, remindersVencida, suspended, errors };
}
