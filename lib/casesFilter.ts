import { Prisma } from "@prisma/client";
import { findCaseIdsByProcessNumber } from "@/lib/processNumberSearch";
import { findCaseIdsByLooseName } from "@/lib/looseNameSearch";
import { naturezaWhere, type CaseNatureza } from "@/lib/caseNatureza";

export type CasesFilterInput = {
  officeId: string;
  status?: string;
  area?: string;
  responsibleId?: string;
  natureza?: CaseNatureza | null;
  esfera?: string;
  materia?: string;
  q?: string;
};

// Monta o `where` de Case compartilhado entre a listagem de Processos/Casos
// (app/(app)/processos/page.tsx) e a pré-visualização dinâmica da busca (lib/actions/casesSearch.ts)
// — mantém as duas consistentes: o que aparece no painel suspenso ao digitar é exatamente o que
// "Aplicar" traria pra listagem de verdade.
export async function buildCasesWhere(input: CasesFilterInput): Promise<Prisma.CaseWhereInput> {
  const q = (input.q || "").trim();
  const baseFilters: Prisma.CaseWhereInput = {
    officeId: input.officeId,
    status: input.status || undefined,
    area: input.area || undefined,
    responsibleId: input.responsibleId || undefined,
  };
  // Busca por nº de processo ignora máscara (hífen, ponto, barra...) — ver lib/processNumberSearch.ts.
  // Busca por nome (título/cliente/parte adversa) ignora acento/hífen/ponto — ver lib/looseNameSearch.ts.
  // As duas rodam em paralelo sobre o mesmo conjunto candidato já restrito por baseFilters.
  const [matchingProcessNumberIds, matchingLooseNameIds] = q
    ? await Promise.all([findCaseIdsByProcessNumber(q, baseFilters), findCaseIdsByLooseName(q, baseFilters)])
    : [[], []];

  return {
    ...baseFilters,
    ...(input.natureza ? (naturezaWhere(input.natureza) as Prisma.CaseWhereInput) : {}),
    // Esfera/matéria só fazem sentido combinados com a aba Administrativos.
    ...(input.natureza === "ADMINISTRATIVO" && input.esfera ? { adminEsfera: input.esfera } : {}),
    ...(input.natureza === "ADMINISTRATIVO" && input.materia ? { adminMateria: input.materia } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { opposingPartyName: { contains: q, mode: "insensitive" } },
            { client: { is: { name: { contains: q, mode: "insensitive" } } } },
            { clients: { some: { client: { name: { contains: q, mode: "insensitive" } } } } },
            { parties: { some: { name: { contains: q, mode: "insensitive" } } } },
            ...(matchingProcessNumberIds.length ? [{ id: { in: matchingProcessNumberIds } }] : []),
            ...(matchingLooseNameIds.length ? [{ id: { in: matchingLooseNameIds } }] : []),
          ],
        }
      : {}),
  };
}
