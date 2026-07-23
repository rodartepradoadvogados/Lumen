import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { importFinanceCore } from "../lib/importers/importFinance";

function rowsFrom(path: string) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

async function main() {
  const office = await prisma.office.findFirstOrThrow();
  const rows = rowsFrom("C:/Users/jairo/Downloads/Financeiro.xlsx");
  console.log(`Importando ${rows.length} lançamentos financeiros para o escritório "${office.name}"...`);
  const result = await importFinanceCore(rows, office.id);
  console.log("Resultado:", JSON.stringify(result, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
