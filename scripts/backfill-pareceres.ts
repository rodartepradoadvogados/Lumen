// Backfill: transforma cada AssessoriaDocumento antigo (docType="PARECER", parecerId nulo — ou
// seja, cadastrado ANTES de Parecer virar uma pasta de verdade, ver model Parecer em
// prisma/schema.prisma) em um Parecer próprio, com o mesmo nome e a mesma data, e amarra aquele
// documento a ele (AssessoriaDocumento.parecerId).
//
// Por quê: até esta entrega, "adicionar parecer" criava direto um AssessoriaDocumento com
// docType="PARECER" — um arquivo = um parecer, sem agrupador. Agora Parecer é o agrupador (nome +
// data + descrição + pasta própria no Drive/OneDrive/Dropbox) e cada documento aponta pra ele via
// parecerId. Este script fecha a lacuna para quem já tinha pareceres cadastrados: cria, para cada
// documento órfão, um Parecer com o mesmo nome/data e liga o documento a ele.
//
// A pasta no armazenamento (Parecer.driveFolderId) fica DE PROPÓSITO nula aqui — não criamos uma
// pasta nova para um documento que já tem link próprio (driveUrl) só para satisfazer o campo. A
// pasta é criada sozinha (getOrCreateParecerFolder, ver lib/googleDrive.ts / lib/oneDriveStorage.ts
// / lib/dropboxStorage.ts) na primeira vez que alguém enviar um NOVO documento para dentro desse
// parecer pela tela (ver components/assessoria/ParecerFolderRow.tsx) — até lá, o parecer "velho"
// funciona exatamente como antes: um agrupador com um único documento, cujo link já existente
// continua abrindo normalmente.
//
// Idempotente: só processa documentos com parecerId ainda nulo — rodar de novo depois de já ter
// rodado uma vez não duplica nada (o segundo run não encontra mais nenhum documento órfão).
//
// NÃO FOI EXECUTADO neste ambiente — o ambiente de desenvolvimento não tem acesso à porta 5432 do
// banco Neon (bloqueio de rede proposital do ambiente de trabalho). Só TypeScript-verificado
// (npx tsc --noEmit -p .). Rodar manualmente, com DATABASE_URL apontando para o banco de
// PRODUÇÃO (ou uma cópia dele), com:
//
//   npx tsx scripts/backfill-pareceres.ts
//
// Enquanto este script não roda, a tela NÃO esconde os pareceres antigos: eles continuam
// aparecendo soltos na aba "Pareceres, Processos e Casos" da Assessoria (ver `pareceresSoltos` em
// components/assessoria/AssessoriaProcessosCasosTab.tsx), só sem o agrupamento em pasta.

import { prisma } from "../lib/prisma";

async function main() {
  const orfaos = await prisma.assessoriaDocumento.findMany({
    where: { docType: "PARECER", parecerId: null },
    orderBy: { date: "asc" },
  });

  let criados = 0;
  for (const doc of orfaos) {
    const parecer = await prisma.parecer.create({
      data: {
        officeId: doc.officeId,
        assessoriaId: doc.assessoriaId,
        name: doc.name,
        date: doc.date,
        createdById: doc.uploadedById,
        // driveFolderId fica nulo de propósito — ver comentário no topo deste arquivo.
      },
    });
    await prisma.assessoriaDocumento.update({ where: { id: doc.id }, data: { parecerId: parecer.id } });
    criados++;
  }

  console.log(`Documentos PARECER órfãos encontrados: ${orfaos.length}. Pareceres criados e amarrados: ${criados}.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
