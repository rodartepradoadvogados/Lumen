"use server";

import { prisma } from "@/lib/prisma";
import { normalizeProcessNumber, processNumberIncludes } from "@/lib/processNumber";

export type SearchResult = {
  type: "Processos" | "Clientes" | "Tarefas" | "Atendimentos" | "Publicações";
  id: string;
  titulo: string;
  subtitulo: string;
  href: string;
};

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const contains = { contains: q, mode: "insensitive" as const };
  // A busca por nº de processo ignora qualquer máscara (pontos, hífen, barra) — como isso não dá
  // pra fazer direto no banco, busca-se o conjunto candidato (só id + nº) e compara normalizado
  // em código; só roda quando o termo tem pelo menos um caractere alfanumérico útil.
  const normalizedQuery = normalizeProcessNumber(q);

  const [cases, clients, tasks, attendances, publications, caseNumberCandidates, publicationNumberCandidates] = await Promise.all([
    prisma.case.findMany({
      where: {
        OR: [{ title: contains }, { opposingPartyName: contains }],
      },
      select: { id: true, title: true, processNumber: true, type: true },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.client.findMany({
      where: { OR: [{ name: contains }, { document: contains }] },
      select: { id: true, name: true, document: true, type: true },
      take: 5,
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { title: contains },
      select: { id: true, title: true, type: true, dueDate: true },
      take: 4,
      orderBy: { dueDate: "desc" },
    }),
    prisma.attendance.findMany({
      where: { OR: [{ clientName: contains }, { subject: contains }] },
      select: { id: true, clientName: true, subject: true },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
    prisma.publication.findMany({
      where: { content: contains },
      select: { id: true, content: true, processNumberRaw: true, source: true },
      take: 3,
      orderBy: { publishedAt: "desc" },
    }),
    normalizedQuery
      ? prisma.case.findMany({
          where: { processNumber: { not: null } },
          select: { id: true, title: true, processNumber: true, type: true },
        })
      : Promise.resolve([]),
    normalizedQuery
      ? prisma.publication.findMany({
          where: { processNumberRaw: { not: null } },
          select: { id: true, content: true, processNumberRaw: true, source: true },
          orderBy: { publishedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  for (const c of caseNumberCandidates) {
    if (cases.some((existing) => existing.id === c.id)) continue;
    if (processNumberIncludes(c.processNumber, q) && cases.length < 5) cases.push(c);
  }
  for (const p of publicationNumberCandidates) {
    if (publications.some((existing) => existing.id === p.id)) continue;
    if (processNumberIncludes(p.processNumberRaw, q) && publications.length < 3) publications.push(p);
  }

  const results: SearchResult[] = [];

  for (const c of cases) {
    results.push({
      type: "Processos",
      id: c.id,
      titulo: c.title,
      subtitulo: c.processNumber || c.type,
      href: `/processos/${c.id}`,
    });
  }

  for (const c of clients) {
    results.push({
      type: "Clientes",
      id: c.id,
      titulo: c.name,
      subtitulo: c.document || (c.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"),
      href: `/contatos/clientes#client-${c.id}`,
    });
  }

  for (const t of tasks) {
    results.push({
      type: "Tarefas",
      id: t.id,
      titulo: t.title,
      subtitulo: new Date(t.dueDate).toLocaleDateString("pt-BR"),
      href: `/agenda`,
    });
  }

  for (const a of attendances) {
    results.push({
      type: "Atendimentos",
      id: a.id,
      titulo: a.clientName,
      subtitulo: a.subject,
      href: `/atendimento/${a.id}`,
    });
  }

  for (const p of publications) {
    results.push({
      type: "Publicações",
      id: p.id,
      titulo: p.processNumberRaw || p.source,
      subtitulo: p.content.slice(0, 80),
      href: `/publicacoes`,
    });
  }

  return results;
}
