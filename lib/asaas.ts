import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ============================================================================
// Integração com a Asaas (cobrança: Pix Automático, Pix QR Code dinâmico, boleto) —
// "env-gated" como BTG/WhatsApp/Microsoft: dormente e inofensivo enquanto ASAAS_API_KEY não
// estiver cadastrada. Diferente do BTG/Google/Microsoft, a Asaas NÃO usa OAuth — autentica
// com uma chave de API estática enviada no header `access_token` em toda chamada. Ver
// https://docs.asaas.com/reference/visao-geral (autenticação) e
// https://docs.asaas.com/docs/pix-automatico (fluxo de autorização).
//
// LIMITE DE SEGURANÇA INEGOCIÁVEL (não repetir aqui o erro de lib/whatsapp.ts):
// nenhuma fatura pode ser marcada como paga por um sinal vindo do navegador do cliente. Os
// únicos caminhos válidos são (a) o webhook autenticado (app/api/asaas/webhook/route.ts),
// processando um evento real da Asaas, (b) a função de reconciliação
// (lib/actions/billing.ts:reconcilePendingInvoices), que consulta a API da Asaas com a NOSSA
// chave secreta, nunca confiando em nada vindo de fora, ou (c) a baixa manual já existente
// (lib/actions/painelMestre.ts:markInvoicePaid, gated por requirePlatformOwner). Por isso
// verifyAsaasWebhookToken abaixo é FAIL-CLOSED: sem token configurado, rejeita sempre —
// exatamente o oposto de lib/whatsapp.ts:verifySignature (que pula a validação e aceita tudo
// quando WHATSAPP_APP_SECRET não está setado — aceitável pra mensagem, inaceitável pra
// pagamento).
// ============================================================================

const API_BASE = () =>
  process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

