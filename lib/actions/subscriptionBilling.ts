"use server";

// Fase 3 — Cobrança Lúmen (Asaas): ações de leitura/escrita da Subscription de um escritório.
// Duas metades bem separadas neste arquivo:
// (a) lado Painel Mestre (dono da plataforma) — preenche billingCycle/paymentMethod/
//     discountPercent pela primeira vez e dispara as chamadas de teste/autorização na Asaas;
// (b) lado escritório-cliente (autoatendimento) — só leitura da PRÓPRIA cobrança, nunca aceita
//     um officeId vindo de fora (mesmo limite de segurança documentado em lib/asaas.ts).
//
// Nenhuma função aqui muda lib/asaas.ts, o webhook ou generateAndSendInvoice (lib/actions/
// billing.ts e lib/actions/painelMestre.ts) — só chama o que já existe a partir de um lugar novo.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { requirePlatformOwner } from "@/lib/actions/painelMestre";
import { createPixAutomaticoAuthorization, createPixQrCodeCharge } from "@/lib/asaas";

// Mesma mensagem de validação usada por generateAndSendInvoice (lib/actions/painelMestre.ts)
// quando falta dado básico de cobrança do escritório — reaproveitada aqui de propósito, em vez
// de inventar um segundo texto para o mesmo problema de fundo (mensalidade não cadastrada).
const MISSING_BILLING_BASICS_ERROR = "Cadastre e-mail de cobrança, mensalidade e dia de vencimento antes de gerar a fatura.";

// ============================================================================
// Lado Painel Mestre (dono da plataforma) — requirePlatformOwner()
// ============================================================================

export async function updateSubscriptionBilling(
  officeId: string,
  data: {
    billingCycle: "MENSAL" | "SEMESTRAL";
    paymentMethod: "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO" | null;
    discountPercent: number | null;
  }
): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;

  // Regra de negócio já documentada no comentário de Subscription.discountPercent no schema:
  // desconto só faz sentido combinado com o ciclo SEMESTRAL.
  if (data.discountPercent != null && data.billingCycle !== "SEMESTRAL") {
    return { error: "Desconto só se aplica ao ciclo Semestral — escolha Semestral antes de preencher o desconto." };
  }

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { monthlyFee: true } });
  if (!office) return { error: "Escritório não encontrado." };

  // A maioria dos escritórios-cliente ainda não tem Subscription (só o escritório interno nasce
  // com uma, via app/api/admin/setup-lumen/route.ts) — upsert cria a linha na primeira vez que o
  // dono da plataforma preenche esta tela, sem assumir que já existe.
  const existing = await prisma.subscription.findUnique({ where: { officeId }, select: { id: true } });
  if (!existing && office.monthlyFee == null) {
    return { error: MISSING_BILLING_BASICS_ERROR };
  }

  await prisma.subscription.upsert({
    where: { officeId },
    update: data,
    create: { officeId, monthlyFee: office.monthlyFee ?? 0, ...data },
  });

  revalidatePath("/painel-mestre/assinaturas");
  return {};
}

export async function triggerPixAutomaticoAuthorization(
  officeId: string
): Promise<{ error?: string; qrCode?: string; qrCodeImage?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;

  const office = await prisma.office.findUnique({ where: { id: officeId }, include: { subscription: true } });
  if (!office) return { error: "Escritório não encontrado." };
  const subscription = office.subscription;
  if (!subscription) return { error: "Salve o ciclo e a forma de pagamento deste escritório antes de gerar a autorização." };
  if (subscription.paymentMethod !== "PIX_AUTOMATICO") {
    return { error: "Salve a forma de pagamento como Pix Automático antes de gerar a autorização." };
  }
  if (!office.billingEmail) {
    return { error: "Cadastre o e-mail de cobrança do escritório antes de gerar a autorização." };
  }

  try {
    // Autorização inicial que o financeiro do escritório-cliente precisa escanear uma vez, no
    // app do próprio banco, para autorizar o débito recorrente — createPixAutomaticoAuthorization
    // já salva pixAuthorizationId/pixAuthorizationStatus na Subscription (lib/asaas.ts).
    const result = await createPixAutomaticoAuthorization(
      { id: subscription.id, officeId: subscription.officeId, monthlyFee: subscription.monthlyFee, billingCycle: subscription.billingCycle },
      { id: office.id, name: office.name, billingEmail: office.billingEmail, cnpj: office.cnpj }
    );
    revalidatePath("/painel-mestre/assinaturas");
    return { qrCode: result.qrCode ?? undefined, qrCodeImage: result.qrCodeImage ?? undefined };
  } catch (e) {
    console.error(`[asaas] falha ao gerar autorização Pix Automático para o escritório ${officeId}:`, e);
    return { error: e instanceof Error ? e.message : "erro desconhecido ao gerar autorização Pix Automático" };
  }
}

