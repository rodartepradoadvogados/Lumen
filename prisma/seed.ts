import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(days: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log("Limpando banco...");
  await prisma.mention.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.kanbanColumn.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.payable.deleteMany();
  await prisma.receivable.deleteMany();
  await prisma.financialCategory.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.case.deleteMany();
  await prisma.client.deleteMany();
  await prisma.opposingParty.deleteMany();
  await prisma.lawyer.deleteMany();
  await prisma.user.deleteMany();

  console.log("Criando equipe...");
  const jairo = await prisma.user.create({
    data: { name: "Jairo Rodarte", email: "jairo@rodarteprado.com.br", role: "Sócio", oab: "OAB/GO 45.123", color: "#0f1f3d" },
  });
  const rodrigo = await prisma.user.create({
    data: { name: "Rodrigo Prado", email: "rodrigo@rodarteprado.com.br", role: "Sócio", oab: "OAB/GO 45.987", color: "#8a6a1f" },
  });
  const estagiaria = await prisma.user.create({
    data: { name: "Ana Beatriz", email: "ana@rodarteprado.com.br", role: "Estagiária", color: "#557" },
  });

  console.log("Colunas do kanban...");
  const colTodo = await prisma.kanbanColumn.create({ data: { name: "A Fazer", order: 0, color: "#94a3b8" } });
  const colProgress = await prisma.kanbanColumn.create({ data: { name: "Em Andamento", order: 1, color: "#b8904f" } });
  const colWaiting = await prisma.kanbanColumn.create({ data: { name: "Aguardando", order: 2, color: "#6b7fae" } });
  const colDone = await prisma.kanbanColumn.create({ data: { name: "Concluído", order: 3, color: "#2f7d4f", isDoneCol: true } });

  console.log("Clientes...");
  const multipedras = await prisma.client.create({ data: { name: "Multipedras Revestimentos Eireli", type: "PJ", document: "12.345.678/0001-90", email: "contato@multipedras.com.br", phone: "(62) 3222-1000" } });
  const pneulandia = await prisma.client.create({ data: { name: "Pneulândia Comercial Ltda", type: "PJ", document: "22.333.444/0001-11", phone: "(62) 3555-2000" } });
  const vidaLocadora = await prisma.client.create({ data: { name: "Vida Locadora - Fórmula Locação de Veículos Especiais Ltda", type: "PJ", document: "33.444.555/0001-22" } });
  const bancoBrasil = await prisma.client.create({ data: { name: "Banco do Brasil S/A", type: "PJ", document: "00.000.000/0001-91" } });
  const carlosSilva = await prisma.client.create({ data: { name: "Carlos Eduardo da Silva", type: "PF", document: "123.456.789-00", phone: "(62) 99123-4567" } });

  console.log("Parte adversa...");
  const estadoRoraima = await prisma.opposingParty.create({ data: { name: "Estado de Roraima", type: "PJ" } });
  const lourivalSantos = await prisma.opposingParty.create({ data: { name: "Lourival Barbosa Santos", type: "PF" } });
  const villageAdm = await prisma.opposingParty.create({ data: { name: "Village Administração de Serviços Ltda", type: "PJ" } });
  const estadoGoias = await prisma.opposingParty.create({ data: { name: "Estado de Goiás", type: "PJ" } });

  console.log("Advogados parceiros e adversos...");
  const advParceiro = await prisma.lawyer.create({ data: { name: "Fernanda Lima", oab: "OAB/GO 33.210", side: "PARCEIRO", firm: "Lima & Associados", phone: "(62) 99888-1122" } });
  const advAdverso = await prisma.lawyer.create({ data: { name: "Marcos Vinícius Teixeira", oab: "OAB/RR 12.045", side: "ADVERSO", firm: "Teixeira Advocacia" } });
  const advAdverso2 = await prisma.lawyer.create({ data: { name: "Procuradoria Geral do Estado de Goiás", side: "ADVERSO" } });

  console.log("Casos...");
  const caso1 = await prisma.case.create({
    data: {
      title: "Multipedras Revestimentos Eireli x Estado de Roraima",
      type: "JUDICIAL", area: "Tributário", status: "ATIVO",
      processNumber: "0801234-56.2024.8.23.0010", court: "1ª Vara da Fazenda Pública - RR",
      caseValue: 480000, instance: "1º Grau",
      clientId: multipedras.id, opposingPartyId: estadoRoraima.id, opposingLawyerId: advAdverso.id,
      responsibleId: jairo.id,
      description: "Ação anulatória de auto de infração tributário.",
    },
  });
  const caso2 = await prisma.case.create({
    data: {
      title: "Pneulândia Comercial Ltda x Lourival Barbosa Santos | Eliane",
      type: "JUDICIAL", area: "Cível", status: "ATIVO",
      processNumber: "0709876-12.2023.8.09.0051", court: "3ª Vara Cível de Goiânia",
      caseValue: 92000, instance: "1º Grau",
      clientId: pneulandia.id, opposingPartyId: lourivalSantos.id,
      responsibleId: rodrigo.id,
      description: "Execução suspensa aguardando cumprimento de acordo.",
    },
  });
  const caso3 = await prisma.case.create({
    data: {
      title: "Banco do Brasil S/A x Village Administração de Serviços Ltda",
      type: "JUDICIAL", area: "Cível", status: "ATIVO",
      processNumber: "0812233-44.2022.8.09.0051", court: "5ª Vara Cível de Goiânia",
      caseValue: 215000,
      clientId: bancoBrasil.id, opposingPartyId: villageAdm.id,
      responsibleId: jairo.id,
    },
  });
  const caso4 = await prisma.case.create({
    data: {
      title: "Vida Locadora x Guilherme Ferreira da Silva e Cia Ltda",
      type: "JUDICIAL", area: "Cível", status: "ATIVO",
      processNumber: "0855667-89.2024.8.09.0051", court: "2ª Vara Cível de Goiânia",
      clientId: vidaLocadora.id,
      responsibleId: rodrigo.id,
      description: "Busca e apreensão - necessário localizar novo endereço do réu.",
    },
  });
  const caso5 = await prisma.case.create({
    data: {
      title: "Execução de Sentença - Estado de Goiás x Médicos Legistas",
      type: "JUDICIAL", area: "Administrativo", status: "ATIVO",
      processNumber: "0844556-77.2021.8.09.0051",
      clientId: carlosSilva.id, opposingPartyId: estadoGoias.id, opposingLawyerId: advAdverso2.id,
      responsibleId: jairo.id,
    },
  });
  const caso6 = await prisma.case.create({
    data: {
      title: "Consultivo - Revisão Contratual Multipedras",
      type: "CONSULTIVO", area: "Empresarial", status: "ATIVO",
      clientId: multipedras.id, responsibleId: rodrigo.id,
    },
  });

  console.log("Tarefas / agenda / kanban...");
  const tasks = [
    { title: "Ver andamento no SEI - RR", type: "TAREFA", caseId: caso1.id, dueDate: daysFromNow(5), responsibleId: jairo.id, columnId: colTodo.id, priority: "MEDIA" },
    { title: "Rever execução suspensa", type: "TAREFA", caseId: caso2.id, dueDate: daysFromNow(230), responsibleId: rodrigo.id, columnId: colWaiting.id, priority: "BAIXA" },
    { title: "Avisar do resultado ao Ailton e orientar quanto ao que fazer daqui em diante", type: "TAREFA", caseId: caso3.id, dueDate: daysFromNow(-4), responsibleId: jairo.id, columnId: colProgress.id, priority: "ALTA", status: "PENDENTE" },
    { title: "Verificar TJ - iniciar cumprimento de sentença (10% sentença + 2% apelação)", type: "PRAZO", caseId: caso5.id, dueDate: daysFromNow(-1), responsibleId: jairo.id, columnId: colProgress.id, priority: "URGENTE" },
    { title: "Recolher FGTS e INSS voluntariamente - guias independentes - LBS Contabilidade", type: "TAREFA", caseId: caso5.id, dueDate: daysFromNow(-12), responsibleId: estagiaria.id, columnId: colTodo.id, priority: "MEDIA" },
    { title: "Custas iniciais - 2 de 10 - R$ 1.261,91", type: "PRAZO", caseId: caso5.id, dueDate: daysFromNow(-13), responsibleId: jairo.id, columnId: colDone.id, status: "CONCLUIDO", priority: "MEDIA" },
    { title: "Custas iniciais - 10 de 10 - R$ 1.261,91", type: "PRAZO", caseId: caso5.id, dueDate: daysFromNow(238), responsibleId: jairo.id, columnId: colTodo.id, priority: "BAIXA" },
    { title: "Concluir negociação em 12x", type: "TAREFA", caseId: caso4.id, dueDate: daysFromNow(-13), responsibleId: rodrigo.id, columnId: colWaiting.id, priority: "MEDIA" },
    { title: "Buscar novo endereço do réu", type: "TAREFA", caseId: caso4.id, dueDate: daysFromNow(-1), responsibleId: rodrigo.id, columnId: colTodo.id, priority: "ALTA" },
    { title: "Conferir julgamento", type: "EVENTO", caseId: caso1.id, dueDate: daysFromNow(1), responsibleId: jairo.id, columnId: colTodo.id, priority: "ALTA" },
    { title: "Audiência de instrução e julgamento", type: "AUDIENCIA", caseId: caso2.id, dueDate: daysFromNow(6, 14, 0), dueTime: "14:00", responsibleId: rodrigo.id, columnId: colTodo.id, priority: "ALTA" },
    { title: "Perícia contábil", type: "PERICIA", caseId: caso3.id, dueDate: daysFromNow(9, 9, 30), dueTime: "09:30", responsibleId: jairo.id, columnId: colTodo.id, priority: "MEDIA" },
    { title: "Prazo para contestação", type: "PRAZO", caseId: caso4.id, dueDate: daysFromNow(3), responsibleId: rodrigo.id, columnId: colProgress.id, priority: "URGENTE" },
    { title: "Reunião com cliente - revisão contratual", type: "EVENTO", caseId: caso6.id, dueDate: daysFromNow(2, 11, 0), dueTime: "11:00", responsibleId: rodrigo.id, columnId: colTodo.id, priority: "MEDIA" },
    { title: "Elaborar minuta de recurso de apelação", type: "TAREFA", caseId: caso1.id, dueDate: daysFromNow(4), responsibleId: estagiaria.id, columnId: colProgress.id, priority: "ALTA" },
  ];
  const createdTasks = [];
  for (const t of tasks) {
    createdTasks.push(await prisma.task.create({ data: t as any }));
  }

  console.log("Comentários com menções...");
  const c1 = await prisma.comment.create({
    data: {
      content: "@Rodrigo Prado pode revisar a minuta antes de eu protocolar amanhã?",
      authorId: jairo.id,
      taskId: createdTasks[13].id,
      caseId: caso1.id,
    },
  });
  await prisma.mention.create({ data: { commentId: c1.id, userId: rodrigo.id } });

  const c2 = await prisma.comment.create({
    data: { content: "Cliente confirmou os novos documentos, já anexei na pasta do caso.", authorId: rodrigo.id, caseId: caso2.id },
  });

  console.log("Categorias financeiras...");
  const catHonorarios = await prisma.financialCategory.create({ data: { name: "Honorários Contratuais", kind: "RECEITA" } });
  const catSucumbencia = await prisma.financialCategory.create({ data: { name: "Honorários Sucumbenciais", kind: "RECEITA" } });
  const catAluguel = await prisma.financialCategory.create({ data: { name: "Aluguel e Condomínio", kind: "DESPESA" } });
  const catFolha = await prisma.financialCategory.create({ data: { name: "Folha de Pagamento", kind: "DESPESA" } });
  const catCustas = await prisma.financialCategory.create({ data: { name: "Custas Processuais", kind: "DESPESA" } });
  const catSoftware = await prisma.financialCategory.create({ data: { name: "Softwares e Assinaturas", kind: "DESPESA" } });
  const catMarketing = await prisma.financialCategory.create({ data: { name: "Marketing", kind: "DESPESA" } });

  console.log("Contas a pagar...");
  const payables = [
    { description: "Aluguel escritório - Julho/2026", supplier: "Imobiliária Central", amount: 4200, dueDate: daysFromNow(2), categoryId: catAluguel.id },
    { description: "Salários equipe - Julho/2026", supplier: "Folha de Pagamento", amount: 18500, dueDate: daysFromNow(7), categoryId: catFolha.id },
    { description: "Custas iniciais - 3 de 10", supplier: "TJGO", amount: 1261.91, dueDate: daysFromNow(17), categoryId: catCustas.id, caseId: caso5.id },
    { description: "Assinatura Astrea/Sistema Jurídico", supplier: "Astrea Jurídico", amount: 890, dueDate: daysFromNow(-2), categoryId: catSoftware.id },
    { description: "Impulsionamento Instagram", supplier: "Meta Ads", amount: 600, dueDate: daysFromNow(-6), categoryId: catMarketing.id },
    { description: "Energia elétrica", supplier: "Enel Goiás", amount: 540, dueDate: daysFromNow(-1), categoryId: catAluguel.id },
    { description: "Internet e telefonia", supplier: "Vivo Empresas", amount: 320, dueDate: daysFromNow(5), categoryId: catSoftware.id },
  ];
  for (const p of payables) {
    const isPaid = Math.random() > 0.6 && (p.dueDate as Date) < new Date();
    await prisma.payable.create({
      data: {
        ...p,
        status: isPaid ? "PAGO" : (p.dueDate as Date) < new Date() ? "ATRASADO" : "PENDENTE",
        paidDate: isPaid ? new Date() : null,
        paidAmount: isPaid ? p.amount : null,
      } as any,
    });
  }

  console.log("Contas a receber...");
  const receivables = [
    { description: "Honorários contratuais - Multipedras (1/6)", amount: 12000, dueDate: daysFromNow(3), clientId: multipedras.id, caseId: caso1.id, categoryId: catHonorarios.id, kind: "HONORARIOS_CONTRATUAIS" },
    { description: "Honorários sucumbenciais - Pneulândia", amount: 8500, dueDate: daysFromNow(-5), clientId: pneulandia.id, caseId: caso2.id, categoryId: catSucumbencia.id, kind: "HONORARIOS_SUCUMBENCIAIS" },
    { description: "Honorários contratuais - Vida Locadora (3/10)", amount: 3200, dueDate: daysFromNow(-10), clientId: vidaLocadora.id, caseId: caso4.id, categoryId: catHonorarios.id, kind: "HONORARIOS_CONTRATUAIS" },
    { description: "Honorários contratuais - Banco do Brasil", amount: 25000, dueDate: daysFromNow(10), clientId: bancoBrasil.id, caseId: caso3.id, categoryId: catHonorarios.id, kind: "HONORARIOS_CONTRATUAIS" },
    { description: "Consultivo - Revisão Contratual Multipedras", amount: 6000, dueDate: daysFromNow(-1), clientId: multipedras.id, caseId: caso6.id, categoryId: catHonorarios.id, kind: "HONORARIOS_CONTRATUAIS" },
    { description: "Honorários - Carlos Eduardo (parcela final)", amount: 4300, dueDate: daysFromNow(15), clientId: carlosSilva.id, caseId: caso5.id, categoryId: catHonorarios.id, kind: "HONORARIOS_CONTRATUAIS" },
  ];
  for (const r of receivables) {
    const isPaid = Math.random() > 0.5 && (r.dueDate as Date) < new Date();
    await prisma.receivable.create({
      data: {
        ...r,
        status: isPaid ? "PAGO" : (r.dueDate as Date) < new Date() ? "ATRASADO" : "PENDENTE",
        paidDate: isPaid ? new Date() : null,
        paidAmount: isPaid ? r.amount : null,
      } as any,
    });
  }

  console.log("Publicações...");
  const publications = [
    { source: "PJE", content: "Intimação para manifestação sobre laudo pericial no prazo de 15 dias.", publishedAt: daysFromNow(-2), caseId: caso3.id },
    { source: "DJE", content: "Sentença de procedência parcial publicada. Prazo recursal em curso.", publishedAt: daysFromNow(-1), caseId: caso1.id, read: true },
    { source: "PJE", content: "Designada audiência de instrução e julgamento.", publishedAt: daysFromNow(-3), caseId: caso2.id },
    { source: "ESAJ", content: "Determinada expedição de ofício para localização de endereço do executado.", publishedAt: daysFromNow(-6), caseId: caso4.id },
    { source: "DJE", content: "Homologado acordo entre as partes.", publishedAt: daysFromNow(-10), caseId: caso5.id, read: true },
  ];
  for (const p of publications) {
    await prisma.publication.create({ data: p as any });
  }

  console.log("Atendimentos (setor de atendimento)...");
  await prisma.attendance.createMany({
    data: [
      { clientName: "Marcos Aurélio Pereira", contact: "(62) 99222-3344", subject: "Dúvida sobre rescisão trabalhista", channel: "WHATSAPP", status: "NOVO", responsibleId: estagiaria.id },
      { clientName: "Construtora Horizonte Ltda", contact: "financeiro@horizonte.com.br", subject: "Cobrança de inadimplente - possível ação de execução", channel: "EMAIL", status: "EM_TRIAGEM", responsibleId: rodrigo.id },
      { clientName: "Juliana Mendes", contact: "(62) 99876-1122", subject: "Divórcio consensual", channel: "TELEFONE", status: "NOVO", responsibleId: jairo.id },
    ],
  });

  console.log("Seed concluído!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
