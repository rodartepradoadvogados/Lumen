// Painel Mestre → Assinaturas: selo consolidado "Cobrança OK" pedido pelo dono da plataforma
// ("bater o olho na lista de escritórios e saber se a cobrança daquele escritório está
// saudável — sem precisar abrir cada um nem consultar o Asaas"). Função PURA de propósito
// (nenhum import de prisma/asaas aqui) — recebe objetos simples já carregados pela página
// (app/painel-mestre/assinaturas/page.tsx), o que permite testar as regras sem banco
// (ver scripts/testar-saude-cobranca.ts) e mantém a tela livre de qualquer chamada à API da
// Asaas (a reconciliação de verdade já roda no cron, app/api/cron/billing).
//
// Quatro níveis, do pior pro melhor:
//   NAO_CONFIGURADA — o dono da plataforma ainda nem escolheu a forma de cobrança (ou, tendo
//     escolhido Pix, o cliente Asaas correspondente ainda não existe — sem ele nenhuma cobrança
//     Pix sai do papel). BOLETO é um caso à parte: continua existindo via BTG (lib/btg.ts,
//     ver comentário em generateAndSendInvoice em lib/actions/painelMestre.ts) para quem não
//     usa a Asaas, então BOLETO nunca exige asaasCustomerId aqui — só PIX_AUTOMATICO e
//     PIX_QRCODE, que dependem 100% da Asaas (lib/asaas.ts:getOrCreateAsaasCustomer).
//   PROBLEMA — algo que impede a cobrança de chegar ou de ser paga, ação precisa acontecer.
//   ATENCAO — não está quebrado, mas tem um passo pendente que vale olhar.
//   OK — configurado, sem fatura vencida em aberto, e (se Pix Automático) autorização ATIVA.
//
// Cada nível empilha motivos em português (nunca só a cor) — o objetivo é o dono da
// plataforma saber o que fazer, não só que "tem algo errado".

export type PaymentMethod = "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO";
export type PixAuthorizationStatus = "PENDENTE" | "ATIVA" | "CANCELADA" | "REJEITADA";
export type InvoiceStatus = "PENDENTE" | "PAGO" | "CANCELADO";
export type NivelSaudeCobranca = "OK" | "ATENCAO" | "PROBLEMA" | "NAO_CONFIGURADA";

export type SubscriptionSaude = {
  status: string; // ATIVA | TESTE | SUSPENSA | CANCELADA
  paymentMethod: PaymentMethod | null;
  asaasCustomerId: string | null;
  pixAuthorizationStatus: PixAuthorizationStatus | null;
  startedAt: Date | string;
} | null;

export type OfficeSaude = {
  billingEmail: string | null;
};

// Só os campos da fatura mais recente que a avaliação precisa — de propósito um subconjunto
// de TenantInvoice, não o model inteiro, pra função continuar aceitando objetos simples.
export type UltimaFaturaSaude = {
  status: InvoiceStatus;
  dueDate: Date | string;
  paidAt: Date | string | null;
  boletoUrl: string | null;
  pixQrCodePayload: string | null;
  remindersSent: string[];
} | null;

export type SaudeCobranca = {
  nivel: NivelSaudeCobranca;
  motivos: string[];
};

// Mesmo prazo do lembrete "antes do vencimento" (lib/actions/billing.ts:REMINDER_DAYS_BEFORE_DUE)
// — reaproveitado aqui só como referência de "vencimento próximo", não uma dependência de código.
const DIAS_VENCIMENTO_PROXIMO = 3;

// Um ciclo mensal (até 31 dias) + uma semana de folga antes de soar alarme por "assinatura
// ativa sem nenhuma fatura gerada" — evita falso positivo pra assinatura recém-configurada que
// ainda não chegou no primeiro dia de vencimento.
const DIAS_SEM_FATURA_TOLERADOS = 38;

