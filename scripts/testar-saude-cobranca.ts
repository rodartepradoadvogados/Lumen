/**
 * Prova executável de lib/billingHealth.ts:avaliarSaudeCobranca — Painel Mestre → Assinaturas.
 *
 *     npx tsx scripts/testar-saude-cobranca.ts
 *
 * NÃO precisa de banco: avaliarSaudeCobranca é pura, então os casos abaixo montam objetos
 * simples direto na memória (nenhum prisma importado aqui).
 *
 * Cobre, na ordem pedida:
 *   1. assinatura sem paymentMethod              → NAO_CONFIGURADA
 *   2. fatura vencida em aberto                   → PROBLEMA
 *   3. escritório sem billingEmail                → PROBLEMA
 *   4. Pix Automático com autorização PENDENTE    → ATENCAO
 *   5. tudo certo                                 → OK
 * e mais alguns casos de fronteira que a implementação precisou decidir (BOLETO via BTG sem
 * asaasCustomerId não é NAO_CONFIGURADA; boleto/QR não gerado ainda vira ATENCAO; autorização
 * REJEITADA/CANCELADA vira PROBLEMA; Pix Automático ATIVA e sem pendências vira OK).
 */
import { avaliarSaudeCobranca, type SubscriptionSaude, type OfficeSaude, type UltimaFaturaSaude } from "../lib/billingHealth";

let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FALHA ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const AGORA = new Date("2026-08-05T12:00:00Z");
const HA_90_DIAS = new Date(AGORA.getTime() - 90 * 86400000);
const HA_5_DIAS = new Date(AGORA.getTime() - 5 * 86400000);

const officeComEmail: OfficeSaude = { billingEmail: "financeiro@escritorio.com" };
const officeSemEmail: OfficeSaude = { billingEmail: null };

function diasAPartir(dias: number): Date {
  return new Date(AGORA.getTime() + dias * 86400000);
}

