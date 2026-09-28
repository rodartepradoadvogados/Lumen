import { prisma } from "@/lib/prisma";

// ============================================================================
// QUANTO CADA ESCRITÓRIO USA O LÚMEN AGENT.
//
// A fonte é o registro de uso (`AssistantAuditLog`), que já existe desde o primeiro dia e grava
// cada pergunta, cada consulta e cada recusa, com escritório e usuário. Nada novo precisou ser
// coletado para esta tela — o dado já estava lá, cumprindo a obrigação da LGPD; agora ele também
// responde "quem usa isto, e quanto".
//
// AS RECUSAS APARECEM DE PROPÓSITO, e não como enfeite de completude. Uma recusa por falta de
// acesso ao financeiro é a regra do dono funcionando, e é bom vê-la acontecer. Uma recusa por
// TETO é outra conversa: significa que aquele escritório está batendo no limite de 60 perguntas
// por minuto, e alguém precisa decidir se o limite sobe ou se há uso automatizado indevido.
// Somar as duas num número só esconderia justamente a diferença que importa.
//
// Tudo em UMA consulta agregada por escritório, e não uma por escritório: a tela do painel mestre
// lista todos, e o número deles cresce com o negócio.
// ============================================================================

export type UsoDoAgente = {
  officeId: string;
  perguntas7d: number;
  perguntas30d: number;
  consultas7d: number;
  recusasFinanceiro7d: number;
  recusasTeto7d: number;
  pessoas7d: number;
  ultimaEm: string | null;
};

function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function usoPorEscritorio(officeIds: string[]): Promise<Map<string, UsoDoAgente>> {
  const mapa = new Map<string, UsoDoAgente>();
  if (officeIds.length === 0) return mapa;

  for (const id of officeIds) {
    mapa.set(id, {
      officeId: id,
      perguntas7d: 0,
      perguntas30d: 0,
      consultas7d: 0,
      recusasFinanceiro7d: 0,
      recusasTeto7d: 0,
      pessoas7d: 0,
      ultimaEm: null,
    });
  }

  const sete = diasAtras(7);
  const trinta = diasAtras(30);
  const onde = { officeId: { in: officeIds } };

  // `groupBy` em vez de N consultas: o painel lista todos os escritórios, e o número deles cresce.
  const [porAcao7d, perguntas30d, ultimas, linhas7d] = await Promise.all([
    prisma.assistantAuditLog.groupBy({
      by: ["officeId", "acao"],
      where: { ...onde, createdAt: { gte: sete } },
      _count: { _all: true },
    }),
    prisma.assistantAuditLog.groupBy({
      by: ["officeId"],
      where: { ...onde, acao: "PERGUNTA", createdAt: { gte: trinta } },
      _count: { _all: true },
    }),
    prisma.assistantAuditLog.groupBy({
      by: ["officeId"],
      where: onde,
      _max: { createdAt: true },
    }),
    // Pessoas distintas: `groupBy` por (escritório, usuário) e depois contar as linhas — o Prisma
    // não tem "distinct count" direto, e trazer os ids é barato numa janela de 7 dias.
    prisma.assistantAuditLog.groupBy({
      by: ["officeId", "userId"],
      where: { ...onde, acao: "PERGUNTA", createdAt: { gte: sete } },
    }),
  ]);

  for (const linha of porAcao7d) {
    const u = mapa.get(linha.officeId);
    if (!u) continue;
    const n = linha._count._all;
    if (linha.acao === "PERGUNTA") u.perguntas7d += n;
    else if (linha.acao === "FERRAMENTA") u.consultas7d += n;
    else if (linha.acao === "RECUSA_LIMITE") u.recusasTeto7d += n;
  }

  for (const linha of perguntas30d) {
    const u = mapa.get(linha.officeId);
    if (u) u.perguntas30d = linha._count._all;
  }

  for (const linha of ultimas) {
    const u = mapa.get(linha.officeId);
    if (u && linha._max.createdAt) u.ultimaEm = linha._max.createdAt.toISOString();
  }

  for (const linha of linhas7d) {
    const u = mapa.get(linha.officeId);
    if (u) u.pessoas7d += 1;
  }

  // As recusas de financeiro vivem dentro de `FERRAMENTA`, no campo `detalhe` — é lá que a rota
  // das ferramentas as grava (app/api/agente/ferramentas). Contadas à parte porque dizem coisa
  // diferente das recusas por teto: uma é a regra funcionando, a outra é um limite apertando.
  const recusas = await prisma.assistantAuditLog.groupBy({
    by: ["officeId"],
    where: {
      ...onde,
      acao: "FERRAMENTA",
      createdAt: { gte: sete },
      detalhe: { startsWith: "recusada:" },
    },
    _count: { _all: true },
  });
  for (const linha of recusas) {
    const u = mapa.get(linha.officeId);
    if (u) {
      u.recusasFinanceiro7d = linha._count._all;
      // Uma recusa também foi contada como consulta acima; descontar evita dizer que o
      // escritório consultou algo que ele justamente não conseguiu consultar.
      u.consultas7d = Math.max(0, u.consultas7d - linha._count._all);
    }
  }

  return mapa;
}
