import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatCurrency, EmptyState } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import NewEntityMenu from "@/components/NewEntityMenu";
import { Scale, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "amber" | "slate" | "red"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "red",
};

const SORTS: Record<string, Prisma.CaseOrderByWithRelationInput> = {
  nome: { title: "asc" },
  valor: { caseValue: "desc" },
  movimentacao: { lastHistoryAt: "desc" },
  recente: { createdAt: "desc" },
};

const sortLabels: Record<string, string> = {
  nome: "Nome A-Z",
  valor: "Valor da causa ↓",
  movimentacao: "Última movimentação ↓",
  recente: "Mais recente",
};

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: { status?: string; area?: string; q?: string; responsibleId?: string; sort?: string };
}) {
  const q = (searchParams.q || "").trim();
  const sortKey = searchParams.sort && SORTS[searchParams.sort] ? searchParams.sort : "nome";

  const where: Prisma.CaseWhereInput = {
    status: searchParams.status || undefined,
    area: searchParams.area || undefined,
    responsibleId: searchParams.responsibleId || undefined,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { processNumber: { contains: q, mode: "insensitive" } },
            { opposingPartyName: { contains: q, mode: "insensitive" } },
            { client: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [cases, totalCount, areaRows, users] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        client: true,
        responsible: true,
        _count: { select: { tasks: true, comments: true } },
      },
      orderBy: SORTS[sortKey],
    }),
    prisma.case.count(),
    prisma.case.findMany({ where: { area: { not: null } }, distinct: ["area"], select: { area: true }, orderBy: { area: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const areas = areaRows.map((a) => a.area).filter((a): a is string => Boolean(a));
  const isFiltered = Boolean(q || searchParams.area || searchParams.responsibleId || searchParams.status);

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader
        title="Processos e Casos"
        subtitle={isFiltered ? `${cases.length} de ${totalCount} processo(s)` : `${cases.length} registro(s)`}
        action={<NewEntityMenu />}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href={qsFor(searchParams, { status: undefined })} active={!searchParams.status} />
        {["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"].map((s) => (
          <FilterLink key={s} label={s} href={qsFor(searchParams, { status: s })} active={searchParams.status === s} />
        ))}
      </div>

      <Card className="mb-4">
        <form className="p-4 flex flex-wrap items-end gap-3">
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Buscar</label>
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30" />
              <input
                type="text"
                name="q"
                defaultValue={searchParams.q}
                placeholder="Título, número, cliente ou parte adversa"
                className="pr-input w-full pl-8"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Área</label>
            <select name="area" defaultValue={searchParams.area} className="pr-input">
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Responsável</label>
            <select name="responsibleId" defaultValue={searchParams.responsibleId} className="pr-input">
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 block mb-1">Ordenar por</label>
            <select name="sort" defaultValue={sortKey} className="pr-input">
              {Object.entries(sortLabels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Aplicar
          </button>
          {(q || searchParams.area || searchParams.responsibleId || (searchParams.sort && searchParams.sort !== "nome")) && (
            <Link
              href={qsFor(searchParams, { q: undefined, area: undefined, responsibleId: undefined, sort: undefined })}
              className="text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2"
            >
              Limpar filtros
            </Link>
          )}
        </form>
      </Card>

      <Card>
        {cases.length === 0 ? (
          <EmptyState title="Nenhum processo encontrado" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {cases.map((c) => (
              <Link key={c.id} href={`/processos/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-cream-50 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-navy-900/5 text-navy-800 flex items-center justify-center shrink-0">
                  <Scale size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-navy-900 truncate">{c.title}</p>
                    <Badge color={statusColors[c.status]}>{c.status}</Badge>
                    {c.area && <Badge color="gold">{c.area}</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45 mt-1 truncate">
                    {c.processNumber ? `${c.processNumber} · ` : ""}
                    {c.client?.name}
                    {c.opposingPartyName ? ` x ${c.opposingPartyName}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  {c.caseValue != null && <p className="text-sm font-semibold text-navy-900">{formatCurrency(c.caseValue)}</p>}
                  <p className="text-xs text-navy-800/40 mt-0.5">{c.responsible?.name ?? "Sem responsável"}</p>
                </div>
                <div className="text-xs text-navy-800/40 shrink-0 w-20 text-right hidden md:block">
                  {c._count.tasks} tarefa(s)
                </div>
                <DeleteEntityButton entityType="CASE" entityId={c.id} entityLabel={c.title} confirmMessage={`Excluir "${c.title}"?`} />
              </Link>
            ))}
          </div>
        )}
      </Card>
      <style>{`
        .pr-input { border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; }
        .pr-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </div>
  );
}

function qsFor(current: Record<string, string | undefined>, extra: Record<string, string | undefined>) {
  const merged = { ...current, ...extra };
  const params = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
  const s = params.toString();
  return `/processos${s ? `?${s}` : ""}`;
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      {label}
    </Link>
  );
}
