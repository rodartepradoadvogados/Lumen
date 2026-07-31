"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { buildCasesWhere } from "@/lib/casesFilter";
import { naturezaOf, parseNaturezaParam, MATERIA_LABELS } from "@/lib/caseNatureza";
import { effectiveCaseClients, effectiveCaseParties, joinCaseNames } from "@/lib/caseParties";

const SORTS: Record<string, Prisma.CaseOrderByWithRelationInput> = {
  nome: { title: "asc" },
  valor: { caseValue: "desc" },
  movimentacao: { lastHistoryAt: "desc" },
  recente: { createdAt: "desc" },
};

export type CasePreviewResult = { id: string; titulo: string; subtitulo: string; href: string };

// Pré-visualização dinâmica da busca de Processos/Casos: components/ProcessosFiltroForm.tsx chama
// isso a cada tecla/troca de área/responsável/ordenação (debounce de 300ms) e mostra os primeiros
// resultados num painel suspenso, sem navegar — clicar num item vai direto pro processo. O botão
// "Aplicar" continua sendo o único jeito de trocar a listagem de verdade (querystring), como já
// fazia; esta função só alimenta a prévia.
export async function searchCasesPreview(filters: {
  q?: string;
  status?: string;
  area?: string;
  responsibleId?: string;
  natureza?: string;
  esfera?: string;
  materia?: string;
  sort?: string;
}): Promise<CasePreviewResult[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];

  const q = (filters.q || "").trim();
  // Sem texto buscado nem área/responsável marcados, "prévia de tudo" não ajuda em nada — fica
  // vazia até haver algum critério ativo (igual à barra de busca do TopBar, que também exige
  // ao menos 2 caracteres antes de buscar).
  if (q.length < 2 && !filters.area && !filters.responsibleId) return [];

  const natureza = parseNaturezaParam(filters.natureza);
  const where = await buildCasesWhere({
    officeId: viewer.officeId,
    status: filters.status,
    area: filters.area,
    responsibleId: filters.responsibleId,
    natureza,
    esfera: filters.esfera,
    materia: filters.materia,
    q,
  });

  const sortKey = filters.sort && SORTS[filters.sort] ? filters.sort : "nome";
  const cases = await prisma.case.findMany({
    where,
    include: { client: true, clients: { include: { client: true } }, parties: true },
    orderBy: SORTS[sortKey],
    take: 8,
  });

  return cases.map((c) => {
    const nat = naturezaOf(c.type);
    const subtitulo =
      nat === "ADMINISTRATIVO"
        ? [c.processNumber, c.tribunalSigla, c.adminMateria ? MATERIA_LABELS[c.adminMateria] || c.adminMateria : null].filter(Boolean).join(" · ")
        : [
            c.processNumber,
            joinCaseNames(effectiveCaseClients(c).map((cc) => cc.name)),
            effectiveCaseParties(c).length ? `x ${joinCaseNames(effectiveCaseParties(c).map((p) => p.name))}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
    return { id: c.id, titulo: c.title, subtitulo: subtitulo || "Sem detalhes cadastrados", href: `/processos/${c.id}` };
  });
}
