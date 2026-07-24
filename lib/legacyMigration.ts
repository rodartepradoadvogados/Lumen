/**
 * Lógica compartilhada de migração de dados do site legado (rp-financeiro, single-tenant)
 * pra um Office do Lúmen (multi-tenant). Usada tanto pelo script de linha de comando
 * (scripts/migrate-from-legacy.ts) quanto pela rota HTTP (app/api/admin/migrate-legacy/route.ts,
 * pra quando não há acesso a terminal — só um navegador).
 *
 * Por que isso é seguro de rodar de forma genérica: o schema do Lúmen é um fork fiel do
 * rp-financeiro — a ÚNICA diferença de coluna em cada modelo compartilhado é a adição de
 * officeId (+ relação office). Confirmado campo a campo antes de escrever este módulo.
 * Por isso a cópia não precisa saber a forma de cada tabela: lê "SELECT *" da origem e
 * reinsere na mesma tabela do destino, só acrescentando officeId.
 */

import { PrismaClient } from "@prisma/client";

// Ordem topológica calculada a partir das relações do schema.prisma (pais antes de filhos).
export const TABELAS_POR_OFFICE = [
  "User",
  "Notice",
  "LoginSession",
  "Client",
  "Lawyer",
  "Supplier",
  "Assessoria",
  "Case",
  "KanbanColumn",
  "Attendance",
  "Publication",
  "Licitacao",
  "Task",
  "TaskTypePoints",
  "WorkflowTemplate",
  "WorkflowStep",
  "Comment",
  "Mention",
  "WhatsappMessage",
  "EmailMessage",
  "Attachment",
  "DocumentTemplate",
  "DeletionRequest",
  "FinancialCategory",
  "CostCenter",
  "Payable",
  "Receivable",
  "AssessoriaDocumento",
  "Honorario",
  "BlogPost",
  "Photo",
];

// Tabelas do robô Python: compartilhadas/globais, sem officeId (ver comentário em
// prisma/schema.prisma sobre RoboPublicacao/RoboAndamento/RoboProcessoMonitorado/
// RoboExecucaoLog) — copiadas como estão, sem carimbo de escritório.
export const TABELAS_GLOBAIS = ["publicacoes", "andamentos", "processos_monitorados", "execucao_log"];

// Deliberadamente NÃO migradas:
// - GoogleCredential: tokens OAuth são específicos do client/app que os emitiu, não funcionam
//   copiados pra outro projeto — reconecte o Drive/Gmail do escritório em Configurações depois
//   (mesma conta Google de antes, pra que arquivos/pastas já existentes no Drive continuem
//   resolvendo).
// - WhatsappConfig: não existe no site legado (funcionalidade nova do Lúmen).
// - PushSubscription: não tem officeId (só userId) — e mesmo que tivesse, uma inscrição de
//   push é presa à origem (domínio) que a criou, então uma inscrição do rp-financeiro não
//   funciona no domínio novo do Lúmen de qualquer jeito. Usuários só precisam reativar as
//   notificações push depois de acessar o Lúmen pela primeira vez.

export type MigrationLog = { line: string }[];

async function limparDadosPlaceholderDoCadastro(destDb: PrismaClient, officeId: string, log: (msg: string) => void) {
  // O cadastro público (lib/actions/signup.ts) já cria, na hora, um usuário admin + Kanban e
  // Plano de Contas padrão (lib/defaultOfficeData.ts) pro escritório recém-criado. Se o
  // escritório de destino é o mesmo que acabou de se cadastrar (0 processos, 0 financeiro —
  // nenhuma atividade real ainda), esse placeholder precisa sair antes de trazer os dados de
  // verdade do site legado, senão duplica Kanban/Plano de Contas e o usuário admin colide por
  // e-mail (User.email é único globalmente). Como o escritório é novo, isso é seguro: nada
  // real depende ainda dessas linhas.
  //
  // Ordem de exclusão respeita FK: LoginSession referencia User, então sai primeiro.
  await destDb.$executeRawUnsafe(`DELETE FROM "LoginSession" WHERE "officeId" = $1`, officeId);
  const usersDeleted = await destDb.$executeRawUnsafe(`DELETE FROM "User" WHERE "officeId" = $1`, officeId);
  const kanbanDeleted = await destDb.$executeRawUnsafe(`DELETE FROM "KanbanColumn" WHERE "officeId" = $1`, officeId);
  const catsDeleted = await destDb.$executeRawUnsafe(`DELETE FROM "FinancialCategory" WHERE "officeId" = $1`, officeId);
  log(
    `Placeholder do cadastro removido: ${usersDeleted} usuário(s), ${kanbanDeleted} coluna(s) de kanban, ` +
      `${catsDeleted} categoria(s) financeira(s) — serão substituídos pelos dados reais do site legado.`
  );
}

