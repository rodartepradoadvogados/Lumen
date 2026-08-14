"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { seedDefaultOfficeData } from "@/lib/defaultOfficeData";
import { sendOfficeInviteEmail, sendInvoiceEmail } from "@/lib/email";
import { createBoleto, isBtgConnected, disconnectBtg as btgDisconnect } from "@/lib/btg";
import { createPixQrCodeCharge, createBoletoCharge, isAsaasConfigured, calcularValorCobranca } from "@/lib/asaas";

// Exportada (Fase 3 — Asaas) para lib/actions/subscriptionBilling.ts reusar o mesmo gate,
// em vez de duplicar a checagem de isPlatformOwner num segundo lugar.
export async function requirePlatformOwner() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) return { error: "Apenas administradores da plataforma podem fazer isso." } as const;
  return { viewer };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return base || "escritorio";
}

async function uniqueOfficeSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 1;
  while (await prisma.office.findUnique({ where: { slug } })) {
    suffix++;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export type TenantOfficeSummary = {
  id: string;
  name: string;
  isInternal: boolean;
  status: string;
  billingEmail: string | null;
  monthlyFee: number | null;
  billingDueDay: number | null;
  modules: { financeiro: boolean; whatsapp: boolean; atendimento: boolean; assessoria: boolean };
  lastInvoice: { id: string; competencia: string; status: string; dueDate: string; amount: number } | null;
};

// Lista todos os escritórios (inclusive o interno) com a última fatura de cada um — usado só
// pela tela de listagem do Painel Mestre.
export async function listTenantOffices(): Promise<TenantOfficeSummary[]> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return [];

  const offices = await prisma.office.findMany({
    orderBy: { createdAt: "asc" },
    include: { invoices: { orderBy: { competencia: "desc" }, take: 1 } },
  });

  return offices.map((o) => ({
    id: o.id,
    name: o.name,
    isInternal: o.isInternal,
    status: o.status,
    billingEmail: o.billingEmail,
    monthlyFee: o.monthlyFee,
    billingDueDay: o.billingDueDay,
    modules: { financeiro: o.moduloFinanceiro, whatsapp: o.moduloWhatsapp, atendimento: o.moduloAtendimento, assessoria: o.moduloAssessoria },
    lastInvoice: o.invoices[0]
      ? { id: o.invoices[0].id, competencia: o.invoices[0].competencia, status: o.invoices[0].status, dueDate: o.invoices[0].dueDate.toISOString(), amount: o.invoices[0].amount }
      : null,
  }));
}

export async function createOffice(data: {
  officeName: string;
  adminName: string;
  adminEmail: string;
  billingEmail: string;
  monthlyFee: number;
  billingDueDay: number;
  modules: { financeiro: boolean; whatsapp: boolean; atendimento: boolean; assessoria: boolean };
}): Promise<{ error?: string; officeId?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;

  const officeName = data.officeName.trim();
  const adminName = data.adminName.trim();
  const adminEmail = data.adminEmail.trim().toLowerCase();
  const billingEmail = data.billingEmail.trim().toLowerCase();
  if (!officeName || !adminName || !adminEmail || !billingEmail) {
    return { error: "Preencha nome do escritório, nome e e-mail do administrador, e o e-mail de cobrança." };
  }
  if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
    return { error: "Já existe uma conta cadastrada com esse e-mail de administrador." };
  }

  const slug = await uniqueOfficeSlug(slugify(officeName));
  const rawToken = crypto.randomBytes(32).toString("hex");

  const user = await prisma.$transaction(async (tx) => {
    const office = await tx.office.create({
      data: {
        name: officeName,
        slug,
        blogAccess: false,
        billingEmail,
        monthlyFee: data.monthlyFee,
        billingDueDay: data.billingDueDay,
        moduloFinanceiro: data.modules.financeiro,
        moduloWhatsapp: data.modules.whatsapp,
        moduloAtendimento: data.modules.atendimento,
        moduloAssessoria: data.modules.assessoria,
      },
    });
    await seedDefaultOfficeData(tx, office.id);
    return tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        role: "Admin",
        isAdmin: true,
        financeAccess: true,
        officeId: office.id,
        resetTokenHash: hashToken(rawToken),
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  });

  const inviteUrl = `${getAppUrl()}/redefinir-senha?token=${rawToken}`;
  const emailResult = await sendOfficeInviteEmail(adminEmail, adminName, inviteUrl, officeName);

  revalidatePath("/painel-mestre");
  if (!emailResult.sent) {
    return { officeId: user.officeId, error: `Escritório criado, mas o e-mail de convite não saiu: ${emailResult.reason}. Peça pra essa pessoa usar "Esqueci minha senha" no login.` };
  }
  return { officeId: user.officeId };
}

