import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAsaasWebhookToken, markTenantInvoicePaidByAsaasPaymentId } from "@/lib/asaas";

export const dynamic = "force-dynamic";

// ============================================================================
// Webhook de pagamentos da Asaas — LIMITE DE SEGURANÇA INEGOCIÁVEL: este é um dos únicos três
// caminhos autorizados a marcar uma fatura como paga (os outros são a reconciliação em
// lib/actions/billing.ts e a baixa manual em lib/actions/painelMestre.ts:markInvoicePaid).
// Nenhum sinal vindo do navegador do cliente pode fazer isso.
//
// Diferente de app/api/whatsapp/route.ts (o único outro webhook do projeto, que sempre
// responde 200 mesmo com assinatura ausente/inválida — aceitável pra mensagem, não pra
// pagamento), este endpoint é FAIL-CLOSED: token ausente ou incorreto → 401 sempre, nunca
// processa o evento. Isso é proposital: queremos que uma tentativa não autenticada apareça
// como falha nos logs da Asaas, não como sucesso silencioso.
// ============================================================================

export async function POST(request: NextRequest) {
  const token = request.headers.get("asaas-access-token");
  if (!verifyAsaasWebhookToken(token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: string;
  let payload: AsaasWebhookPayload;
  try {
    rawBody = await request.text();
    payload = JSON.parse(rawBody) as AsaasWebhookPayload;
  } catch (e) {
    console.error("[asaas webhook] payload ilegível:", e);
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const eventType = payload.event;
  const externalId = payload.payment?.id ?? payload.pixAutomaticoAuthorization?.id ?? payload.id;
  if (!eventType || !externalId) {
    console.error("[asaas webhook] payload autenticado mas sem event/id reconhecível:", rawBody.slice(0, 500));
    return NextResponse.json({ error: "missing event or id" }, { status: 400 });
  }

  // Idempotência: se este (provider, externalId, eventType) já foi processado, responde 200
  // sem reprocessar. O @@unique no schema garante isso mesmo sob corrida (o upsert abaixo é
  // seguro de chamar de novo; só o processedAt indica se já rodou a lógica de negócio).
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_externalId_eventType: { provider: "ASAAS", externalId, eventType } },
  });
  if (existing?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await prisma.paymentWebhookEvent.upsert({
    where: { provider_externalId_eventType: { provider: "ASAAS", externalId, eventType } },
    create: { provider: "ASAAS", eventType, externalId, signatureValid: true, rawPayload: payload as object },
    update: {},
  });

  try {
    await processEvent(eventType, payload);
  } catch (e) {
    // Erro ao processar a REGRA DE NEGÓCIO (ex.: fatura não encontrada não é erro — ver
    // processEvent — mas uma falha de banco, por exemplo, é). Não marca processedAt: a Asaas
    // reenvia o evento depois, e tentamos de novo. Loga como erro (diferente do caso "fatura
    // não encontrada", que é só aviso).
    console.error(`[asaas webhook] erro ao processar evento ${eventType} (${externalId}):`, e);
    return NextResponse.json({ error: "internal error processing event" }, { status: 500 });
  }

  await prisma.paymentWebhookEvent.update({
    where: { provider_externalId_eventType: { provider: "ASAAS", externalId, eventType } },
    data: { processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Forma parcial do payload de webhook da Asaas que nos interessa.
// ---------------------------------------------------------------------------
type AsaasWebhookPayload = {
  event?: string;
  id?: string;
  payment?: { id?: string; status?: string };
  pixAutomaticoAuthorization?: { id?: string; status?: string };
};

async function processEvent(eventType: string, payload: AsaasWebhookPayload): Promise<void> {
  if (eventType === "PAYMENT_RECEIVED" || eventType === "PAYMENT_CONFIRMED") {
    const asaasPaymentId = payload.payment?.id;
    if (!asaasPaymentId) return;
    const result = await markTenantInvoicePaidByAsaasPaymentId(asaasPaymentId, {
      externalStatus: payload.payment?.status ?? eventType,
      paidAt: new Date(),
    });
    if (!result.found) {
      // Pode ser um evento de teste do sandbox Asaas sem fatura real correspondente — aviso,
      // não erro (não deve fazer a Asaas reenviar indefinidamente).
      console.warn(`[asaas webhook] evento ${eventType} para asaasPaymentId ${asaasPaymentId} sem TenantInvoice correspondente.`);
    }
    return;
  }

  if (eventType === "PAYMENT_OVERDUE") {
    const asaasPaymentId = payload.payment?.id;
    if (!asaasPaymentId) return;
    const invoice = await prisma.tenantInvoice.findUnique({ where: { asaasPaymentId } });
    if (!invoice) {
      console.warn(`[asaas webhook] evento ${eventType} para asaasPaymentId ${asaasPaymentId} sem TenantInvoice correspondente.`);
      return;
    }
    // Só atualiza o status bruto de auditoria — NÃO decide bloqueio aqui (isso é Fase 2, um
    // cron separado; este webhook só registra o que a Asaas informou).
    await prisma.tenantInvoice.update({
      where: { id: invoice.id },
      data: { externalStatus: payload.payment?.status ?? eventType },
    });
    return;
  }

  if (eventType.startsWith("PIX_AUTOMATICO_AUTHORIZATION_")) {
    const authorizationId = payload.pixAutomaticoAuthorization?.id;
    if (!authorizationId) return;
    const subscription = await prisma.subscription.findFirst({ where: { pixAuthorizationId: authorizationId } });
    if (!subscription) {
      console.warn(`[asaas webhook] evento ${eventType} para pixAuthorizationId ${authorizationId} sem Subscription correspondente.`);
      return;
    }
    const status = payload.pixAutomaticoAuthorization?.status ?? eventType.replace("PIX_AUTOMATICO_AUTHORIZATION_", "");
    await prisma.subscription.update({ where: { id: subscription.id }, data: { pixAuthorizationStatus: status } });
    return;
  }

  // Outros eventos (ex.: PAYMENT_CREATED, PAYMENT_DELETED, PAYMENT_REFUNDED...): já ficaram
  // registrados em PaymentWebhookEvent acima, sem ação adicional — não há regra de negócio
  // definida pra eles nesta fase.
}
