// Backfill: reprocessa o `content` de Publication (source DJEN/DATAJUD) que já foi gravado com
// marcação HTML crua (<html><head><style>...) em vez de texto simples — bug corrigido em
// lib/roboBridge.ts (agora usa converterHtmlParaTextoSimples, ver lib/htmlEntities.ts, antes só
// decodificava entidade e nunca tirava a tag). A correção só vale para publicações capturadas
// DAQUI PRA FRENTE; este script limpa o que já estava gravado antes dela.
//
// Só toca em registros que de fato têm tag HTML no content (mesma detecção de
// converterHtmlParaTextoSimples) — não reprocessa à toa uma publicação que já está em texto
// simples, mesmo que source seja DJEN/DATAJUD.
//
// NÃO FOI EXECUTADO neste ambiente — sem acesso ao banco de produção (mesma limitação de
// scripts/backfill-pareceres.ts). Rodar manualmente, com DATABASE_URL apontando para o banco de
// PRODUÇÃO (ou uma cópia dele), com:
//
//   npx tsx scripts/backfill-publicacoes-html.ts
//
// Idempotente: uma publicação já limpa (sem tag no content) não bate na detecção de novo, então
// rodar de novo depois de já ter rodado uma vez não muda nada.

import { prisma } from "../lib/prisma";
import { converterHtmlParaTextoSimples } from "../lib/htmlEntities";

const TEM_TAG_HTML = /<[a-z][\s\S]*>/i;

async function main() {
  const candidatas = await prisma.publication.findMany({
    where: { source: { in: ["DJEN", "DATAJUD"] } },
    select: { id: true, content: true },
  });

  const comMarcacao = candidatas.filter((p) => TEM_TAG_HTML.test(p.content));

  let corrigidas = 0;
  for (const p of comMarcacao) {
    const limpo = converterHtmlParaTextoSimples(p.content);
    if (limpo === p.content) continue;
    await prisma.publication.update({ where: { id: p.id }, data: { content: limpo } });
    corrigidas++;
  }

  console.log(
    `Publicações DJEN/DATAJUD verificadas: ${candidatas.length}. Com marcação HTML: ${comMarcacao.length}. Corrigidas: ${corrigidas}.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
