import { prisma } from "../lib/prisma";
import { detectLawyerTag } from "../lib/jusbrasilEmailSync";

async function main() {
  const pubs = await prisma.publication.findMany({ where: { lawyerTag: null } });
  let updated = 0;
  for (const p of pubs) {
    const tag = detectLawyerTag(p.content);
    if (tag) {
      await prisma.publication.update({ where: { id: p.id }, data: { lawyerTag: tag } });
      updated++;
    }
  }
  console.log(`Publicações verificadas: ${pubs.length}. Atualizadas com advogado identificado: ${updated}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
