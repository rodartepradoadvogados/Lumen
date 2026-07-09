import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  await prisma.costCenter.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.deletionRequest.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.case.deleteMany();
  await prisma.client.deleteMany();
  await prisma.lawyer.deleteMany();
  await prisma.user.deleteMany();

  console.log("Criando equipe...");
  const jairo = await prisma.user.create({
    data: {
      name: "Jairo Rodarte",
      email: "jairo@rodarteprado.com.br",
      role: "Sócio",
      oab: "OAB/GO 78.295",
      color: "#0f1f3d",
      username: "JairoRodarte",
      passwordHash: await bcrypt.hash("Goiabada1#", 10),
      isAdmin: true,
    },
  });
  const rodrigo = await prisma.user.create({
    data: {
      name: "Rodrigo Prado",
      email: "rodrigo@rodarteprado.com.br",
      role: "Sócio",
      oab: "OAB/GO 32.943",
      color: "#8a6a1f",
      username: "RodrigoPrado",
      passwordHash: await bcrypt.hash("Goiabada1", 10),
      isAdmin: true,
    },
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
  await prisma.client.create({ data: { name: "Geral", type: "PJ", notes: "Cliente genérico para lançamentos financeiros gerais do escritório." } });

  console.log("Advogados parceiros e adversos...");
  const advParceiro = await prisma.lawyer.create({ data: { name: "Fernanda Lima", oab: "OAB/GO 33.210", side: "PARCEIRO", firm: "Lima & Associados", phone: "(62) 99888-1122" } });

  console.log("Casos...");
  const caso1 = await prisma.case.create({
    data: {
      title: "Multipedras Revestimentos Eireli x Estado de Roraima",
      type: "JUDICIAL", area: "Tributário", status: "ATIVO",
      processNumber: "0801234-56.2024.8.23.0010", court: "1ª Vara da Fazenda Pública - RR",
      caseValue: 480000, instance: "1º Grau",
      clientId: multipedras.id, opposingPartyName: "Estado de Roraima", opposingPartyRole: "REU",
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
      clientId: pneulandia.id, opposingPartyName: "Lourival Barbosa Santos", opposingPartyRole: "REU",
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
      clientId: bancoBrasil.id, opposingPartyName: "Village Administração de Serviços Ltda", opposingPartyRole: "REU",
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
      clientId: carlosSilva.id, opposingPartyName: "Estado de Goiás", opposingPartyRole: "REU",
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

  console.log("Plano de contas...");
  type CatNode = { code: string; name: string; kind: string; children?: CatNode[] };
  const chart: CatNode[] = [
    {
      code: "1", name: "Receita", kind: "RECEITA", children: [
        { code: "1.1", name: "Honorários Contratuais", kind: "RECEITA" },
        { code: "1.2", name: "Honorários Sucumbenciais", kind: "RECEITA" },
        { code: "1.3", name: "Honorários de Consultoria", kind: "RECEITA" },
        { code: "1.4", name: "Reembolso", kind: "RECEITA" },
        { code: "1.5", name: "Rendimentos Financeiros", kind: "RECEITA" },
        { code: "1.6", name: "Outras Receitas", kind: "RECEITA" },
      ],
    },
    {
      code: "2", name: "Despesa", kind: "DESPESA", children: [
        {
          code: "2.1", name: "Tributos e Contribuições", kind: "DESPESA", children: [
            {
              code: "2.1.1", name: "Impostos", kind: "DESPESA", children: [
                { code: "2.1.1.1", name: "IRPJ", kind: "DESPESA" },
                { code: "2.1.1.2", name: "IRPF", kind: "DESPESA" },
                { code: "2.1.1.3", name: "ICMS", kind: "DESPESA" },
                { code: "2.1.1.4", name: "ISS", kind: "DESPESA" },
              ],
            },
            { code: "2.1.2", name: "Contribuição Social", kind: "DESPESA" },
            { code: "2.1.3", name: "FGTS", kind: "DESPESA" },
            { code: "2.1.4", name: "DCTF", kind: "DESPESA" },
            { code: "2.1.5", name: "Simples Nacional", kind: "DESPESA" },
            { code: "2.1.6", name: "Taxas", kind: "DESPESA" },
          ],
        },
        {
          code: "2.2", name: "Folha e Pró-labore", kind: "DESPESA", children: [
            { code: "2.2.1", name: "Salário", kind: "DESPESA" },
            { code: "2.2.2", name: "Pró-labore", kind: "DESPESA" },
            { code: "2.2.3", name: "Pagamento de Advogado Parceiro", kind: "DESPESA" },
          ],
        },
        {
          code: "2.3", name: "Estrutura e Ocupação", kind: "DESPESA", children: [
            { code: "2.3.1", name: "Aluguel", kind: "DESPESA" },
            { code: "2.3.2", name: "Condomínio", kind: "DESPESA" },
            { code: "2.3.3", name: "IPTU", kind: "DESPESA" },
          ],
        },
        {
          code: "2.4", name: "Tecnologia", kind: "DESPESA", children: [
            { code: "2.4.1", name: "Software Jurídico", kind: "DESPESA" },
            { code: "2.4.2", name: "Ferramentas de IA", kind: "DESPESA" },
          ],
        },
        {
          code: "2.5", name: "Marketing", kind: "DESPESA", children: [
            { code: "2.5.1", name: "Marketing", kind: "DESPESA" },
            { code: "2.5.2", name: "Tráfego Pago", kind: "DESPESA" },
          ],
        },
        {
          code: "2.6", name: "Serviços Profissionais", kind: "DESPESA", children: [
            { code: "2.6.1", name: "Contador", kind: "DESPESA" },
            { code: "2.6.2", name: "Anuidade OAB", kind: "DESPESA" },
          ],
        },
        {
          code: "2.7", name: "Financeiras e Bancárias", kind: "DESPESA", children: [
            { code: "2.7.1", name: "Tarifas Bancárias", kind: "DESPESA" },
          ],
        },
        {
          code: "2.8", name: "Outras Despesas", kind: "DESPESA", children: [
            { code: "2.8.1", name: "Ajuste", kind: "DESPESA" },
          ],
        },
      ],
    },
  ];

  const catByCode: Record<string, { id: string }> = {};
  async function createTree(nodes: CatNode[], parentId: string | null, order: number) {
    for (const [i, node] of nodes.entries()) {
      const created = await prisma.financialCategory.create({
        data: { code: node.code, name: node.name, kind: node.kind, parentId: parentId ?? undefined, order: order + i },
      });
      catByCode[node.code] = created;
      if (node.children) await createTree(node.children, created.id, 0);
    }
  }
  await createTree(chart, null, 0);

  const catHonorarios = catByCode["1.1"];
  const catSucumbencia = catByCode["1.2"];
  const catAluguel = catByCode["2.3.1"];
  const catFolha = catByCode["2.2.1"];
  const catCustas = catByCode["2.1.6"];
  const catSoftware = catByCode["2.4.1"];
  const catMarketing = catByCode["2.5.1"];

  console.log("Centros de custo...");
  await prisma.costCenter.createMany({
    data: [
      { name: "Assessorias Jurídicas" },
      { name: "Gestão Patrimonial" },
      { name: "Outros" },
    ],
  });

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
    { kind: "PUBLICACAO", source: "PJE", content: "Intimação para manifestação sobre laudo pericial no prazo de 15 dias.", publishedAt: daysFromNow(-2), caseId: caso3.id },
    { kind: "PUBLICACAO", source: "DJE", content: "Sentença de procedência parcial publicada. Prazo recursal em curso.", publishedAt: daysFromNow(-1), caseId: caso1.id, read: true },
    { kind: "ANDAMENTO", source: "PJE", content: "Designada audiência de instrução e julgamento.", publishedAt: daysFromNow(-3), caseId: caso2.id },
    { kind: "ANDAMENTO", source: "ESAJ", content: "Determinada expedição de ofício para localização de endereço do executado.", publishedAt: daysFromNow(-6), caseId: caso4.id },
    { kind: "ANDAMENTO", source: "DJE", content: "Homologado acordo entre as partes.", publishedAt: daysFromNow(-10), caseId: caso5.id, read: true },
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
