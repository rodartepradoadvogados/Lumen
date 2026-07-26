"use server";

import { prisma } from "@/lib/prisma";
import { getPaymentStatus, markTenantInvoicePaidByAsaasPaymentId, isAsaasConfigured } from "@/lib/asaas";

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