async function main() {
  // ---------------------------------------------------------------------------------------
  section("1. Assinatura sem paymentMethod → NAO_CONFIGURADA");
  // ---------------------------------------------------------------------------------------
  const semMetodo: SubscriptionSaude = {
    status: "ATIVA",
    paymentMethod: null,
    asaasCustomerId: null,
    pixAuthorizationStatus: null,
    startedAt: HA_5_DIAS,
  };
  const r1 = avaliarSaudeCobranca(semMetodo, officeComEmail, null, 0, AGORA);
  check("nivel == NAO_CONFIGURADA", r1.nivel === "NAO_CONFIGURADA");
  check("tem pelo menos um motivo em português", r1.motivos.length > 0);

  // Subscription inexistente (null) tem que se comportar igual a paymentMethod nulo.
  const r1b = avaliarSaudeCobranca(null, officeComEmail, null, 0, AGORA);
  check("subscription null também vira NAO_CONFIGURADA", r1b.nivel === "NAO_CONFIGURADA");

  // ---------------------------------------------------------------------------------------
  section("2. Fatura vencida em aberto → PROBLEMA");
  // ---------------------------------------------------------------------------------------
  const subOkBoleto: SubscriptionSaude = {
    status: "ATIVA",
    paymentMethod: "BOLETO",
    asaasCustomerId: null, // BOLETO via BTG não passa pela Asaas — não deve gerar NAO_CONFIGURADA
    pixAuthorizationStatus: null,
    startedAt: HA_90_DIAS,
  };
  const faturaVencida: UltimaFaturaSaude = {
    status: "PENDENTE",
    dueDate: diasAPartir(-10),
    paidAt: null,
    boletoUrl: "https://boleto.example/1",
    pixQrCodePayload: null,
    remindersSent: ["ANTES_VENCIMENTO", "VENCIDA"],
  };
  const r2 = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaVencida, 1, AGORA);
  check("nivel == PROBLEMA", r2.nivel === "PROBLEMA");
  check("motivo menciona fatura vencida", r2.motivos.some((m) => m.toLowerCase().includes("vencida")));

  // Mais de uma vencida → motivo cita a quantidade.
  const r2b = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaVencida, 3, AGORA);
  check("com 3 vencidas o motivo cita '3'", r2b.motivos.some((m) => m.includes("3")));

  // BOLETO via BTG (sem asaasCustomerId) e SEM problema nenhum não deve ser NAO_CONFIGURADA.
  const r2c = avaliarSaudeCobranca(subOkBoleto, officeComEmail, null, 0, AGORA);
  check("BOLETO sem asaasCustomerId e sem pendências não é NAO_CONFIGURADA (fluxo BTG é válido)", r2c.nivel !== "NAO_CONFIGURADA");

  // ---------------------------------------------------------------------------------------
  section("3. Escritório sem billingEmail → PROBLEMA");
  // ---------------------------------------------------------------------------------------
  const r3 = avaliarSaudeCobranca(subOkBoleto, officeSemEmail, null, 0, AGORA);
  check("nivel == PROBLEMA", r3.nivel === "PROBLEMA");
  check("motivo menciona e-mail de cobrança", r3.motivos.some((m) => m.toLowerCase().includes("e-mail")));

  // ---------------------------------------------------------------------------------------
  section("4. Pix Automático com autorização PENDENTE → ATENCAO");
  // ---------------------------------------------------------------------------------------
  const subPixAutoPendente: SubscriptionSaude = {
    status: "ATIVA",
    paymentMethod: "PIX_AUTOMATICO",
    asaasCustomerId: "cus_123",
    pixAuthorizationStatus: "PENDENTE",
    startedAt: HA_5_DIAS,
  };
  const r4 = avaliarSaudeCobranca(subPixAutoPendente, officeComEmail, null, 0, AGORA);
  check("nivel == ATENCAO", r4.nivel === "ATENCAO");
  check("motivo menciona confirmação do cliente/banco", r4.motivos.some((m) => m.toLowerCase().includes("confirm")));

  // Pix Automático sem autorização nenhuma ainda gerada também é ATENCAO (não PROBLEMA).
  const subPixAutoSemAuth: SubscriptionSaude = { ...subPixAutoPendente, pixAuthorizationStatus: null };
  const r4b = avaliarSaudeCobranca(subPixAutoSemAuth, officeComEmail, null, 0, AGORA);
  check("Pix Automático sem autorização gerada ainda → ATENCAO", r4b.nivel === "ATENCAO");

  // Pix Automático REJEITADA/CANCELADA é PROBLEMA, não ATENCAO — débito parou de verdade.
  const subPixAutoRejeitada: SubscriptionSaude = { ...subPixAutoPendente, pixAuthorizationStatus: "REJEITADA" };
  const r4c = avaliarSaudeCobranca(subPixAutoRejeitada, officeComEmail, null, 0, AGORA);
  check("Pix Automático REJEITADA → PROBLEMA (mais grave que ATENCAO)", r4c.nivel === "PROBLEMA");

  const subPixAutoCancelada: SubscriptionSaude = { ...subPixAutoPendente, pixAuthorizationStatus: "CANCELADA" };
  const r4d = avaliarSaudeCobranca(subPixAutoCancelada, officeComEmail, null, 0, AGORA);
  check("Pix Automático CANCELADA → PROBLEMA", r4d.nivel === "PROBLEMA");

  // ---------------------------------------------------------------------------------------
  section("5. Tudo certo → OK");
  // ---------------------------------------------------------------------------------------
  const subPixAutoAtiva: SubscriptionSaude = { ...subPixAutoPendente, pixAuthorizationStatus: "ATIVA" };
  const r5 = avaliarSaudeCobranca(subPixAutoAtiva, officeComEmail, null, 0, AGORA);
  check("Pix Automático ATIVA e sem pendências → OK", r5.nivel === "OK");
  check("motivo do OK menciona autorização/Pix Automático", r5.motivos.some((m) => m.toLowerCase().includes("autorizad")));

  const faturaPaga: UltimaFaturaSaude = {
    status: "PAGO",
    dueDate: diasAPartir(-20),
    paidAt: diasAPartir(-21),
    boletoUrl: "https://boleto.example/2",
    pixQrCodePayload: null,
    remindersSent: ["ANTES_VENCIMENTO"],
  };
  const r5b = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaPaga, 0, AGORA);
  check("BOLETO com última fatura paga e sem vencida em aberto → OK", r5b.nivel === "OK");

  // ---------------------------------------------------------------------------------------
  section("Casos de fronteira adicionais");
  // ---------------------------------------------------------------------------------------

  // PIX_QRCODE/PIX_AUTOMATICO exigem asaasCustomerId (ao contrário de BOLETO).
  const subPixQrSemCustomer: SubscriptionSaude = {
    status: "ATIVA",
    paymentMethod: "PIX_QRCODE",
    asaasCustomerId: null,
    pixAuthorizationStatus: null,
    startedAt: HA_5_DIAS,
  };
  const r6 = avaliarSaudeCobranca(subPixQrSemCustomer, officeComEmail, null, 0, AGORA);
  check("PIX_QRCODE sem asaasCustomerId → NAO_CONFIGURADA", r6.nivel === "NAO_CONFIGURADA");

  // Fatura gerada mas boleto ainda não emitido → ATENCAO (não PROBLEMA, não bloqueou nada).
  const faturaSemBoletoAinda: UltimaFaturaSaude = {
    status: "PENDENTE",
    dueDate: diasAPartir(20),
    paidAt: null,
    boletoUrl: null,
    pixQrCodePayload: null,
    remindersSent: [],
  };
  const r7 = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaSemBoletoAinda, 0, AGORA);
  check("fatura PENDENTE sem boleto emitido ainda → ATENCAO", r7.nivel === "ATENCAO");
  check("motivo menciona boleto", r7.motivos.some((m) => m.toLowerCase().includes("boleto")));

  // Fatura gerada, boleto emitido, vencimento próximo (2 dias) e nenhum lembrete enviado → ATENCAO.
  const faturaSemLembrete: UltimaFaturaSaude = {
    status: "PENDENTE",
    dueDate: diasAPartir(2),
    paidAt: null,
    boletoUrl: "https://boleto.example/3",
    pixQrCodePayload: null,
    remindersSent: [],
  };
  const r8 = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaSemLembrete, 0, AGORA);
  check("vencimento em 2 dias sem nenhum lembrete enviado → ATENCAO", r8.nivel === "ATENCAO");

  // Mesmo cenário mas vencimento distante (20 dias) — ainda não é hora de se preocupar → OK.
  const faturaVencimentoDistante: UltimaFaturaSaude = { ...faturaSemLembrete, dueDate: diasAPartir(20) };
  const r9 = avaliarSaudeCobranca(subOkBoleto, officeComEmail, faturaVencimentoDistante, 0, AGORA);
  check("vencimento distante (20 dias), sem lembrete ainda, não é motivo de alarme → OK", r9.nivel === "OK");

  // Assinatura ATIVA há mais de um ciclo sem nenhuma fatura gerada → PROBLEMA.
  const subAntigaSemFatura: SubscriptionSaude = { ...subOkBoleto, startedAt: HA_90_DIAS };
  const r10 = avaliarSaudeCobranca(subAntigaSemFatura, officeComEmail, null, 0, AGORA);
  check("assinatura ativa há 90 dias sem nenhuma fatura → PROBLEMA", r10.nivel === "PROBLEMA");

  // Assinatura recém-criada sem fatura ainda não é problema (dentro do primeiro ciclo).
  const subRecenteSemFatura: SubscriptionSaude = { ...subOkBoleto, startedAt: HA_5_DIAS };
  const r11 = avaliarSaudeCobranca(subRecenteSemFatura, officeComEmail, null, 0, AGORA);
  check("assinatura recém-criada (5 dias) sem fatura ainda → não é PROBLEMA", r11.nivel !== "PROBLEMA");

  console.log(`\n${passed} verificações OK, ${failures.length} falha(s).`);
  if (failures.length > 0) {
    console.log("\nFalharam:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