function paraData(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function avaliarSaudeCobranca(
  subscription: SubscriptionSaude,
  office: OfficeSaude,
  ultimaFatura: UltimaFaturaSaude,
  faturasVencidasAbertas: number,
  now: Date = new Date()
): SaudeCobranca {
  // NAO_CONFIGURADA — nada ainda pra avaliar de verdade.
  if (!subscription || !subscription.paymentMethod) {
    return { nivel: "NAO_CONFIGURADA", motivos: ["Forma de cobrança ainda não escolhida para este escritório."] };
  }
  if ((subscription.paymentMethod === "PIX_AUTOMATICO" || subscription.paymentMethod === "PIX_QRCODE") && !subscription.asaasCustomerId) {
    return {
      nivel: "NAO_CONFIGURADA",
      motivos: ["Cliente ainda não foi criado na Asaas — nenhuma cobrança Pix pode ser gerada até isso acontecer."],
    };
  }

  // PROBLEMA — empilha, não retorna cedo: o dono da plataforma quer a lista inteira do que
  // precisa de ação, não só o primeiro motivo encontrado.
  const problemas: string[] = [];

  if (!office.billingEmail) {
    problemas.push("Escritório sem e-mail de cobrança cadastrado — a cobrança nunca chega até ele ser preenchido.");
  }

  if (faturasVencidasAbertas > 0) {
    problemas.push(
      faturasVencidasAbertas === 1
        ? "Há 1 fatura vencida e ainda em aberto."
        : `Há ${faturasVencidasAbertas} faturas vencidas e ainda em aberto.`
    );
  }

  if (subscription.paymentMethod === "PIX_AUTOMATICO") {
    if (subscription.pixAuthorizationStatus === "REJEITADA") {
      problemas.push("A autorização de Pix Automático foi rejeitada pelo banco do cliente — peça para tentar de novo.");
    } else if (subscription.pixAuthorizationStatus === "CANCELADA") {
      problemas.push("A autorização de Pix Automático foi cancelada pelo cliente — o débito recorrente parou.");
    }
  }

  const diasDesdeInicio = Math.floor((now.getTime() - paraData(subscription.startedAt).getTime()) / 86400000);
  if (subscription.status === "ATIVA" && !ultimaFatura && diasDesdeInicio > DIAS_SEM_FATURA_TOLERADOS) {
    problemas.push("Assinatura ativa há mais de um ciclo e nenhuma fatura foi gerada ainda.");
  }

  if (problemas.length > 0) {
    return { nivel: "PROBLEMA", motivos: problemas };
  }

  // ATENCAO — nada quebrado, mas um passo pendente que vale olhar.
  const atencoes: string[] = [];

  if (subscription.paymentMethod === "PIX_AUTOMATICO") {
    if (!subscription.pixAuthorizationStatus) {
      atencoes.push("Pix Automático escolhido, mas a autorização ainda não foi gerada — use o botão \"Gerar autorização\".");
    } else if (subscription.pixAuthorizationStatus === "PENDENTE") {
      atencoes.push("Autorização de Pix Automático criada, mas o cliente ainda não confirmou no aplicativo do banco.");
    }
  }

  if (ultimaFatura && ultimaFatura.status === "PENDENTE") {
    if (subscription.paymentMethod === "BOLETO" && !ultimaFatura.boletoUrl) {
      atencoes.push("A fatura do mês já existe, mas o boleto ainda não foi emitido.");
    } else if (subscription.paymentMethod === "PIX_QRCODE" && !ultimaFatura.pixQrCodePayload) {
      atencoes.push("A fatura do mês já existe, mas o QR Code ainda não foi gerado.");
    } else if (subscription.paymentMethod !== "PIX_AUTOMATICO" && ultimaFatura.remindersSent.length === 0) {
      // remindersSent vazio = NENHUM e-mail de cobrança saiu por esta fatura — nem o inicial
      // (generateAndSendInvoice grava "FATURA_INICIAL" só depois do envio dar certo) nem os
      // lembretes do cron. Ver prisma/schema.prisma:TenantInvoice.remindersSent.
      const diasParaVencer = Math.floor((paraData(ultimaFatura.dueDate).getTime() - now.getTime()) / 86400000);
      if (diasParaVencer >= 0 && diasParaVencer <= DIAS_VENCIMENTO_PROXIMO) {
        atencoes.push("Vencimento próximo e a cobrança ainda não foi enviada por e-mail ao escritório.");
      }
    }
  }

  if (atencoes.length > 0) {
    return { nivel: "ATENCAO", motivos: atencoes };
  }

  // OK
  if (subscription.paymentMethod === "PIX_AUTOMATICO") {
    return { nivel: "OK", motivos: ["Pix Automático autorizado pelo cliente e sem pendências."] };
  }
  return { nivel: "OK", motivos: ["Cobrança configurada e em dia."] };
}
