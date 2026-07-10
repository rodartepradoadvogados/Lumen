import { prisma } from "../lib/prisma";
import { contentKey } from "../lib/jusbrasilEmailSync";

// Encontra publicações duplicadas pelo mesmo critério do sync:
// mesma data de publicação (dia) + mesmo processNumberRaw + primeiros 200 chars do conteúdo.
// Mantém a mais antiga (createdAt asc) e apaga as demais.
async function main() {
  const pubs = await prisma.publication.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, publishedAt: true, processNumberRaw: true, content: true },
  });

  const seen = new Map<string, string>(); // groupKey -> id da mais antiga
  const toDelete: string[] = [];

  for (const p of pubs) {
    const day = new Date(p.publishedAt.getFullYear(), p.publishedAt.getMonth(), p.publishedAt.getDate())
      .toISOString()
      .slice(0, 10);
    const groupKey = `${day}|${p.processNumberRaw ?? ""}|${contentKey(p.content)}`;
    if (seen.has(groupKey)) {
      toDelete.push(p.id);
    } else {
      seen.set(groupKey, p.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.publication.deleteMany({ where: { id: { in: toDelete } } });
  }

  console.log(`Publicações analisadas: ${pubs.length}. Duplicatas removidas: ${toDelete.length}. Restantes: ${pubs.length - toDelete.length}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
