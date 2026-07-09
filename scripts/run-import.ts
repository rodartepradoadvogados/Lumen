import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { importCasesCore, importAgendaCore } from "../lib/importers/importCore";

function rowsFrom(path: string) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

async function main() {
  console.log("Limpando dados de demonstração (mantendo equipe, colunas do kanban, plano de contas, centros de custo)...");
  await prisma.mention.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.payable.deleteMany({ where: { caseId: { not: null } } });
  await prisma.receivable.deleteMany({ where: { caseId: { not: null } } });
  await prisma.attendance.deleteMany();
  await prisma.case.deleteMany();
  await prisma.client.deleteMany();
  await prisma.opposingParty.deleteMany();

  const caseRows = rowsFrom("C:/Users/jairo/Downloads/Processo.xlsx");
  console.log(`Importando ${caseRows.length} processos/casos...`);
  const caseResult = await importCasesCore(caseRows);
  console.log("Processos:", JSON.stringify(caseResult, null, 2));

  const agendaRows = rowsFrom("C:/Users/jairo/Downloads/Agenda.xlsx");
  console.log(`Importando ${agendaRows.length} itens de agenda...`);
  const agendaResult = await importAgendaCore(agendaRows);
  console.log("Agenda:", JSON.stringify(agendaResult, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
