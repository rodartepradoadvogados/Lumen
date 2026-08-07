// Processos cadastrados antes da Matéria virar multi-seleção (Case.materias) só têm o antigo
// Case.area (string única) preenchido — materias fica no default [] até o processo ser reeditado.
// Isso deixaria a página de Processos, Relatórios e Painel sem esses processos nos filtros/
// agrupamentos por matéria, que agora leem só `materias`. Preenche `materias = [area]` uma única
// vez para todo processo nessa situação; não mexe em quem já tem `materias` preenchido.
import { prisma } from "../lib/prisma";

async function main() {
  const candidates = await prisma.case.findMany({
    where: { materias: { isEmpty: true }, area: { not: null } },
    select: { id: true, area: true },
  });

  let updated = 0;
  for (const c of candidates) {
    if (!c.area) continue;
    await prisma.case.update({ where: { id: c.id }, data: { materias: [c.area] } });
    updated++;
  }
  console.log(`Processos verificados: ${candidates.length}. Atualizados com materias preenchido a partir de area: ${updated}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
