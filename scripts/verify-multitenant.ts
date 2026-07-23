import { PrismaClient } from "@prisma/client";
import { seedDefaultOfficeData } from "../lib/defaultOfficeData";
import { getFilteredPayables, getFilteredReceivables } from "../lib/financeQuery";
import { getAlerts, getTodayItems } from "../lib/alerts";
import { isCaseInOffice, isClientInOffice, isUserInOffice } from "../lib/officeScope";
import { getOfficeModules } from "../lib/officeModules";

const prisma = new PrismaClient();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

async function cleanupTestOffices() {
  const offices = await prisma.office.findMany({ where: { slug: { in: ["escritorio-teste-a", "escritorio-teste-b"] } }, select: { id: true } });
  const officeIds = offices.map((o) => o.id);
  if (officeIds.length === 0) return;
  const where = { officeId: { in: officeIds } };
  // Ordem respeita dependências de FK (filhos antes dos pais).
  await prisma.task.deleteMany({ where });
  await prisma.payable.deleteMany({ where });
  await prisma.receivable.deleteMany({ where });
  await prisma.case.deleteMany({ where });
  await prisma.client.deleteMany({ where });
  await prisma.kanbanColumn.deleteMany({ where });
  await prisma.financialCategory.deleteMany({ where });
  await prisma.user.deleteMany({ where });
  await prisma.office.deleteMany({ where: { id: { in: officeIds } } });
}

