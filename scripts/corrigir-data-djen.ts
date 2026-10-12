// CORREÇÃO DE DATA das publicações do DJEN — as gravadas à meia-noite UTC passam para o meio-dia UTC.
//
// O DEFEITO: o DJEN entrega a data de disponibilização só com o dia ("2026-10-09"), e a ponte
// (lib/roboBridge.ts, parseDataOuFallback) fazia `new Date("2026-10-09")`, que é 00:00 UTC. Toda a
// tela formata e agrupa por dia de BRASÍLIA (UTC-3), onde isso é 21:00 do dia 8: as publicações do
// DJEN apareciam um dia antes da data real, não caíam no mesmo dia do e-mail do Jusbrasil sobre o
// mesmo ato (então o "mesmo ato por duas fontes" virava dois cartões) e a contagem de prazo partia de
// um dia antes. Medido em 12/10/2026: 148 de 148 itens do DJEN estavam à meia-noite UTC.
//
// A CORREÇÃO NOVA (parseDataOuFallback) já grava ao meio-dia UTC. ESTE SCRIPT acerta o que já estava
// gravado, uma vez, e é seguro repetir: depois de acertado nenhum item fica à meia-noite, então o
// segundo UPDATE não toca em nada.
//
// SÓ O DJEN. O Datajud entrega data COM hora; mexer nele mudaria a hora real de um movimento.
//
// REVERSÃO, se algum dia for preciso: `UPDATE "Publication" SET "publishedAt" = "publishedAt" - interval
// '12 hours' WHERE source = 'DJEN' AND ("publishedAt" AT TIME ZONE 'UTC')::time = '12:00:00'`.
//
// COMO RODA EM PRODUÇÃO: pelo script de build (package.json), só em $VERCEL_ENV = production, depois do
// `prisma db push` — mesma rota de scripts/backfill-ultima-atividade.ts. NUNCA derruba o build: se
// falhar, avisa e sai com 0 (o custo de falhar é a data continuar um dia antes, como já era).
//
// Uso manual: npx tsx scripts/corrigir-data-djen.ts   (DATABASE_URL no ambiente)
import { PrismaClient } from "@prisma/client";

const SQL = `
  UPDATE "Publication"
  SET "publishedAt" = "publishedAt" + interval '12 hours'
  WHERE source = 'DJEN'
    AND ("publishedAt" AT TIME ZONE 'UTC')::time = '00:00:00'
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[corrigir-data-djen] sem DATABASE_URL — nada a fazer.");
    return;
  }
  const prisma = new PrismaClient();
  try {
    const alteradas = await prisma.$executeRawUnsafe(SQL);
    console.log(`[corrigir-data-djen] ${alteradas} publicação(ões) do DJEN acertada(s) para o meio-dia UTC.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[corrigir-data-djen] FALHOU (o build segue): as datas do DJEN continuam um dia antes.", erro);
  process.exit(0);
});
