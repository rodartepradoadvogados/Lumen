import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PublicationsList from "@/components/PublicationsList";
import SyncJusbrasilButton from "@/components/SyncJusbrasilButton";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage({ searchParams }: { searchParams: { kind?: string } }) {
  const publications = await prisma.publication.findMany({
    where: {
      read: false,
      kind: searchParams.kind || undefined,
    },
    include: { case: true, client: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  const serialized = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.read,
    deadlineGenerated: p.deadlineGenerated,
    lawyerTag: p.lawyerTag,
    processNumberRaw: p.processNumberRaw,
    case: p.case ? { id: p.case.id, title: p.case.title } : null,
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
  }));

  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { kind: searchParams.kind, ...extra };
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <PageHeader
        title="Publicações e Andamentos Processuais"
        subtitle={`${serialized.length} não lida(s) — some daqui assim que marcada como lida`}
        action={<SyncJusbrasilButton />}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos os tipos" href={qs({ kind: undefined })} active={!searchParams.kind} />
        <FilterLink label="Publicações" href={qs({ kind: "PUBLICACAO" })} active={searchParams.kind === "PUBLICACAO"} />
        <FilterLink label="Andamentos" href={qs({ kind: "ANDAMENTO" })} active={searchParams.kind === "ANDAMENTO"} />
      </div>

      <Card>
        {serialized.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <PublicationsList publications={serialized} />
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
