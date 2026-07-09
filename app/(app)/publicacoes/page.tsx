import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PublicationRow from "@/components/PublicationRow";
import SyncJusbrasilButton from "@/components/SyncJusbrasilButton";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage({ searchParams }: { searchParams: { filter?: string; kind?: string } }) {
  const publications = await prisma.publication.findMany({
    where: {
      read: searchParams.filter === "nao-lidas" ? false : undefined,
      kind: searchParams.kind || undefined,
    },
    include: { case: true },
    orderBy: { publishedAt: "desc" },
  });

  const unreadCount = await prisma.publication.count({ where: { read: false } });

  const serialized = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.read,
    deadlineGenerated: p.deadlineGenerated,
    lawyerTag: p.lawyerTag,
    case: p.case ? { id: p.case.id, title: p.case.title } : null,
  }));

  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { filter: searchParams.filter, kind: searchParams.kind, ...extra };
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <PageHeader
        title="Publicações e Andamentos Processuais"
        subtitle={`${unreadCount} não lida(s)`}
        action={<SyncJusbrasilButton />}
      />

      <div className="flex gap-2 mb-2 flex-wrap">
        <FilterLink label="Todas" href={qs({ filter: undefined })} active={!searchParams.filter} />
        <FilterLink label="Não lidas" href={qs({ filter: "nao-lidas" })} active={searchParams.filter === "nao-lidas"} />
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos os tipos" href={qs({ kind: undefined })} active={!searchParams.kind} />
        <FilterLink label="Publicações" href={qs({ kind: "PUBLICACAO" })} active={searchParams.kind === "PUBLICACAO"} />
        <FilterLink label="Andamentos" href={qs({ kind: "ANDAMENTO" })} active={searchParams.kind === "ANDAMENTO"} />
      </div>

      <Card>
        {serialized.length === 0 ? (
          <EmptyState title="Nenhuma publicação encontrada" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {serialized.map((p) => (
              <PublicationRow key={p.id} pub={p} />
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