async function asaasFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  if (!process.env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY não configurada — integração Asaas está dormente.");
  }
  const res = await fetch(`${API_BASE()}${path}`, {
    ...init,
    headers: {
      access_token: process.env.ASAAS_API_KEY,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asaas recusou a chamada ${path} (HTTP ${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Customer (todo pagador precisa de um "customer" cadastrado na Asaas antes de
// qualquer cobrança/autorização)
// ---------------------------------------------------------------------------

type AsaasCustomerResponse = { id: string };

// Shape do escritório usado em toda chamada à Asaas — cnpj é opcional no tipo porque nem todo
// escritório tem cadastrado ainda, mas a Asaas RECUSA criar cobrança (boleto/Pix QR Code) sem
// CPF/CNPJ no customer, mesmo que o customer já exista sem esse dado.
type OfficeForAsaas = { id: string; name: string; billingEmail: string; cnpj?: string | null };

/**
 * Devolve o asaasCustomerId já salvo na Subscription deste escritório, criando o customer na
 * Asaas (e persistindo) se ainda não existir. Exige que já exista uma linha `Subscription`
 * para o escritório (é lá que o id é persistido) — chamar isso pra um escritório sem
 * Subscription ainda cadastrada é erro de uso do chamador, não algo pra silenciar.
 *
 * Se o customer já existia (id em cache) e agora temos um cnpj que ele não tinha antes,
 * atualiza o customer na Asaas em vez de só devolver o id — necessário pra escritórios cujo
 * customer foi criado antes do CNPJ ser cadastrado no Lúmen (a Asaas não completa isso sozinha).
 */
export async function getOrCreateAsaasCustomer(office: OfficeForAsaas): Promise<string> {
  const subscription = await prisma.subscription.findUnique({ where: { officeId: office.id } });
  if (!subscription) {
    throw new Error(`Escritório ${office.id} não tem Subscription cadastrada — não há onde persistir o asaasCustomerId.`);
  }

  if (subscription.asaasCustomerId) {
    if (office.cnpj) {
      await asaasFetch(`/customers/${subscription.asaasCustomerId}`, {
        method: "POST",
        body: JSON.stringify({ cpfCnpj: office.cnpj }),
      });
    }
    return subscription.asaasCustomerId;
  }

  const customer = await asaasFetch<AsaasCustomerResponse>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: office.name,
      email: office.billingEmail,
      externalReference: office.id,
      cpfCnpj: office.cnpj || undefined,
    }),
  });

  await prisma.subscription.update({ where: { officeId: office.id }, data: { asaasCustomerId: customer.id } });
  return customer.id;
}

// ---------------------------------------------------------------------------
// Pix Automático (débito recorrente autorizado uma vez — feature BACEN 16/06/2025)
// ---------------------------------------------------------------------------

type SubscriptionForAsaas = { id: string; officeId: string; monthlyFee: number; billingCycle: string; discountPercent?: number | null };

// Valor de fato cobrado por ciclo: SEMESTRAL cobra a mensalidade x 6 de uma vez, com o desconto
// (se houver) aplicado sobre o total; MENSAL cobra a mensalidade cheia. Único lugar que faz essa
// conta — a autorização de Pix Automático recorrente logo abaixo, o preview de teste
// (lib/actions/subscriptionBilling.ts:previewPixQrCode) e a geração de fatura
// (lib/actions/painelMestre.ts:generateAndSendInvoice) chamam esta função em vez de repetir a
// fórmula, para não voltarem a divergir entre si — era exatamente essa divergência (cada
// chamada lendo monthlyFee cru, sem olhar billingCycle/discountPercent) que fazia o ciclo
// SEMESTRAL cobrar 1/6 do valor certo, sem nunca aplicar o desconto prometido ao cliente.
export function calcularValorCobranca(subscription: { monthlyFee: number; billingCycle: string; discountPercent?: number | null }): number {
  if (subscription.billingCycle !== "SEMESTRAL") return subscription.monthlyFee;
  const bruto = subscription.monthlyFee * 6;
  const desconto = subscription.discountPercent ? bruto * (subscription.discountPercent / 100) : 0;
  return Math.round((bruto - desconto) * 100) / 100;
}

export type PixAutomaticoAuthorizationResult = {
  authorizationId: string;
  qrCode: string | null;
  qrCodeImage: string | null;
};

/**
 * Cria a autorização de Pix Automático (o cliente escaneia o QR Code/copia-e-cola devolvido
 * aqui uma única vez, no app do próprio banco, pra autorizar o débito recorrente).
 *
 * ATENÇÃO — endpoint/payload ainda NÃO confirmados de ponta a ponta contra a documentação
 * oficial (a página https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico
 * bloqueou acesso automatizado nas duas tentativas feitas nesta sessão — 403 — então só foi
 * possível confirmar por busca indireta, não pela doc completa). O que já foi confirmado, por
 * aparecer de forma consistente em três buscas independentes: os campos do corpo são
 * `customerId` (não `customer`) e `frequency` (não `cycle`), e existe um `contractId` opcional
 * pra correlacionar com nosso próprio registro (usamos o id da Subscription). O restante — nome
 * exato do campo de valor, formato da resposta (nome do campo do QR Code/imagem) — segue sendo
 * inferência a partir do padrão geral da API Asaas, mesmo padrão de honestidade já usado em
 * lib/btg.ts. PRECISA ser validado contra o Sandbox real antes de produção, ajustando conforme
 * o erro que a API devolver na primeira tentativa.
 */
export async function createPixAutomaticoAuthorization(
  subscription: SubscriptionForAsaas,
  office: OfficeForAsaas
): Promise<PixAutomaticoAuthorizationResult> {
  const asaasCustomerId = await getOrCreateAsaasCustomer(office);

  // "MONTHLY"/"SEMIANNUALLY" batem com os valores de ciclo já confirmados em
  // docs.asaas.com/docs/criando-uma-assinatura (WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/
  // SEMIANNUALLY/YEARLY) — não confirmado se `frequency` aqui usa exatamente esse mesmo
  // vocabulário (pode ser algo tipo "MONTHLY" mesmo, mas confira no Sandbox).
  const frequency = subscription.billingCycle === "SEMESTRAL" ? "SEMIANNUALLY" : "MONTHLY";

  const authorization = await asaasFetch<{
    id: string;
    pixQrCode?: { payload?: string; encodedImage?: string };
  }>("/pixAutomaticoAuthorizations", {
    method: "POST",
    body: JSON.stringify({
      customerId: asaasCustomerId,
      contractId: subscription.id,
      value: calcularValorCobranca(subscription),
      frequency,
      description: `Assinatura Lúmen — ${office.name}`,
    }),
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { pixAuthorizationId: authorization.id, pixAuthorizationStatus: "PENDENTE" },
  });

  return {
    authorizationId: authorization.id,
    qrCode: authorization.pixQrCode?.payload ?? null,
    qrCodeImage: authorization.pixQrCode?.encodedImage ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pix QR Code dinâmico (cobrança avulsa — semestral com desconto ou mensal alternativo)
// ---------------------------------------------------------------------------

export type ChargeInput = { value: number; dueDate: Date; description: string };

export type PixQrCodeChargeResult = {
  asaasPaymentId: string;
  qrCodePayload: string | null;
  qrCodeImage: string | null;
};

/**
 * Cria uma cobrança Pix avulsa (`POST /payments`, billingType PIX) e busca o QR Code dinâmico
 * dela (`GET /payments/{id}/pixQrCode`), conforme
 * https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix.
 */
export async function createPixQrCodeCharge(
  subscription: SubscriptionForAsaas,
  office: OfficeForAsaas,
  input: ChargeInput
): Promise<PixQrCodeChargeResult> {
  const asaasCustomerId = await getOrCreateAsaasCustomer(office);

  const payment = await asaasFetch<{ id: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: "PIX",
      value: input.value,
      dueDate: input.dueDate.toISOString().slice(0, 10),
      description: input.description,
    }),
  });

  const qrCode = await asaasFetch<{ payload?: string; encodedImage?: string }>(`/payments/${payment.id}/pixQrCode`);

  return {
    asaasPaymentId: payment.id,
    qrCodePayload: qrCode.payload ?? null,
    qrCodeImage: qrCode.encodedImage ?? null,
  };
}

// ---------------------------------------------------------------------------
// Boleto via Asaas (alternativa ao boleto BTG já existente — lib/btg.ts continua intocado)
// ---------------------------------------------------------------------------

export type BoletoChargeResult = { asaasPaymentId: string; boletoUrl: string | null };

export async function createBoletoCharge(
  subscription: SubscriptionForAsaas,
  office: OfficeForAsaas,
  input: ChargeInput
): Promise<BoletoChargeResult> {
  const asaasCustomerId = await getOrCreateAsaasCustomer(office);

  const payment = await asaasFetch<{ id: string; bankSlipUrl?: string; invoiceUrl?: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: asaasCustomerId,
      billingType: "BOLETO",
      value: input.value,
      dueDate: input.dueDate.toISOString().slice(0, 10),
      description: input.description,
    }),
  });

  return { asaasPaymentId: payment.id, boletoUrl: payment.bankSlipUrl ?? payment.invoiceUrl ?? null };
}