export async function previewPixQrCode(
  officeId: string
): Promise<{ error?: string; qrCodePayload?: string; qrCodeImage?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;

  const office = await prisma.office.findUnique({ where: { id: officeId }, include: { subscription: true } });
  if (!office) return { error: "Escritório não encontrado." };
  const subscription = office.subscription;
  if (!subscription) return { error: "Salve o ciclo e a forma de pagamento deste escritório antes de testar o QR Code." };
  if (subscription.paymentMethod !== "PIX_QRCODE") {
    return { error: "Salve a forma de pagamento como Pix QR Code antes de testar." };
  }
  if (!office.billingEmail) {
    return { error: "Cadastre o e-mail de cobrança do escritório antes de testar." };
  }

  // Preview/teste manual — mesmo cálculo de dueDate que generateAndSendInvoice já faz a partir
  // de subscription.dueDay (pequeno duplicado aceitável de propósito, ver especificação da
  // Fase 3: não vale a pena refatorar generateAndSendInvoice só para extrair 2 linhas). Não cria
  // nenhuma TenantInvoice — só confirma que a integração Asaas está funcionando.
  //
  // Se o dia cadastrado já passou neste mês, usa hoje como vencimento — a Asaas rejeita cobrança
  // com dueDate no passado (era exatamente isso que fazia esse teste falhar sempre que rodado
  // depois do dia do vencimento cadastrado).
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dueDate = new Date(now.getFullYear(), now.getMonth(), subscription.dueDay);
  if (dueDate < today) dueDate = today;

  try {
    const charge = await createPixQrCodeCharge(
      { id: subscription.id, officeId: subscription.officeId, monthlyFee: subscription.monthlyFee, billingCycle: subscription.billingCycle },
      { id: office.id, name: office.name, billingEmail: office.billingEmail, cnpj: office.cnpj },
      { value: subscription.monthlyFee, dueDate, description: `Teste de cobrança Lúmen — ${office.name}` }
    );
    revalidatePath("/painel-mestre/assinaturas");
    return { qrCodePayload: charge.qrCodePayload ?? undefined, qrCodeImage: charge.qrCodeImage ?? undefined };
  } catch (e) {
    console.error(`[asaas] falha ao gerar QR Code de teste para o escritório ${officeId}:`, e);
    return { error: e instanceof Error ? e.message : "erro desconhecido ao gerar QR Code de teste" };
  }
}

// ============================================================================
// Lado escritório-cliente (autoatendimento) — qualquer membro logado do próprio escritório,
// NÃO precisa ser platform owner. officeId nunca é aceito como parâmetro aqui: sempre derivado
// de getCurrentUser(), o mesmo limite de segurança do webhook Asaas (nunca confiar em sinal
// externo) — aqui o risco seria um usuário ver a fatura de outro escritório.
// ============================================================================

export type OwnOfficeBilling = {
  subscription: {
    billingCycle: string;
    paymentMethod: string | null;
    discountPercent: number | null;
    pixAuthorizationStatus: string | null;
  } | null;
  invoices: Array<{
    id: string;
    competencia: string;
    amount: number;
    dueDate: string;
    status: string;
    paymentMethod: string | null;
    pixQrCodePayload: string | null;
    pixQrCodeImage: string | null;
  }>;
};

export async function getOwnOfficeBilling(): Promise<OwnOfficeBilling> {
  const viewer = await getCurrentUser();
  if (!viewer) return { subscription: null, invoices: [] };

  const [subscription, invoices] = await Promise.all([
    prisma.subscription.findUnique({ where: { officeId: viewer.officeId } }),
    prisma.tenantInvoice.findMany({
      where: { officeId: viewer.officeId },
      orderBy: { competencia: "desc" },
      take: 12,
    }),
  ]);

  return {
    subscription: subscription
      ? {
          billingCycle: subscription.billingCycle,
          paymentMethod: subscription.paymentMethod,
          discountPercent: subscription.discountPercent,
          pixAuthorizationStatus: subscription.pixAuthorizationStatus,
        }
      : null,
    invoices: invoices.map((i) => ({
      id: i.id,
      competencia: i.competencia,
      amount: i.amount,
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      paymentMethod: i.paymentMethod,
      pixQrCodePayload: i.pixQrCodePayload,
      pixQrCodeImage: i.pixQrCodeImage,
    })),
  };
}
