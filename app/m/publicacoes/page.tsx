import { prisma } from "@/lib/prisma";
import { Card, EmptyState } from "@/components/ui";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";

export const dynamic = "force-dynamic";

export default async function MobilePublicacoes() {
  const publications = await prisma.publication.findMany({
    where: { read: false },
    include: { case: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const serialized = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    caseId: p.case?.id ?? null,
    caseTitle: p.case?.title ?? null,
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900">Publicações</h1>
        <p className="text-sm text-navy-800/50">{serialized.length} não lida(s)</p>
      </div>

      <Card>
        {serialized.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {serialized.map((p) => (
              <MobilePublicationCard key={p.id} pub={p} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