// ---------------------------------------------------------------------------
// Consulta de status (usada só pela reconciliação — nunca por sinal vindo do cliente)
// ---------------------------------------------------------------------------

export async function getPaymentStatus(asaasPaymentId: string): Promise<{ status: string; paidAt: string | null }> {
  const payment = await asaasFetch<{ status: string; paymentDate?: string | null; clientPaymentDate?: string | null }>(
    `/payments/${asaasPaymentId}`
  );
  return { status: payment.status, paidAt: payment.paymentDate ?? payment.clientPaymentDate ?? null };
}

// ---------------------------------------------------------------------------
// Verificação do webhook — FAIL-CLOSED (ver comentário de topo do arquivo)
// ---------------------------------------------------------------------------

/**
 * Compara (timing-safe) o header `asaas-access-token` recebido no webhook contra
 * `ASAAS_WEBHOOK_TOKEN`. Fail-closed por design: se a variável de ambiente não estiver
 * configurada, devolve `false` SEMPRE — nunca `true`. Isso é o oposto proposital de
 * lib/whatsapp.ts:verifySignature (que pula a validação e aceita tudo sem secret configurado),
 * porque aqui um "aceitar por engano" pode marcar uma fatura como paga sem ter sido.
 */
export function verifyAsaasWebhookToken(headerValue: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) return false; // sem token configurado → rejeita sempre (fail-closed)
  if (!headerValue) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual exige tamanhos iguais
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lógica compartilhada "marcar fatura paga + reativar escritório" — usada tanto pelo webhook
// (app/api/asaas/webhook/route.ts) quanto pela reconciliação (lib/actions/billing.ts), pra não
// duplicar a regra em dois lugares. NUNCA chamar isto a partir de um input vindo do cliente —
// só a partir de um evento de webhook já autenticado ou de uma consulta feita com nossa própria
// chave de API (ver getPaymentStatus).
// ---------------------------------------------------------------------------

export type MarkPaidResult = {
  found: boolean;
  alreadyPaid: boolean;
  invoiceId?: string;
  officeReactivated?: boolean;
};

export async function markTenantInvoicePaidByAsaasPaymentId(
  asaasPaymentId: string,
  params: { externalStatus: string; paidAt: Date }
): Promise<MarkPaidResult> {
  const invoice = await prisma.tenantInvoice.findUnique({ where: { asaasPaymentId } });
  if (!invoice) return { found: false, alreadyPaid: false };
  if (invoice.status === "PAGO") {
    // Já processado antes (idempotência de nível de dado, além da idempotência de
    // PaymentWebhookEvent) — não reprocessa, mas confirma achado.
    return { found: true, alreadyPaid: true, invoiceId: invoice.id };
  }

  await prisma.tenantInvoice.update({
    where: { id: invoice.id },
    data: { status: "PAGO", paidAt: params.paidAt, paidVia: "asaas", externalStatus: params.externalStatus },
  });

  // Se o escritório estava suspenso, o motivo do bloqueio (fatura em aberto) acabou de ser
  // resolvido — reativa. A decisão de QUANDO suspender automaticamente é da Fase 2 (cron
  // separado, ainda não implementado); aqui só reagimos a um pagamento confirmado.
  let officeReactivated = false;
  const office = await prisma.office.findUnique({ where: { id: invoice.officeId }, select: { status: true, isInternal: true } });
  if (office && !office.isInternal && office.status === "SUSPENSA") {
    await prisma.office.update({ where: { id: invoice.officeId }, data: { status: "ATIVA" } });
    officeReactivated = true;
  }

  revalidatePath("/painel-mestre");
  return { found: true, alreadyPaid: false, invoiceId: invoice.id, officeReactivated };
}
