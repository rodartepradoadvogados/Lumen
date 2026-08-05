/**
 * Prova executável do quebra-vidro POR REGISTRO (Fase B).
 *
 * Ao contrário de scripts/testar-mascaramento.ts (funções puras, sem banco), este cobre a
 * AUTORIZAÇÃO em si — por isso precisa de um banco de verdade (DATABASE_URL do .env):
 *     npx tsx scripts/testar-quebra-vidro.ts
 *
 * O que prova, na ordem:
 *   1. revelar e pedir acesso SEM nenhuma AccessSession ativa: os dois falham;
 *   2. revelar COM sessão ativa mas SEM AccessRequest aprovado do registro: falha;
 *   3. revelar COM AccessRequest aprovado de OUTRO registro (mesmo escritório, mesmo membro):
 *      falha, e nenhum AccessAuditLog LEITURA foi gravado até aqui;
 *   4. revelar COM AccessRequest aprovado do registro CERTO: funciona — devolve o valor REAL
 *      (não mascarado) e grava exatamente UM AccessAuditLog (action: LEITURA) com
 *      scopeType/scopeId/sessionId/memberId corretos;
 *   5. solicitarAcessoRegistro (requestRecordAccess) recusa scopeId de outro escritório e de
 *      registro inexistente;
 *   6. pedir de novo o mesmo registro já aprovado não duplica AccessRequest (idempotente).
 *
 * Cria e limpa seus próprios dados (escritório de slug "escritorio-quebra-vidro-teste" e um
 * segundo escritório efêmero para o teste 5), sem tocar em nada que já exista.
 */
import { prisma, prismaBase } from "../lib/prisma";
import { revealRecord, requestRecordAccess } from "../lib/breakGlass";
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

const SLUG = "escritorio-quebra-vidro-teste";
const REASON: AccessReasonCode = "DIAGNOSTICO_ERRO";

async function cleanup() {
  const office = await prisma.office.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!office) return;
  const officeId = office.id;
  // Ordem respeita dependências de FK (filhos antes dos pais).
  await prisma.accessAuditLog.deleteMany({ where: { officeId } });
  await prisma.accessSession.deleteMany({ where: { request: { officeId } } });
  await prisma.accessRequest.deleteMany({ where: { officeId } });
  await prisma.supportTicket.deleteMany({ where: { officeId } });
  await prisma.case.deleteMany({ where: { officeId } });
  await prisma.office.delete({ where: { id: officeId } });
  await prisma.platformMember.deleteMany({ where: { email: { contains: "quebra-vidro-teste" } } });
}

