import type { Prisma, PrismaClient, KanbanColumn, FinancialCategory } from "@prisma/client";

// ============================================================================
// Dados padrão de um Office novo (Fase 2) — colunas de Kanban e plano de contas
// de exemplo, aplicados tanto pelo seed de demonstração quanto pelo cadastro
// público (lib/actions/signup.ts) para que todo escritório comece com uma
// base de trabalho pronta em vez de telas vazias.
// ============================================================================

type Db = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_KANBAN_COLUMNS: { name: string; color: string; isDoneCol?: boolean }[] = [
  { name: "A Fazer", color: "#94a3b8" },
  { name: "Em Andamento", color: "#b8904f" },
  { name: "Aguardando", color: "#6b7fae" },
  { name: "Concluído", color: "#2f7d4f", isDoneCol: true },
];

export type CatNode = { code: string; name: string; kind: string; children?: CatNode[] };

export const DEFAULT_CHART_OF_ACCOUNTS: CatNode[] = [
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

/** Cria as 4 colunas padrão do Kanban para um escritório novo, na ordem A Fazer → Concluído. */
export async function createDefaultKanbanColumns(db: Db, officeId: string): Promise<KanbanColumn[]> {
  const created: KanbanColumn[] = [];
  for (const [i, col] of DEFAULT_KANBAN_COLUMNS.entries()) {
    created.push(
      await db.kanbanColumn.create({
        data: { officeId, name: col.name, color: col.color, order: i, isDoneCol: col.isDoneCol ?? false },
      })
    );
  }
  return created;
}

/** Cria o plano de contas padrão (receitas/despesas) para um escritório novo. Retorna um mapa código → categoria criada. */
export async function createDefaultChartOfAccounts(db: Db, officeId: string): Promise<Record<string, FinancialCategory>> {
  const catByCode: Record<string, FinancialCategory> = {};
  async function createTree(nodes: CatNode[], parentId: string | null, order: number) {
    for (const [i, node] of nodes.entries()) {
      const created = await db.financialCategory.create({
        data: { officeId, code: node.code, name: node.name, kind: node.kind, parentId: parentId ?? undefined, order: order + i },
      });
      catByCode[node.code] = created;
      if (node.children) await createTree(node.children, created.id, 0);
    }
  }
  await createTree(DEFAULT_CHART_OF_ACCOUNTS, null, 0);
  return catByCode;
}

/** Aplica os dois conjuntos de dados padrão (kanban + plano de contas) a um escritório novo. */
export async function seedDefaultOfficeData(
  db: Db,
  officeId: string
): Promise<{ columns: KanbanColumn[]; categories: Record<string, FinancialCategory> }> {
  const columns = await createDefaultKanbanColumns(db, officeId);
  const categories = await createDefaultChartOfAccounts(db, officeId);
  return { columns, categories };
}