async function main() {
  console.log("=== Limpando dados de teste anteriores ===");
  await cleanupTestOffices();

  console.log("\n=== Criando dois escritórios (A e B) ===");
  const officeA = await prisma.office.create({ data: { name: "Escritório Teste A", slug: "escritorio-teste-a" } });
  const officeB = await prisma.office.create({ data: { name: "Escritório Teste B", slug: "escritorio-teste-b" } });

  console.log("\n=== Aplicando dados padrão (Kanban + Plano de Contas) via seedDefaultOfficeData ===");
  const seedA = await seedDefaultOfficeData(prisma, officeA.id);
  const seedB = await seedDefaultOfficeData(prisma, officeB.id);

  // --- Verificação 1: dados padrão (Kanban) ---
  assert(seedA.columns.length === 4, `Office A recebeu 4 colunas de Kanban (recebeu ${seedA.columns.length})`);
  assert(seedB.columns.length === 4, `Office B recebeu 4 colunas de Kanban (recebeu ${seedB.columns.length})`);
  const namesA = seedA.columns.map((c) => c.name).sort();
  assert(
    JSON.stringify(namesA) === JSON.stringify(["A Fazer", "Aguardando", "Concluído", "Em Andamento"].sort()),
    `Nomes das colunas do Kanban de A conferem: ${namesA.join(", ")}`
  );
  const doneColA = seedA.columns.find((c) => c.isDoneCol);
  assert(!!doneColA && doneColA.name === "Concluído", "Coluna 'Concluído' marcada como isDoneCol em A");
  assert(
    seedA.columns.every((c) => c.officeId === officeA.id) && seedB.columns.every((c) => c.officeId === officeB.id),
    "Todas as colunas de Kanban carregam o officeId correto"
  );
  // IDs devem ser distintos entre A e B (não reaproveitados)
  const idsA = new Set(seedA.columns.map((c) => c.id));
  const overlap = seedB.columns.filter((c) => idsA.has(c.id));
  assert(overlap.length === 0, "Nenhuma coluna de Kanban é compartilhada por ID entre A e B (são cópias independentes)");

  // --- Verificação 2: dados padrão (Plano de Contas) ---
  const catCountA = Object.keys(seedA.categories).length;
  const catCountB = Object.keys(seedB.categories).length;
  assert(catCountA > 0 && catCountA === catCountB, `Plano de contas criado igualmente para A e B (${catCountA} contas cada)`);
  assert(!!seedA.categories["1.1"] && seedA.categories["1.1"].name === "Honorários Contratuais", "Conta 1.1 (Honorários Contratuais) existe em A");
  assert(!!seedA.categories["2.3.1"] && seedA.categories["2.3.1"].name === "Aluguel", "Conta 2.3.1 (Aluguel) existe em A, com hierarquia (parentId)");
  const catAluguelA = await prisma.financialCategory.findUnique({ where: { id: seedA.categories["2.3.1"].id } });
  assert(catAluguelA?.parentId === seedA.categories["2.3"].id, "Conta 2.3.1 aponta pro parent correto (2.3 Estrutura e Ocupação) em A");
  assert(
    Object.values(seedA.categories).every((c) => c.officeId === officeA.id) &&
      Object.values(seedB.categories).every((c) => c.officeId === officeB.id),
    "Todas as categorias do plano de contas carregam o officeId correto"
  );
  const catIdsA = new Set(Object.values(seedA.categories).map((c) => c.id));
  const catOverlap = Object.values(seedB.categories).filter((c) => catIdsA.has(c.id));
  assert(catOverlap.length === 0, "Nenhuma categoria financeira é compartilhada por ID entre A e B (são cópias independentes)");

  // --- Preparação: usuários + dados de negócio distintos em cada escritório ---
  console.log("\n=== Criando usuário admin + dados de negócio (Cliente, Caso, Financeiro) em cada escritório ===");
  const userA = await prisma.user.create({
    data: { officeId: officeA.id, name: "Admin A", email: "admin-a@teste-multitenant.local", role: "Sócio", isAdmin: true, financeAccess: true, color: "#000" },
  });
  const userB = await prisma.user.create({
    data: { officeId: officeB.id, name: "Admin B", email: "admin-b@teste-multitenant.local", role: "Sócio", isAdmin: true, financeAccess: true, color: "#000" },
  });

  const clientA = await prisma.client.create({ data: { officeId: officeA.id, name: "Cliente Secreto da Empresa A", type: "PJ" } });
  const clientB = await prisma.client.create({ data: { officeId: officeB.id, name: "Cliente Secreto da Empresa B", type: "PJ" } });

  const caseA = await prisma.case.create({
    data: { officeId: officeA.id, title: "Processo Confidencial A", processNumber: "0000001-11.2026.8.09.0051", clientId: clientA.id, area: "Cível" },
  });
  await prisma.case.create({
    data: { officeId: officeB.id, title: "Processo Confidencial B", processNumber: "0000002-22.2026.8.09.0051", clientId: clientB.id, area: "Cível" },
  });

  const payableA = await prisma.payable.create({
    data: {
      officeId: officeA.id,
      description: "Pagamento secreto do Escritório A",
      amount: 12345.67,
      dueDate: new Date(),
      categoryId: seedA.categories["2.3.1"].id,
      status: "PENDENTE",
    },
  });
  await prisma.payable.create({
    data: {
      officeId: officeB.id,
      description: "Pagamento secreto do Escritório B",
      amount: 99999.99,
      dueDate: new Date(),
      categoryId: seedB.categories["2.3.1"].id,
      status: "PENDENTE",
    },
  });

  const receivableA = await prisma.receivable.create({
    data: {
      officeId: officeA.id,
      description: "Recebível secreto do Escritório A",
      amount: 5000,
      dueDate: new Date(),
      categoryId: seedA.categories["1.1"].id,
      status: "PENDENTE",
      clientId: clientA.id,
    },
  });
  await prisma.receivable.create({
    data: {
      officeId: officeB.id,
      description: "Recebível secreto do Escritório B",
      amount: 7000,
      dueDate: new Date(),
      categoryId: seedB.categories["1.1"].id,
      status: "PENDENTE",
      clientId: clientB.id,
    },
  });

  const taskA = await prisma.task.create({
    data: {
      officeId: officeA.id,
      title: "Tarefa urgente e secreta do Escritório A",
      type: "TAREFA",
      dueDate: new Date(Date.now() - 86400000),
      columnId: seedA.columns[0].id,
      responsibleId: userA.id,
    },
  });
  await prisma.task.create({
    data: {
      officeId: officeB.id,
      title: "Tarefa urgente e secreta do Escritório B",
      type: "TAREFA",
      dueDate: new Date(Date.now() - 86400000),
      columnId: seedB.columns[0].id,
      responsibleId: userB.id,
    },
  });

  // --- Verificação 3: isolamento real via funções de produção (não SQL cru) ---
  console.log("\n=== Testando isolamento entre escritórios usando as funções reais da aplicação ===");

  const payablesA = await getFilteredPayables({}, officeA.id);
  assert(
    payablesA.some((p) => p.id === payableA.id) && !payablesA.some((p) => p.description.includes("Escritório B")),
    "getFilteredPayables(officeA) retorna só contas a pagar de A, nunca de B"
  );

  const receivablesA = await getFilteredReceivables({}, officeA.id);
  assert(
    receivablesA.some((r) => r.id === receivableA.id) && !receivablesA.some((r) => r.description.includes("Escritório B")),
    "getFilteredReceivables(officeA) retorna só contas a receber de A, nunca de B"
  );

  const todayItemsA = await getTodayItems(officeA.id, true);
  assert(
    todayItemsA.some((i) => "title" in i && (i as any).title?.includes("Escritório A")) &&
      !todayItemsA.some((i) => JSON.stringify(i).includes("Escritório B")),
    "getTodayItems(officeA) inclui a tarefa vencida de A e nada do texto 'Escritório B'"
  );

  const alertsA = await getAlerts(officeA.id, true, userA.id);
  assert(!JSON.stringify(alertsA).includes("Escritório B"), "getAlerts(officeA) não contém nenhum dado do Escritório B");
  // globalSearch() não foi testado aqui: depende de getCurrentUser()/cookies() de uma requisição
  // real (Next.js), que não existe neste script standalone. Coberto separadamente por revisão de código.

  // --- Verificação 4: lib/officeScope.ts — bloqueia injeção de FK entre escritórios ---
  // Este é o guard que fecha o achado da auditoria (ex.: lib/actions/attachments.ts,
  // lib/actions/cases.ts, financeiro.ts etc. usavam caseId/clientId/responsibleId do cliente
  // sem checar se pertenciam ao escritório de quem estava logado).
  console.log("\n=== Testando lib/officeScope.ts (bloqueio de injeção de FK entre escritórios) ===");

  assert(await isCaseInOffice(caseA.id, officeA.id), "isCaseInOffice: processo de A é aceito para A");
  assert(!(await isCaseInOffice(caseA.id, officeB.id)), "isCaseInOffice: processo de A é REJEITADO para B (bloqueia a injeção)");
  assert(await isClientInOffice(clientA.id, officeA.id), "isClientInOffice: cliente de A é aceito para A");
  assert(!(await isClientInOffice(clientA.id, officeB.id)), "isClientInOffice: cliente de A é REJEITADO para B");
  assert(await isUserInOffice(userA.id, officeA.id), "isUserInOffice: usuário de A é aceito para A");
  assert(!(await isUserInOffice(userA.id, officeB.id)), "isUserInOffice: usuário de A é REJEITADO para B");

  // --- Verificação 5: módulos por contrato (lib/officeModules.ts) ---
  console.log("\n=== Testando módulos por contrato (lib/officeModules.ts) ===");

  const modulesA0 = await getOfficeModules(officeA.id);
  assert(
    modulesA0.financeiro && modulesA0.whatsapp && modulesA0.atendimento && modulesA0.assessoria,
    "getOfficeModules: todos os módulos vêm ligados por padrão pra um escritório novo"
  );

  await prisma.office.update({ where: { id: officeA.id }, data: { moduloAtendimento: false } });
  const modulesA1 = await getOfficeModules(officeA.id);
  assert(!modulesA1.atendimento, "getOfficeModules: reflete o módulo Atendimento desligado em A");
  assert(modulesA1.financeiro && modulesA1.whatsapp && modulesA1.assessoria, "getOfficeModules: os outros módulos de A continuam ligados");

  const modulesB = await getOfficeModules(officeB.id);
  assert(modulesB.atendimento, "getOfficeModules: desligar o módulo em A não afeta B (isolamento por escritório)");

  console.log("\n=== TODAS AS VERIFICAÇÕES PASSARAM ===");

  console.log("\n=== Limpando dados de teste ===");
  await cleanupTestOffices();
}

main()
  .catch((e) => {
    console.error("\n!!! VERIFICAÇÃO FALHOU !!!");
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