async function main() {
  console.log("=== Limpando dados de teste anteriores ===");
  await cleanup();

  console.log("\n=== Preparando escritório, PlatformMember, chamado e dois processos ===");
  const office = await prisma.office.create({ data: { name: "Escritório Quebra-Vidro Teste", slug: SLUG } });

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
    data: { name: "Membro Teste Quebra-Vidro", email: "membro@quebra-vidro-teste.local", roleId: role.id },
  });

  const caseX = await prisma.case.create({
    data: { officeId: office.id, title: "Fulano de Tal vs. Banco XYZ", description: "Detalhe sigiloso do caso X" },
  });
  const caseY = await prisma.case.create({
    data: { officeId: office.id, title: "Outro processo qualquer", description: "Detalhe sigiloso do caso Y" },
  });

  const ticket = await prisma.supportTicket.create({ data: { officeId: office.id, subject: "Chamado de teste", status: "EM_ANDAMENTO" } });

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 60_000);

  console.log("\n=== 1. Revelar e pedir acesso SEM sessão ativa nenhuma ===");
  const r1 = await revealRecord({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id });
  check("sem sessão ativa: revealRecord devolve erro, sem dado", Boolean(r1.error) && !r1.data);
  const req0 = await requestRecordAccess({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id, reasonCode: REASON });
  check("sem sessão ativa: requestRecordAccess devolve erro, sem requestId", Boolean(req0.error) && !req0.requestId);

  console.log("\n=== Abrindo uma AccessSession (entrada normal, mesmo formato de openSupportAccess) ===");
  const entradaRequest = await prisma.accessRequest.create({
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
  const session = await prisma.accessSession.create({
    data: { requestId: entradaRequest.id, memberId: member.id, startedAt: now, expiresAt: future },
  });

  console.log("\n=== 2. Revelar COM sessão ativa, mas SEM pedido aprovado do registro ===");
  const r2 = await revealRecord({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id });
  check("sessão ativa sem AccessRequest aprovado do registro: revealRecord devolve erro, sem dado", Boolean(r2.error) && !r2.data);

  console.log("\n=== Aprovando um pedido de quebra-vidro para o CASO Y (não o X) ===");
  await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CASE",
      scopeId: caseY.id,
      status: "APROVADO",
      decidedAt: now,
      expiresAt: future,
    },
  });

  console.log("\n=== 3. Revelar o CASO X usando o pedido aprovado do CASO Y (registro errado) ===");
  const r3 = await revealRecord({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id });
  check("pedido aprovado é de OUTRO registro: revealRecord devolve erro, sem dado", Boolean(r3.error) && !r3.data);

  const auditBefore = await prisma.accessAuditLog.count({ where: { officeId: office.id, action: "LEITURA" } });
  check("nenhum LEITURA foi gravado até aqui (nenhuma tentativa deveria ter revelado nada)", auditBefore === 0);

  console.log("\n=== Aprovando o pedido de quebra-vidro do CASO X, o registro certo ===");
  const reqX = await prisma.accessRequest.create({
    data: {
      officeId: office.id,
      requesterId: member.id,
      ticketId: ticket.id,
      reasonCode: REASON,
      scopeType: "CASE",
      scopeId: caseX.id,
      status: "APROVADO",
      decidedAt: now,
      expiresAt: future,
    },
  });

  console.log("\n=== 4. Revelar o CASO X com o pedido aprovado do CASO X (registro certo) ===");
  const r4 = await revealRecord({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id });
  check("pedido aprovado do registro certo: revealRecord devolve dado (sem erro)", !r4.error && Boolean(r4.data));
  check("dado revelado bate com o título REAL (não mascarado)", r4.data?.title === "Fulano de Tal vs. Banco XYZ");
  check("dado revelado bate com a description REAL (não mascarada)", r4.data?.description === "Detalhe sigiloso do caso X");

  const auditAfter = await prisma.accessAuditLog.count({ where: { officeId: office.id, action: "LEITURA" } });
  check("exatamente UM AccessAuditLog LEITURA foi gravado", auditAfter === 1);

  const auditLog = await prisma.accessAuditLog.findFirst({ where: { officeId: office.id, action: "LEITURA" } });
  check("LEITURA aponta pro scopeType/scopeId certos", auditLog?.scopeType === "CASE" && auditLog?.scopeId === caseX.id);
  check("LEITURA aponta pra sessão certa", auditLog?.sessionId === session.id);
  check("LEITURA aponta pro member certo", auditLog?.memberId === member.id);

  console.log("\n=== 5. solicitarAcessoRegistro recusa registro fora do escritório e registro inexistente ===");
  const otherOffice = await prisma.office.create({ data: { name: "Outro Escritório", slug: `${SLUG}-outro` } });
  const otherCase = await prisma.case.create({ data: { officeId: otherOffice.id, title: "Caso de outro escritório" } });
  const rBadScope = await requestRecordAccess({
    officeId: office.id,
    memberId: member.id,
    scopeType: "CASE",
    scopeId: otherCase.id,
    reasonCode: REASON,
  });
  check("pedido para scopeId de OUTRO escritório é recusado", Boolean(rBadScope.error) && !rBadScope.requestId);
  await prisma.case.delete({ where: { id: otherCase.id } });
  await prisma.office.delete({ where: { id: otherOffice.id } });

  const rMissing = await requestRecordAccess({
    officeId: office.id,
    memberId: member.id,
    scopeType: "ATTENDANCE",
    scopeId: "id-inexistente",
    reasonCode: REASON,
  });
  check("pedido para scopeId inexistente é recusado", Boolean(rMissing.error) && !rMissing.requestId);

  console.log("\n=== 6. Pedir de novo o CASO X (já aprovado) não duplica AccessRequest ===");
  const countBefore = await prisma.accessRequest.count({ where: { officeId: office.id, scopeType: "CASE", scopeId: caseX.id } });
  const rDup = await requestRecordAccess({ officeId: office.id, memberId: member.id, scopeType: "CASE", scopeId: caseX.id, reasonCode: REASON });
  const countAfter = await prisma.accessRequest.count({ where: { officeId: office.id, scopeType: "CASE", scopeId: caseX.id } });
  check("pedido repetido do mesmo registro já aprovado não cria linha nova", countBefore === countAfter);
  check("pedido repetido devolve o id do pedido já aprovado", rDup.requestId === reqX.id);

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
