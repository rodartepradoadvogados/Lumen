import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Card, Badge, EmptyState } from "@/components/ui";
import { findCaseIdsByProcessNumber } from "@/lib/processNumberSearch";
import { Scale, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileProcessos({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q || "").trim();
  const baseFilters: Prisma.CaseWhereInput = { status: "ATIVO" };
  const matchingProcessNumberIds = q ? await findCaseIdsByProcessNumber(q, baseFilters) : [];

  const where: Prisma.CaseWhereInput = {
    ...baseFilters,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { client: { is: { name: { contains: q, mode: "insensitive" } } } },
            ...(matchingProcessNumberIds.length ? [{ id: { in: matchingProcessNumberIds } }] : []),
          ],
        }
      : {}),
  };

  const cases = await prisma.case.findMany({
    where,
    include: { client: true },
    orderBy: { title: "asc" },
    take: 100,
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Processos ativos</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{cases.length} registro(s)</p>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, número ou cliente"
            className="w-full border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
        </div>
        <button type="submit" className="bg-navy-900 dark:bg-gold-600 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
      </form>

      <Card>
        {cases.length === 0 ? (
          <EmptyState title="Nenhum processo encontrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {cases.map((c) => (
              <Link key={c.id} href={`/m/processos/${c.id}`} className="flex items-center gap-3 px-4 py-3.5">
                <span className="h-10 w-10 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center shrink-0">
                  <Scale size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{c.title}</p>
                    {c.area && <Badge color="gold">{c.area}</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5 truncate">
                    {c.processNumber ? `${c.processNumber} · ` : ""}
                    {c.client?.name ?? "Sem cliente"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
