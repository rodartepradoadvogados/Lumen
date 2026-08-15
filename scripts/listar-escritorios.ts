// Só leitura — imprime id, nome e slug de todo escritório cadastrado, pra você achar o
// OBSIDIAN_OFFICE_ID do SEU escritório antes de rodar scripts/exportar-obsidian.ts.
//
// Uso: npx tsx scripts/listar-escritorios.ts

import { prisma } from "../lib/prisma";

async function main() {
  const escritorios = await prisma.office.findMany({
    select: { id: true, name: true, slug: true, isInternal: true },
    orderBy: { name: "asc" },
  });
  console.log("id".padEnd(30), "nome".padEnd(40), "slug");
  for (const o of escritorios) {
    console.log(o.id.padEnd(30), o.name.padEnd(40), o.slug, o.isInternal ? "(interno)" : "");
  }
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
