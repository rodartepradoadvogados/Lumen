import { prisma } from "../lib/prisma";

async function findClientIdByName(content: string, clients: { id: string; name: string }[]): Promise<string | null> {
  const normalized = content.toLowerCase();
  for (const client of clients) {
    const name = client.name.trim().toLowerCase();
    if (name.length >= 5 && normalized.includes(name)) return client.id;
  }
  return null;
}

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const pubs = await prisma.publication.findMany({ where: { caseId: null, clientId: null } });
  let updated = 0;
  for (const p of pubs) {
    const clientId = await findClientIdByName(p.content, clients);
    if (clientId) {
      await prisma.publication.update({ where: { id: p.id }, data: { clientId } });
      updated++;
    }
  }
  console.log(`Publicações sem processo verificadas: ${pubs.length}. Vinculadas a um cliente: ${updated}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
