// BACKFILL de `Attendance.ultimaAtividadeEm` — a chave de ordem da lista de Atendimentos da Central.
//
// REGRA: a atividade de um atendimento é a data da sua ÚLTIMA MENSAGEM de WhatsApp (entrada ou
// saída); sem mensagem, a data de criação do lead. É a mesma regra que `registrarMensagem`
// (lib/registrarMensagem.ts) mantém dali em diante, gravando a coluna na mesma transação da mensagem.
//
// COMO RODA EM PRODUÇÃO, SEM NINGUÉM: o script de build (package.json) executa, só em
// $VERCEL_ENV = production e nesta ordem, `prisma db push` (cria a coluna, com `now()` nas linhas
// que já existiam) e ESTE script (acerta cada linha). Tudo antes de o deploy virar o tráfego, então
// a lista nunca é servida com a coluna crua. Não há passo manual.
//
// IDEMPOTENTE E BARATO DE REPETIR: é um único UPDATE que só toca a linha cujo valor DIFERE do
// esperado (`IS DISTINCT FROM`). Rodar de novo — a cada deploy, ou à mão — não escreve nada quando
// tudo já está certo, e conserta qualquer deriva (uma mensagem gravada por uma versão antiga do
// código durante o intervalo entre o build e a virada do tráfego).
//
// NUNCA DERRUBA O BUILD: se falhar (banco fora, permissão), avisa e sai com 0. O custo de falhar é
// pequeno e conhecido — a lista cai na ordem de CRIAÇÃO (o desempate do orderBy, ver
// lib/atividadeDoAtendimento.ts), que é a de hoje — e derrubar o deploy por causa de uma ordem de
// lista seria o remédio pior que a doença.
//
// Uso manual: npx tsx scripts/backfill-ultima-atividade.ts   (DATABASE_URL no ambiente)
import { PrismaClient } from "@prisma/client";

const SQL = `
  UPDATE "Attendance" AS a
  SET "ultimaAtividadeEm" = alvo.atividade
  FROM (
    SELECT t.id, COALESCE(m.ultima, t."createdAt") AS atividade
    FROM "Attendance" AS t
    LEFT JOIN (
      SELECT "attendanceId", max("createdAt") AS ultima
      FROM "WhatsappMessage"
      GROUP BY "attendanceId"
    ) AS m ON m."attendanceId" = t.id
  ) AS alvo
  WHERE a.id = alvo.id
    AND a."ultimaAtividadeEm" IS DISTINCT FROM alvo.atividade
`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[backfill-ultima-atividade] sem DATABASE_URL — nada a fazer.");
    return;
  }
  const prisma = new PrismaClient();
  try {
    const alteradas = await prisma.$executeRawUnsafe(SQL);
    console.log(`[backfill-ultima-atividade] ${alteradas} atendimento(s) acertado(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error("[backfill-ultima-atividade] FALHOU (o build segue): a lista usa a ordem de criação como desempate.", erro);
  process.exit(0);
});