async function assertOfficeSemDados(destDb: PrismaClient, tableName: string, officeId: string) {
  const rows = await destDb.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "${tableName}" WHERE "officeId" = $1`, officeId);
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    throw new Error(
      `Tabela "${tableName}" já tem ${count} linha(s) para este escritório — abortando pra não duplicar/colidir IDs. ` +
        `Isso normalmente significa que a migração já rodou antes.`
    );
  }
}

async function assertTabelaGlobalVazia(destDb: PrismaClient, tableName: string) {
  const rows = await destDb.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "${tableName}"`);
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    throw new Error(`Tabela global "${tableName}" já tem ${count} linha(s) — abortando pra não duplicar.`);
  }
}

async function copiarTabela(sourceDb: PrismaClient, destDb: PrismaClient, tableName: string, officeId: string | null): Promise<number> {
  if (officeId) {
    await assertOfficeSemDados(destDb, tableName, officeId);
  } else {
    await assertTabelaGlobalVazia(destDb, tableName);
  }

  const rows = await sourceDb.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tableName}"`);
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const destColumns = officeId ? [...columns, "officeId"] : columns;
  const quotedCols = destColumns.map((c) => `"${c}"`).join(", ");
  const placeholders = destColumns.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    if (officeId) values.push(officeId);
    await destDb.$executeRawUnsafe(insertSql, ...values);
  }

  return rows.length;
}

export async function migrarDadosLegado(options: {
  sourceUrl: string;
  destDb: PrismaClient;
  officeSlug: string;
  officeName: string;
}): Promise<{ lines: string[]; totalPorOffice: number; totalGlobais: number }> {
  const { sourceUrl, destDb, officeSlug, officeName } = options;
  const lines: string[] = [];
  const log = (msg: string) => lines.push(msg);

  const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl } } });

  try {
    await sourceDb.$connect();

    let office = await destDb.office.findUnique({ where: { slug: officeSlug } });
    if (!office) {
      office = await destDb.office.create({ data: { name: officeName, slug: officeSlug } });
      log(`Office criado: "${office.name}" (${office.id}).`);
    } else {
      log(`Usando Office já existente: "${office.name}" (${office.id}).`);
    }
    const officeId = office.id;

    await limparDadosPlaceholderDoCadastro(destDb, officeId, log);

    let totalPorOffice = 0;
    for (const tableName of TABELAS_POR_OFFICE) {
      const n = await copiarTabela(sourceDb, destDb, tableName, officeId);
      log(`  ${tableName}: ${n} linha(s) copiada(s)`);
      totalPorOffice += n;
    }

    let totalGlobais = 0;
    for (const tableName of TABELAS_GLOBAIS) {
      const n = await copiarTabela(sourceDb, destDb, tableName, null);
      log(`  [global] ${tableName}: ${n} linha(s) copiada(s)`);
      totalGlobais += n;
    }

    log(`Concluído: ${totalPorOffice} linha(s) carimbada(s) com officeId + ${totalGlobais} linha(s) global(is).`);
    log(
      "Lembretes pós-migração: (1) reconectar Google Drive/Gmail em Configurações com a MESMA conta " +
        "Google de antes; (2) configurar o WhatsApp do escritório se for usar; (3) o usuário admin " +
        "criado no cadastro foi substituído pelo usuário real migrado — faça login de novo usando a " +
        "senha do site antigo (rp-financeiro), não a que você acabou de criar no cadastro do Lúmen."
    );

    return { lines, totalPorOffice, totalGlobais };
  } finally {
    await sourceDb.$disconnect();
  }
}
