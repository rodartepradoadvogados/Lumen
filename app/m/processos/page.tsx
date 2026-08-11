import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, EmptyState } from "@/components/ui";
import { findCaseIdsByProcessNumber } from "@/lib/processNumberSearch";
import { findCaseIdsByLooseName } from "@/lib/looseNameSearch";
import { effectiveCaseClients, joinCaseNames } from "@/lib/caseParties";
import { naturezaOf, naturezaWhere, parseNaturezaParam, MATERIA_LABELS, type CaseNatureza } from "@/lib/caseNatureza";
import NaturezaBadge from "@/components/mobile/NaturezaBadge";
import { Scale, Search } from "lucide-react";

export const dynamic = "force-dynamic";

// Pílulas de natureza mostradas no topo da lista — rótulos curtos de propósito ("Adm." em
// vez de "Administrativo") porque no mobile elas rolam horizontalmente numa faixa estreita,
// não são abas de desktop com largura sobrando. `natureza: null` é a pílula "Todos" (sem
// filtro aplicado, ver parseNaturezaParam em lib/caseNatureza.ts).
const PILLS: { natureza: CaseNatureza | null; label: string }[] = [
  { natureza: null, label: "Todos" },
  { natureza: "JUDICIAL", label: "Judiciais" },
  { natureza: "ADMINISTRATIVO", label: "Adm." },
  { natureza: "CASO", label: "Casos" },
];

export default async function MobileProcessos({ searchParams }: { searchParams: { q?: string; natureza?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const q = (searchParams.q || "").trim();
  const natureza = parseNaturezaParam(searchParams.natureza);

  // officeId entra aqui em baseFilters (não só no `where` abaixo) de propósito: baseFilters é
  // repassado como extraWhere para findCaseIdsByProcessNumber/findCaseIdsByLooseName (lib/
  // processNumberSearch.ts, lib/looseNameSearch.ts), então os conjuntos candidatos da busca por
  // nº de processo e por nome (tolerante a acento/hífen/ponto) já saem escopados por escritório.
  const baseFilters: Prisma.CaseWhereInput = { status: "ATIVO", officeId: viewer.officeId };
  const [matchingProcessNumberIds, matchingLooseNameIds] = q
    ? await Promise.all([findCaseIdsByProcessNumber(q, baseFilters), findCaseIdsByLooseName(q, baseFilters)])
    : [[], []];

  // where SEM natureza — base tanto da lista (com a pílula ativa aplicada por cima) quanto da
  // contagem de cada pílula (cada pílula conta dentro do MESMO filtro de busca já aplicado, pra
  // não mostrar um número que não bate com o que a busca já reduziu).
  const whereSemNatureza: Prisma.CaseWhereInput = {
    ...baseFilters,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { client: { is: { name: { contains: q, mode: "insensitive" } } } },
            { clients: { some: { client: { name: { contains: q, mode: "insensitive" } } } } },
            { parties: { some: { name: { contains: q, mode: "insensitive" } } } },
            ...(matchingProcessNumberIds.length ? [{ id: { in: matchingProcessNumberIds } }] : []),
            ...(matchingLooseNameIds.length ? [{ id: { in: matchingLooseNameIds } }] : []),
          ],
        }
      : {}),
  };

  const where: Prisma.CaseWhereInput = {
    ...whereSemNatureza,
    ...(natureza ? naturezaWhere(natureza) : {}),
  };

  const [cases, totalCount, judicialCount, administrativoCount, casoCount] = await Promise.all([
    prisma.case.findMany({
      where,
      include: { client: true, clients: { include: { client: true } } },
      orderBy: { title: "asc" },
      take: 100,
    }),
    prisma.case.count({ where: whereSemNatureza }),
    prisma.case.count({ where: { ...whereSemNatureza, ...naturezaWhere("JUDICIAL") } }),
    prisma.case.count({ where: { ...whereSemNatureza, ...naturezaWhere("ADMINISTRATIVO") } }),
    prisma.case.count({ where: { ...whereSemNatureza, ...naturezaWhere("CASO") } }),
  ]);

  const countByPill: Record<string, number> = {
    Todos: totalCount,
    Judiciais: judicialCount,
    "Adm.": administrativoCount,
    Casos: casoCount,
  };

  // Preserva o resto da querystring (hoje só `q`) ao trocar de pílula — a busca continua valendo,
  // só a natureza muda.
  function pillHref(n: CaseNatureza | null) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (n) params.set("natureza", n.toLowerCase());
    const s = params.toString();
    return `/m/processos${s ? `?${s}` : ""}`;
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-tx">Processos ativos</h1>
        <p className="text-sm text-tx-2">{cases.length} registro(s)</p>
      </div>

      {/* Pílulas de natureza roláveis horizontalmente — padrão de toque, não abas de desktop
          (ver FilterLink em app/(app)/processos/page.tsx para o equivalente com mouse). */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-0.5">
        {PILLS.map((p) => {
          const active = p.natureza === natureza;
          return (
            <Link
              key={p.label}
              href={pillHref(p.natureza)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-acao border-acao text-acao-tx"
                  : "bg-sf border-regua text-tx-2"
              }`}
            >
              {p.label}
              <span className={active ? "opacity-80" : "opacity-60"}>{countByPill[p.label]}</span>
            </Link>
          );
        })}
      </div>

      <form className="flex gap-2">
        {/* Mantém a natureza escolhida ao buscar — sem isso, submeter o formulário voltaria
            silenciosamente pra "Todos". */}
        {natureza && <input type="hidden" name="natureza" value={natureza.toLowerCase()} />}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, número ou cliente"
            className="w-full border border-regua bg-sf text-tx rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40"
          />
        </div>
        <button type="submit" className="bg-acao text-acao-tx text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
      </form>

      <Card>
        {cases.length === 0 ? (
          <EmptyState title="Nenhum processo encontrado" />
        ) : (
          <div className="divide-y divide-regua">
            {cases.map((c) => {
              const nat = naturezaOf(c.type);
              return (
                <Link key={c.id} href={`/m/processos/${c.id}`} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="h-10 w-10 rounded-lg bg-sf-apoio text-tx-2 flex items-center justify-center shrink-0">
                    <Scale size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <NaturezaBadge natureza={nat} className="mb-1" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-tx truncate">{c.title}</p>
                      {c.materias.map((m) => (
                        <Badge key={m} color="gold">
                          {m}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-tx-2 mt-0.5 truncate">
                      {nat === "ADMINISTRATIVO"
                        ? [c.processNumber, c.tribunalSigla, c.adminMateria ? MATERIA_LABELS[c.adminMateria] : null]
                            .filter(Boolean)
                            .join(" · ") || "Sem detalhes"
                        : `${c.processNumber ? `${c.processNumber} · ` : ""}${
                            joinCaseNames(effectiveCaseClients(c).map((cc) => cc.name)) || "Sem cliente"
                          }`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
