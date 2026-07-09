import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatCurrency, EmptyState } from "@/components/ui";
import { Plus, Scale } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "amber" | "slate" | "red"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "red",
};

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: { status?: string; area?: string };
}) {
  const cases = await prisma.case.findMany({
    where: {
      status: searchParams.status || undefined,
      area: searchParams.area || undefined,
    },
    include: {
      client: true,
      opposingParty: true,
      responsible: true,
      _count: { select: { tasks: true, comments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader
        title="Processos e Casos"
        subtitle={`${cases.length} registro(s)`}
        action={
          <Link
            href="/processos/novo"
            className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Novo Caso
          </Link>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href="/processos" active={!searchParams.status} />
        {["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"].map((s) => (
          <FilterLink key={s} label={s} href={`/processos?status=${s}`} active={searchParams.status === s} />
        ))}
      </div>

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
                    {c.opposingParty ? ` x ${c.opposingParty.name}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  {c.caseValue != null && <p className="text-sm font-semibold text-navy-900">{formatCurrency(c.caseValue)}</p>}
                  <p className="text-xs text-navy-800/40 mt-0.5">{c.responsible?.name ?? "Sem responsável"}</p>
                </div>
                <div className="text-xs text-navy-800/40 shrink-0 w-20 text-right hidden md:block">
                  {c._count.tasks} tarefa(s)
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
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
