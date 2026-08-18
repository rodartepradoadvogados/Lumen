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
  // Escopado por escritório — sem isso, o casamento por nome comparava a publicação de UM
  // escritório contra os clientes de TODOS, podendo vincular a publicação de um tenant a um
  // Client de outro (mesmo bug que a versão de runtime, lib/jusbrasilEmailSync.ts:
  // findClientIdByName, já evita recebendo officeId).
  const pubs = await prisma.publication.findMany({ where: { caseId: null, clientId: null } });
  const officeIds = Array.from(new Set(pubs.map((p) => p.officeId)));
  const clientsByOffice = new Map<string, { id: string; name: string }[]>();
  for (const officeId of officeIds) {
    clientsByOffice.set(officeId, await prisma.client.findMany({ where: { officeId }, select: { id: true, name: true } }));
  }
  let updated = 0;
  for (const p of pubs) {
    const clientId = await findClientIdByName(p.content, clientsByOffice.get(p.officeId) ?? []);
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
