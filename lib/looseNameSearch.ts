import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { looseIncludes, normalizeLoose } from "@/lib/textNormalize";

// Mesma estratégia de lib/processNumberSearch.ts, mas para nome de parte/cliente em vez de nº de
// processo: o Postgres não faz "contains" ignorando acento/pontuação direto no banco (ver
// lib/textNormalize.ts, normalizeLoose), então busca-se um conjunto candidato (respeitando os
// outros filtros já aplicados, ex.: officeId/status/área) e compara normalizado em código — os ids
// retornados entram como mais uma opção do OR de busca textual já existente em cada listagem.
export async function findCaseIdsByLooseName(query: string, extraWhere: Prisma.CaseWhereInput = {}): Promise<string[]> {
  const normalizedQuery = normalizeLoose(query);
  if (!normalizedQuery) return [];
  const candidates = await prisma.case.findMany({
    where: extraWhere,
    select: {
      id: true,
      title: true,
      opposingPartyName: true,
      client: { select: { name: true } },
      clients: { select: { client: { select: { name: true } } } },
      parties: { select: { name: true } },
    },
  });
  return candidates
    .filter(
      (c) =>
        looseIncludes(c.title, query) ||
        looseIncludes(c.opposingPartyName, query) ||
        looseIncludes(c.client?.name, query) ||
        c.clients.some((cc) => looseIncludes(cc.client.name, query)) ||
        c.parties.some((p) => looseIncludes(p.name, query))
    )
    .map((c) => c.id);
}

// Idem para Client (cadastro de contatos/clientes) — nome ou documento.
export async function findClientIdsByLooseName(query: string, extraWhere: Prisma.ClientWhereInput = {}): Promise<string[]> {
  const normalizedQuery = normalizeLoose(query);
  if (!normalizedQuery) return [];
  const candidates = await prisma.client.findMany({
    where: extraWhere,
    select: { id: true, name: true, document: true },
  });
  return candidates.filter((c) => looseIncludes(c.name, query) || looseIncludes(c.document, query)).map((c) => c.id);
}

// Idem para Attendance (atendimentos) — nome do cliente ou assunto.
export async function findAttendanceIdsByLooseName(query: string, extraWhere: Prisma.AttendanceWhereInput = {}): Promise<string[]> {
  const normalizedQuery = normalizeLoose(query);
  if (!normalizedQuery) return [];
  const candidates = await prisma.attendance.findMany({
    where: extraWhere,
    select: { id: true, clientName: true, subject: true },
  });
  return candidates.filter((a) => looseIncludes(a.clientName, query) || looseIncludes(a.subject, query)).map((a) => a.id);
}
