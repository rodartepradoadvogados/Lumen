/**
 * Prova executável do cron de expiração (Fase D).
 *
 * Precisa de um banco de verdade (DATABASE_URL do .env), igual a scripts/testar-quebra-vidro.ts:
 *     npx tsx scripts/testar-expiracao-acessos.ts
 *
 * O que prova, na ordem:
 *   1. uma AccessSession já VENCIDA (expiresAt no passado, endedAt: null) é encerrada pelo cron:
 *      endedAt vira exatamente o `expiresAt` original (não "agora"), endedBy vira "EXPIRACAO", e
 *      um AccessAuditLog SAIDA com detail "EXPIRACAO" é gravado — mesmo formato que
 *      closeSupportAccess já grava para MEMBRO/ESCRITORIO;
 *   2. uma AccessSession AINDA VÁLIDA (expiresAt no futuro) não é tocada;
 *   3. rodar expireSupportAccess() DUAS VEZES seguidas não duplica o AccessAuditLog SAIDA nem
 *      muda o endedAt já gravado (idempotência);
 *   4. um AccessRequest PENDENTE com expiresAt vencido vira EXPIRADO;
 *   5. um AccessRequest PENDENTE ainda dentro do prazo não é tocado.
 *
 * Cria e limpa seus próprios dados (escritório de slug "escritorio-expiracao-teste"), sem tocar
 * em nada que já exista.
 */
import { prisma, prismaBase } from "../lib/prisma";
import { expireSupportAccess, closeSupportAccess } from "../lib/supportAccess";
import type { AccessReasonCode } from "../lib/supportAccessConstants";

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

const SLUG = "escritorio-expiracao-teste";
const REASON: AccessReasonCode = "DIAGNOSTICO_ERRO";

async function cleanup() {
  const office = await prisma.office.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!office) return;
  const officeId = office.id;
  await prisma.accessAuditLog.deleteMany({ where: { officeId } });
  await prisma.accessSession.deleteMany({ where: { request: { officeId } } });
  await prisma.accessRequest.deleteMany({ where: { officeId } });
  await prisma.supportTicket.deleteMany({ where: { officeId } });
  await prisma.office.delete({ where: { id: officeId } });
  await prisma.platformMember.deleteMany({ where: { email: { contains: "expiracao-teste" } } });
}

