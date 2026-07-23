import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";

export const dynamic = "force-dynamic";

export default async function MobilePublicacoes() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [publications, users] = await Promise.all([
    prisma.publication.findMany({
      where: { read: false, officeId: viewer.officeId },
      include: { case: true, client: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.user.findMany({
      where: { active: true, officeId: viewer.officeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    caseId: p.case?.id ?? null,
    caseTitle: p.case?.title ?? null,
    clientId: p.client?.id ?? null,
    clientName: p.client?.name ?? null,
    processNumberRaw: p.processNumberRaw,
    assignedToId: p.assignedToId,
  }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Publicações</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{serialized.length} não lida(s)</p>
      </div>

      <Card>
        {serialized.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {serialized.map((p) => (
              <MobilePublicationCard key={p.id} pub={p} users={users} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
