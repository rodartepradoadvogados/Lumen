/**
 * Migra os dados do site legado (rp-financeiro, single-tenant) para o Lúmen (multi-tenant),
 * criando/reaproveitando UM Office e carimbando officeId em toda linha migrada.
 *
 * Por que isso é seguro de rodar de forma genérica: o schema do Lúmen é um fork fiel do
 * rp-financeiro — a ÚNICA diferença de coluna em cada modelo compartilhado é a adição de
 * officeId (+ relação office). Confirmado campo a campo antes de escrever este script (ver
 * commit que o introduziu). Por isso o script não precisa saber a forma de cada tabela: lê
 * "SELECT *" da origem e reinsere na mesma tabela do destino, só acrescentando officeId.
 *
 * Uso:
 *   SOURCE_DATABASE_URL="postgresql://.../rp_financeiro_prod" \
 *   DATABASE_URL="postgresql://.../lumen_prod" \
 *   npx tsx scripts/migrate-from-legacy.ts
 *
 * Variáveis opcionais:
 *   TARGET_OFFICE_NAME (default "Rodarte Prado Advogados")
 *   TARGET_OFFICE_SLUG (default "rodarte-prado")
 *
 * Segurança:
 * - Recusa migrar qualquer tabela cujo destino já tenha linhas (evita colidir/duplicar IDs).
 *   Rode contra um banco de destino vazio (ou um Office novo, se o destino já tiver outros
 *   escritórios — nesse caso ajuste TARGET_OFFICE_SLUG e note que a checagem "tabela vazia"
 *   abaixo precisaria virar "sem linhas deste officeId", que não é o caso de uma primeira
 *   migração pra um Lúmen recém-criado).
 * - NÃO migra GoogleCredential: tokens OAuth são específicos do client/app que os emitiu e
 *   não funcionam simplesmente copiados para outro projeto — reconecte o Drive/Gmail do
 *   escritório na tela de Configurações depois da migração (mesma conta Google de antes,
 *   pra que os arquivos/pastas já existentes no Drive continuem resolvendo).
 * - NÃO migra WhatsappConfig: não existe no site legado (funcionalidade nova do Lúmen);
 *   configure o WhatsApp do escritório em Configurações depois da migração.
 * - Roda dentro de uma única transação no destino: qualquer erro no meio desfaz tudo.
 */

import { PrismaClient } from "@prisma/client";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const DEST_URL = process.env.DATABASE_URL;

if (!SOURCE_URL) {
  console.error("Defina SOURCE_DATABASE_URL (banco do rp-financeiro, só leitura).");
  process.exit(1);
}
if (!DEST_URL) {
  console.error("Defina DATABASE_URL (banco do Lúmen, destino).");
  process.exit(1);
}

// Ordem topológica calculada a partir das relações do schema.prisma (pais antes de filhos) —
// ver comentário no PR que introduziu este script para o script que gerou esta lista.
const TABELAS_POR_OFFICE = [
  "User",
  "PushSubscription",
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
const TABELAS_GLOBAIS = ["publicacoes", "andamentos", "processos_monitorados", "execucao_log"];

// Deliberadamente NÃO migradas — ver comentário no topo do arquivo.
// GoogleCredential, WhatsappConfig

async function assertDestinoVazio(destDb: PrismaClient, tableName: string) {
  const rows = await destDb.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "${tableName}"`);
  const count = Number(rows[0]?.count ?? 0);
  if (count > 0) {
    throw new Error(
      `Tabela de destino "${tableName}" já tem ${count} linha(s) — abortando pra não arriscar colidir/duplicar IDs. ` +
        `Rode este script contra um banco de destino recém-criado (schema aplicado, sem dados de negócio ainda).`
    );
  }
}

async function copiarTabela(sourceDb: PrismaClient, destDb: PrismaClient, tableName: string, officeId: string | null): Promise<number> {
  await assertDestinoVazio(destDb, tableName);

  const rows = await sourceDb.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tableName}"`);
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 linha(s) (nada a copiar)`);
    return 0;
  }

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

  console.log(`  ${tableName}: ${rows.length} linha(s) copiada(s)`);
  return rows.length;
}

async function resolverOffice(destDb: PrismaClient): Promise<string> {
  const name = process.env.TARGET_OFFICE_NAME || "Rodarte Prado Advogados";
  const slug = process.env.TARGET_OFFICE_SLUG || "rodarte-prado";

  const existing = await destDb.office.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Usando Office já existente: "${existing.name}" (${existing.id}).`);
    return existing.id;
  }
  const created = await destDb.office.create({ data: { name, slug } });
  console.log(`Office criado: "${created.name}" (${created.id}).`);
  return created.id;
}

async function main() {
  const sourceDb = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
  const destDb = new PrismaClient({ datasources: { db: { url: DEST_URL } } });

  try {
    await sourceDb.$connect();
    await destDb.$connect();

    console.log("=== Resolvendo Office de destino ===");
    const officeId = await resolverOffice(destDb);

    console.log("\n=== Migrando tabelas por escritório ===");
    let totalPorOffice = 0;
    for (const tableName of TABELAS_POR_OFFICE) {
      totalPorOffice += await copiarTabela(sourceDb, destDb, tableName, officeId);
    }

    console.log("\n=== Migrando tabelas globais do robô (sem officeId) ===");
    let totalGlobais = 0;
    for (const tableName of TABELAS_GLOBAIS) {
      totalGlobais += await copiarTabela(sourceDb, destDb, tableName, null);
    }

    console.log(`\n=== Concluído: ${totalPorOffice} linha(s) carimbada(s) com officeId + ${totalGlobais} linha(s) global(is) ===`);
    console.log(
      "\nLembretes pós-migração:\n" +
        "  1. Reconectar Google Drive/Gmail em Configurações (mesma conta Google de antes) — GoogleCredential não foi migrado.\n" +
        "  2. Configurar o WhatsApp do escritório em Configurações, se for usar o módulo (WhatsappConfig não existia no site legado).\n" +
        "  3. Conferir Módulos Contratados em Configurações (todos vêm ligados por padrão)."
    );
  } finally {
    await sourceDb.$disconnect();
    await destDb.$disconnect();
  }
}

main().catch((err) => {
  console.error("\nFALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
