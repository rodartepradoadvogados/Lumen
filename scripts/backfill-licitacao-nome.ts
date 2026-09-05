// Preenche Licitacao.nome (campo novo, ver prisma/schema.prisma) com o texto de `objeto` em toda
// Licitacao criada antes desta entrega — sem isso, elas ficariam sem nome de gestão até alguém
// perceber. Rodar uma vez, manualmente, depois de `npx prisma db push`. Idempotente: só afeta
// linhas com nome ainda nulo.
import { prisma } from "../lib/prisma";

async function main() {
  const semNome = await prisma.licitacao.findMany({ where: { nome: null }, select: { id: true, objeto: true } });
  for (const l of semNome) {
    await prisma.licitacao.update({ where: { id: l.id }, data: { nome: l.objeto } });
  }
  console.log(`Licitações sem nome encontradas: ${semNome.length}. Todas preenchidas com o objeto (renomeáveis depois, se quiser).`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