export async function updateOfficeModules(officeId: string, modules: { financeiro: boolean; whatsapp: boolean; atendimento: boolean; assessoria: boolean }): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;
  await prisma.office.update({
    where: { id: officeId },
    data: { moduloFinanceiro: modules.financeiro, moduloWhatsapp: modules.whatsapp, moduloAtendimento: modules.atendimento, moduloAssessoria: modules.assessoria },
  });
  revalidatePath("/painel-mestre");
  return {};
}

export async function updateOfficeBilling(
  officeId: string,
  data: { billingEmail: string; monthlyFee: number; billingDueDay: number; paymentGraceDays: number; cnpj: string }
): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;
  await prisma.office.update({ where: { id: officeId }, data });
  revalidatePath("/painel-mestre");
  return {};
}

// "Gerar boleto e enviar por e-mail": cria (ou reaproveita, se já existir) a fatura do mês
// corrente pro escritório, tenta emitir a cobrança de verdade (Asaas, se a Subscription deste
// escritório escolheu PIX_QRCODE, ou BTG, se já estiver conectado — caminho antigo, intocado),
// e manda o e-mail de qualquer forma (com ou sem boleto/Pix anexado — ver sendInvoiceEmail).
//
// Decisão de design (Fase 1 — sem tela nova pra escolher isso ainda, ver README_ASAAS.md):
// Subscription.paymentMethod decide o caminho. "PIX_QRCODE" cria a cobrança na Asaas aqui
// mesmo. "PIX_AUTOMATICO" NÃO cria nada aqui — o débito recorrente já é disparado pela própria
// Asaas a partir da autorização existente (subscription.pixAuthorizationId); só marcamos
// paymentMethod na fatura pra a tela futura (Fase 3) saber o que exibir. Sem Subscription, ou
// com paymentMethod null/"BOLETO", cai no caminho BTG de sempre, sem nenhuma mudança de
// comportamento pra quem já usa isso hoje (nenhum escritório existente tem
// Subscription.paymentMethod preenchido ainda — o campo nasce nulo).
export async function generateAndSendInvoice(officeId: string): Promise<{ error?: string; btgWarning?: string; asaasWarning?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;

  const office = await prisma.office.findUnique({ where: { id: officeId }, include: { subscription: true } });
  if (!office) return { error: "Escritório não encontrado." };
  if (!office.billingEmail || !office.monthlyFee || !office.billingDueDay) {
    return { error: "Cadastre e-mail de cobrança, mensalidade e dia de vencimento antes de gerar a fatura." };
  }
  const billingEmail = office.billingEmail;

  const now = new Date();
  const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Se o dia de vencimento cadastrado já passou neste mês (ex.: vencimento dia 10, gerando a
  // fatura no dia 27), usa hoje como vencimento em vez de uma data no passado — a Asaas rejeita
  // cobrança com dueDate vencido, e isso também deixava a fatura "vencida" desde a criação.
  let dueDate = new Date(now.getFullYear(), now.getMonth(), office.billingDueDay);
  if (dueDate < today) dueDate = today;

  // Valor cobrado de fato: se este escritório tem Subscription com ciclo SEMESTRAL, é a
  // mensalidade x 6 com o desconto aplicado (calcularValorCobranca, lib/asaas.ts) — nunca a
  // mensalidade crua. Sem Subscription (maioria dos escritórios hoje, ver comentário em
  // updateSubscriptionBilling), mantém o comportamento de sempre: mensalidade cheia, mensal.
  const amount = office.subscription ? calcularValorCobranca(office.subscription) : office.monthlyFee;

  let invoice = await prisma.tenantInvoice.findUnique({ where: { officeId_competencia: { officeId, competencia } } });
  if (!invoice) {
    invoice = await prisma.tenantInvoice.create({
      data: { officeId, competencia, amount, dueDate, status: "PENDENTE" },
    });
  } else if (invoice.status === "PENDENTE" && invoice.dueDate < today) {
    // Fatura já existia (ex.: tentativa anterior antes deste fix) com um vencimento que ficou no
    // passado — a Asaas rejeita cobrança com dueDate vencido, então corrige pra hoje antes de
    // tentar gerar boleto/Pix de novo.
    invoice = await prisma.tenantInvoice.update({ where: { id: invoice.id }, data: { dueDate: today } });
  }

  let btgWarning: string | undefined;
  let asaasWarning: string | undefined;
  let boletoUrl = invoice.boletoUrl;
  const subscription = office.subscription;

  if (subscription?.paymentMethod === "PIX_QRCODE" && isAsaasConfigured()) {
    if (!invoice.asaasPaymentId) {
      try {
        const charge = await createPixQrCodeCharge(
          { id: subscription.id, officeId: subscription.officeId, monthlyFee: subscription.monthlyFee, billingCycle: subscription.billingCycle },
          { id: office.id, name: office.name, billingEmail, cnpj: office.cnpj },
          { value: invoice.amount, dueDate: invoice.dueDate, description: `Mensalidade Lúmen — ${office.name} — ${competencia}` }
        );
        invoice = await prisma.tenantInvoice.update({
          where: { id: invoice.id },
          data: {
            paymentMethod: "PIX_QRCODE",
            asaasPaymentId: charge.asaasPaymentId,
            pixQrCodePayload: charge.qrCodePayload,
            pixQrCodeImage: charge.qrCodeImage,
          },
        });
      } catch (e) {
        asaasWarning = e instanceof Error ? e.message : "erro desconhecido ao criar cobrança Pix na Asaas";
        console.error(`[asaas] falha ao criar cobrança Pix QR Code para o escritório ${officeId}:`, e);
      }
    }
  } else if (subscription?.paymentMethod === "PIX_AUTOMATICO") {
    if (!invoice.paymentMethod) {
      invoice = await prisma.tenantInvoice.update({ where: { id: invoice.id }, data: { paymentMethod: "PIX_AUTOMATICO" } });
    }
  } else if (subscription?.paymentMethod === "BOLETO" && isAsaasConfigured()) {
    // Boleto emitido pela Asaas em vez do BTG — mesmo webhook/reconciliação que já cobre Pix
    // passa a cobrir esse boleto também, sem precisar de nenhuma conciliação manual. O
    // caminho BTG abaixo continua existindo só para quem não tiver Subscription.paymentMethod
    // definido (ou enquanto a Asaas não estiver configurada).
    if (!invoice.asaasPaymentId) {
      try {
        const charge = await createBoletoCharge(
          { id: subscription.id, officeId: subscription.officeId, monthlyFee: subscription.monthlyFee, billingCycle: subscription.billingCycle },
          { id: office.id, name: office.name, billingEmail, cnpj: office.cnpj },
          { value: invoice.amount, dueDate: invoice.dueDate, description: `Mensalidade Lúmen — ${office.name} — ${competencia}` }
        );
        invoice = await prisma.tenantInvoice.update({
          where: { id: invoice.id },
          data: { paymentMethod: "BOLETO", asaasPaymentId: charge.asaasPaymentId, boletoUrl: charge.boletoUrl },
        });
        boletoUrl = charge.boletoUrl;
      } catch (e) {
        asaasWarning = e instanceof Error ? e.message : "erro desconhecido ao criar boleto na Asaas";
        console.error(`[asaas] falha ao criar boleto para o escritório ${officeId}:`, e);
      }
    } else {
      boletoUrl = invoice.boletoUrl;
    }
  } else if (!boletoUrl && (await isBtgConnected())) {
    const boleto = await createBoleto({
      payerName: office.name,
      payerDocument: "", // TODO: cadastrar CNPJ do escritório-cliente — necessário pro BTG emitir de verdade
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      description: `Mensalidade Lúmen — ${office.name} — ${competencia}`,
    });
    if (boleto.ok) {
      await prisma.tenantInvoice.update({ where: { id: invoice.id }, data: { boletoId: boleto.boletoId, boletoUrl: boleto.boletoUrl } });
      boletoUrl = boleto.boletoUrl ?? null;
    } else {
      btgWarning = boleto.error;
    }
  }

  const emailResult = await sendInvoiceEmail(billingEmail, office.name, invoice.amount, invoice.dueDate, boletoUrl, {
    pixPayload: invoice.pixQrCodePayload,
    pixImage: invoice.pixQrCodeImage,
  });

  // Registra que a cobrança CHEGOU ao escritório. Antes, só o cron (lib/actions/billing.ts)
  // gravava em remindersSent, então este e-mail — que é justamente o PRIMEIRO a sair, com o
  // boleto/QR Code — não deixava rastro nenhum: a coluna "Entrega da cobrança" em
  // /painel-mestre/assinaturas dizia "nenhum e-mail enviado ainda" no mesmo dia em que a
  // fatura foi gerada e enviada, até o cron rodar (3 dias antes do vencimento).
  //
  // Só grava se o e-mail REALMENTE saiu (emailResult.sent) — a tela existe pra distinguir
  // "gerado" de "enviado", e marcar entrega numa falha de envio destruiria essa distinção.
  // Guardado por includes() porque este botão pode ser clicado de novo na mesma competência
  // (reenvio legítimo, a fatura já existe): sem o guarda, a mesma marca se acumularia na
  // lista a cada clique. Os guardas do cron são por tipo (ANTES_VENCIMENTO/VENCIDA/SUSPENSAO),
  // então este valor novo não interfere em nenhum deles.
  if (emailResult.sent && !invoice.remindersSent.includes("FATURA_INICIAL")) {
    await prisma.tenantInvoice.update({
      where: { id: invoice.id },
      data: { remindersSent: { push: "FATURA_INICIAL" } },
    });
  }

  revalidatePath("/painel-mestre");
  revalidatePath("/painel-mestre/assinaturas");
  if (!emailResult.sent) return { error: `Fatura registrada, mas o e-mail não saiu: ${emailResult.reason}`, btgWarning, asaasWarning };
  return { btgWarning, asaasWarning };
}

export async function markInvoicePaid(invoiceId: string): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;
  await prisma.tenantInvoice.update({ where: { id: invoiceId }, data: { status: "PAGO", paidAt: new Date(), paidVia: "manual" } });
  revalidatePath("/painel-mestre");
  return {};
}

export async function setOfficeAccess(officeId: string, blocked: boolean): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { isInternal: true } });
  if (office?.isInternal) return { error: "O escritório interno nunca pode ser bloqueado." };
  await prisma.office.update({ where: { id: officeId }, data: { status: blocked ? "SUSPENSA" : "ATIVA" } });
  revalidatePath("/painel-mestre");
  return {};
}

export async function disconnectBtgAction(): Promise<{ error?: string }> {
  const auth = await requirePlatformOwner();
  if ("error" in auth) return auth;
  await btgDisconnect();
  revalidatePath("/painel-mestre");
  return {};
}