async function main() {
  console.log("=== Limpando dados de teste anteriores ===");
  await cleanup();

  console.log("\n=== Preparando escritório, PlatformMember e chamado ===");
  const office = await prisma.office.create({ data: { name: "Escritório Expiração Teste", slug: SLUG } });

  let role = await prisma.platformRole.findUnique({ where: { key: "SOCIO" } });
  if (!role) {
    role = await prisma.platformRole.create({
      data: {
        key: "SOCIO",
        name: "Sócio",
        maxVisibility: "QUEBRA_VIDRO",
        canManageBilling: true,
        canManageMembers: true,
        canApproveAccess: true,
      },
    });
  }
  const member = await prisma.platformMember.create({
    data: { name: "Membro Teste Expiração", email: "membro@expiracao-teste.local", roleId: role.id },
  });

  const ticket = await prisma.supportTicket.create({ data: { officeId: office.id, subject: "Chamado de teste", status: "EM_ANDAMENTO" } });

  const now = new Date();
  const past = new Date(now.getTime() - 10 * 60_000); // venceu há 10 min
  const future = new Date(now.getTime() + 30 * 60_000); // vence daqui a 30 min

  // -----------------------------------------------------------------------------------------
  section("Preparando 1 sessão VENCIDA e 1 sessão AINDA VÁLIDA");
  // -----------------------------------------------------------------------------------------
  const expiredRequest = await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CONFIGURACAO",
      scopeId: office.id,
      status: "APROVADO",
      decidedAt: past,
      expiresAt: past,
    },
  });
  const expiredSession = await prisma.accessSession.create({
    data: { requestId: expiredRequest.id, memberId: member.id, startedAt: new Date(past.getTime() - 30 * 60_000), expiresAt: past },
  });
  await prisma.accessAuditLog.create({
    data: {
      officeId: office.id,
      memberId: member.id,
      action: "ENTRADA",
      reasonCode: REASON,
      scopeType: "CONFIGURACAO",
      scopeId: office.id,
      sessionId: expiredSession.id,
    },
  });

  const validRequest = await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CONFIGURACAO",
      scopeId: office.id,
      status: "APROVADO",
      decidedAt: now,
      expiresAt: future,
    },
  });
  const validSession = await prisma.accessSession.create({
    data: { requestId: validRequest.id, memberId: member.id, startedAt: now, expiresAt: future },
  });

  // -----------------------------------------------------------------------------------------
  section("1. Rodando expireSupportAccess() a primeira vez");
  // -----------------------------------------------------------------------------------------
  const result1 = await expireSupportAccess();
  check("relatou 1 sessão expirada", result1.sessionsExpired === 1);

  const expiredAfter = await prisma.accessSession.findUniqueOrThrow({ where: { id: expiredSession.id } });
  check("sessão vencida foi encerrada (endedAt preenchido)", expiredAfter.endedAt !== null);
  check(
    "endedAt == expiresAt ORIGINAL (não 'agora' do momento em que o cron rodou)",
    expiredAfter.endedAt?.getTime() === past.getTime()
  );
  check("endedBy == \"EXPIRACAO\"", expiredAfter.endedBy === "EXPIRACAO");

  const saidaLogs1 = await prisma.accessAuditLog.findMany({
    where: { officeId: office.id, action: "SAIDA", sessionId: expiredSession.id },
  });
  check("exatamente UM AccessAuditLog SAIDA foi gravado para a sessão vencida", saidaLogs1.length === 1);
  check("detail da SAIDA == \"EXPIRACAO\" — mesmo formato que closeSupportAccess grava", saidaLogs1[0]?.detail === "EXPIRACAO");
  check("SAIDA aponta pro member certo", saidaLogs1[0]?.memberId === member.id);
  check("SAIDA aponta pro scopeType/scopeId certos", saidaLogs1[0]?.scopeType === "CONFIGURACAO" && saidaLogs1[0]?.scopeId === office.id);

  // -----------------------------------------------------------------------------------------
  section("2. Sessão AINDA VÁLIDA não foi tocada");
  // -----------------------------------------------------------------------------------------
  const validAfter = await prisma.accessSession.findUniqueOrThrow({ where: { id: validSession.id } });
  check("sessão válida continua sem endedAt", validAfter.endedAt === null);
  check("sessão válida continua sem endedBy", validAfter.endedBy === null);
  const saidaLogsValid = await prisma.accessAuditLog.count({ where: { sessionId: validSession.id, action: "SAIDA" } });
  check("nenhum SAIDA foi gravado para a sessão válida", saidaLogsValid === 0);

  // -----------------------------------------------------------------------------------------
  section("3. Rodando expireSupportAccess() DE NOVO — idempotência");
  // -----------------------------------------------------------------------------------------
  const result2 = await expireSupportAccess();
  check("segunda rodada não encontra mais nenhuma sessão pra expirar (já foi expirada na primeira)", result2.sessionsExpired === 0);

  const saidaLogs2 = await prisma.accessAuditLog.findMany({
    where: { officeId: office.id, action: "SAIDA", sessionId: expiredSession.id },
  });
  check("ainda existe exatamente UM SAIDA para a sessão vencida (rodar duas vezes não duplicou)", saidaLogs2.length === 1);

  const expiredAfter2 = await prisma.accessSession.findUniqueOrThrow({ where: { id: expiredSession.id } });
  check("endedAt não mudou na segunda rodada", expiredAfter2.endedAt?.getTime() === past.getTime());

  // Reforço direto: chamar closeSupportAccess "por fora" numa sessão já encerrada também não
  // duplica nada — é a mesma garantia de idempotência que os outros dois chamadores (botão
  // "Encerrar agora" e stopActingAsOffice) já dependem.
  await closeSupportAccess(expiredSession.id, "EXPIRACAO", past);
  const saidaLogs3 = await prisma.accessAuditLog.count({ where: { sessionId: expiredSession.id, action: "SAIDA" } });
  check("chamar closeSupportAccess direto numa sessão já encerrada por EXPIRACAO também não duplica", saidaLogs3 === 1);

  // -----------------------------------------------------------------------------------------
  section("4. AccessRequest PENDENTE vencido vira EXPIRADO");
  // -----------------------------------------------------------------------------------------
  const pendingExpired = await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CONFIGURACAO",
      scopeId: office.id,
      status: "PENDENTE",
      expiresAt: past,
    },
  });
  const pendingValid = await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CONFIGURACAO",
      scopeId: office.id,
      status: "PENDENTE",
      expiresAt: future,
    },
  });

  const result3 = await expireSupportAccess();
  check("relatou 1 pedido expirado (o outro PENDENTE ainda não venceu)", result3.requestsExpired === 1);

  const pendingExpiredAfter = await prisma.accessRequest.findUniqueOrThrow({ where: { id: pendingExpired.id } });
  check("pedido vencido virou status EXPIRADO", pendingExpiredAfter.status === "EXPIRADO");

  // -----------------------------------------------------------------------------------------
  section("5. AccessRequest PENDENTE ainda dentro do prazo não foi tocado");
  // -----------------------------------------------------------------------------------------
  const pendingValidAfter = await prisma.accessRequest.findUniqueOrThrow({ where: { id: pendingValid.id } });
  check("pedido ainda válido continua PENDENTE", pendingValidAfter.status === "PENDENTE");

  console.log("\n=== Rodando expireSupportAccess() mais uma vez — idempotência do lado dos pedidos ===");
  const result4 = await expireSupportAccess();
  check("nenhuma sessão nova pra expirar", result4.sessionsExpired === 0);
  check("nenhum pedido novo pra expirar (o único vencido já virou EXPIRADO)", result4.requestsExpired === 0);

  console.log("\n=== Limpando dados de teste ===");
  await cleanup();

  console.log(`\n${passed} verificações OK, ${failures.length} falha(s).`);
  if (failures.length > 0) {
    console.log("\nFalharam:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await prismaBase.$disconnect();
  });
