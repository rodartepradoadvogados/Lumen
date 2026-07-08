import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PublicationRow from "@/components/PublicationRow";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage({ searchParams }: { searchParams: { filter?: string } }) {
  const publications = await prisma.publication.findMany({
    where: searchParams.filter === "nao-lidas" ? { read: false } : undefined,
    include: { case: true },
    orderBy: { publishedAt: "desc" },
  });

  const unreadCount = await prisma.publication.count({ where: { read: false } });

  const serialized = publications.map((p) => ({
    id: p.id,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.read,
    deadlineGenerated: p.deadlineGenerated,
    case: p.case ? { id: p.case.id, title: p.case.title } : null,
  }));

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <PageHeader title="Publicações e Andamentos Processuais" subtitle={`${unreadCount} não lida(s)`} />

      <div className="flex gap-2 mb-4">
        <FilterLink label="Todas" href="/publicacoes" active={!searchParams.filter} />
        <FilterLink label="Não lidas" href="/publicacoes?filter=nao-lidas" active={searchParams.filter === "nao-lidas"} />
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
