import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeProcessNumber, processNumberIncludes } from "@/lib/processNumber";

// O Postgres não faz "contains" ignorando pontuação direto no banco, então a busca por nº de
// processo (que deve ignorar hífen/ponto/barra/underscore/caixa) é resolvida em duas etapas:
// busca um conjunto candidato (só id + nº, respeitando os outros filtros já aplicados na página,
// ex: status/área/responsável) e compara normalizado em código — os ids retornados entram como
// mais uma opção do OR de busca textual (título, cliente...) já existente em cada listagem.
export async function findCaseIdsByProcessNumber(query: string, extraWhere: Prisma.CaseWhereInput = {}): Promise<string[]> {
  const normalizedQuery = normalizeProcessNumber(query);
  if (!normalizedQuery) return [];
  const candidates = await prisma.case.findMany({
    where: { ...extraWhere, processNumber: { not: null } },
    select: { id: true, processNumber: true },
  });
  return candidates.filter((c) => processNumberIncludes(c.processNumber, query)).map((c) => c.id);
}

export async function findPublicationIdsByProcessNumber(query: string, extraWhere: Prisma.PublicationWhereInput = {}): Promise<string[]> {
  const normalizedQuery = normalizeProcessNumber(query);
  if (!normalizedQuery) return [];
  const candidates = await prisma.publication.findMany({
    where: { ...extraWhere, processNumberRaw: { not: null } },
    select: { id: true, processNumberRaw: true },
  });
  return candidates.filter((p) => processNumberIncludes(p.processNumberRaw, query)).map((p) => p.id);
}
