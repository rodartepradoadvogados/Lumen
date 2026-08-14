// Conferência (SÓ LEITURA — não altera nada) das Publication que podem ter sido gravadas no
// escritório ERRADO pelo bug corrigido em lib/roboBridge.ts.
//
// O QUE ERA O BUG: carregarIndicesDeRoteamento montava o índice de roteamento apenas com Case e
// User de escritórios `status: "ATIVA"`, e resolverOffice, ao não encontrar match, caía num
// fallback para o escritório INTERNO (dono da plataforma). Como o cron de billing marca sozinho
// um escritório inadimplente como SUSPENSA (lib/actions/billing.ts) e o robô continua capturando
// os processos dele, as publicações judiciais desse escritório-cliente passavam a ser gravadas
// dentro do escritório do dono da plataforma — quebra de sigilo entre bancas.
//
// COMO ESTE SCRIPT ENCONTRA OS SUSPEITOS: uma Publication do robô (source DJEN ou DATAJUD)
// gravada no escritório interno, SEM caseId, cujo processNumberRaw casa com um Case de OUTRO
// escritório. Esse cruzamento é a assinatura do desvio: o processo tem dono conhecido, e a
// publicação dele não está lá.
//
// Também lista, à parte, as publicações do robô no escritório interno sem caseId e sem dono
// identificável — essas podem ser legítimas (processo do próprio escritório interno ainda não
// cadastrado) ou resto do mesmo bug; exigem olho humano, por isso não são afirmadas como vazadas.
//
// NÃO CORRIGE NADA DE PROPÓSITO. Mover Publication entre escritórios é decisão de negócio (e
// possivelmente de comunicação ao cliente afetado, a depender da avaliação de LGPD) — não é algo
// que um script deva fazer sozinho. O objetivo aqui é dimensionar o problema.
//
// NÃO FOI EXECUTADO neste ambiente: porta 5432 bloqueada. Rodar com DATABASE_URL de produção:
//
//   npx tsx scripts/auditar-publicacoes-mal-roteadas.ts

import { prisma } from "../lib/prisma";

function normalizarNumeroProcesso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length !== 20 ? null : digits;
}

async function main() {
  const interno = await prisma.office.findFirst({ where: { isInternal: true }, select: { id: true, name: true } });
  if (!interno) {
    console.log("Nenhum escritório marcado como isInternal — nada a conferir.");
    return;
  }

  const suspeitas = await prisma.publication.findMany({
    where: { officeId: interno.id, source: { in: ["DJEN", "DATAJUD"] }, caseId: null },
    select: { id: true, source: true, processNumberRaw: true, publishedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Índice de dono real por número de processo, de TODOS os escritórios (sem filtro de status —
  // é exatamente o filtro que causava o bug).
  const casos = await prisma.case.findMany({
    where: { processNumber: { not: null } },
    select: { officeId: true, processNumber: true, office: { select: { name: true, status: true } } },
  });
  const donoPorProcesso = new Map<string, { officeId: string; nome: string; status: string }>();
  for (const c of casos) {
    const n = normalizarNumeroProcesso(c.processNumber);
    if (n) donoPorProcesso.set(n, { officeId: c.officeId, nome: c.office.name, status: c.office.status });
  }

  const vazadas: { id: string; processo: string; donoNome: string; donoStatus: string; em: string }[] = [];
  const semDono: typeof suspeitas = [];

  for (const p of suspeitas) {
    const n = normalizarNumeroProcesso(p.processNumberRaw);
    const dono = n ? donoPorProcesso.get(n) : undefined;
    if (dono && dono.officeId !== interno.id) {
      vazadas.push({
        id: p.id,
        processo: p.processNumberRaw ?? "(sem número)",
        donoNome: dono.nome,
        donoStatus: dono.status,
        em: p.createdAt.toISOString().slice(0, 10),
      });
    } else if (!dono) {
      semDono.push(p);
    }
  }

  console.log(`Escritório interno: ${interno.name}`);
  console.log(`Publicações do robô nele, sem caso vinculado: ${suspeitas.length}`);
  console.log(`\n>>> CONFIRMADAS COMO DE OUTRO ESCRITÓRIO: ${vazadas.length}`);
  const porDono = new Map<string, number>();
  for (const v of vazadas) porDono.set(`${v.donoNome} (${v.donoStatus})`, (porDono.get(`${v.donoNome} (${v.donoStatus})`) ?? 0) + 1);
  for (const [nome, qtd] of [...porDono.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${qtd.toString().padStart(4)}  ${nome}`);
  }
  if (vazadas.length > 0) {
    console.log("\n  Primeiras 20 (id | processo | dono real | criada em):");
    for (const v of vazadas.slice(0, 20)) console.log(`  ${v.id} | ${v.processo} | ${v.donoNome} | ${v.em}`);
  }
  console.log(`\n>>> SEM DONO IDENTIFICÁVEL (exigem análise humana): ${semDono.length}`);

  console.log(
    "\nNada foi alterado. Decidir caso a caso: mover a Publication para o escritório dono," +
      " apagar, ou manter — e avaliar dever de comunicação ao cliente afetado."
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
