import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";

export const dynamic = "force-dynamic";

// Borda à esquerda por fonte (source do item principal do grupo) — mesmo mapeamento usado no
// desktop (ver components/PublicationsList.tsx) pra manter consistência visual entre as telas.
const SOURCE_BORDER_COLORS: Record<string, string> = {
  DJEN: "border-l-navy-700 dark:border-l-navy-500",
  DATAJUD: "border-l-blue-500 dark:border-l-blue-400",
  JUSBRASIL_EMAIL: "border-l-emerald-500 dark:border-l-emerald-400",
  MANUAL: "border-l-gold-500 dark:border-l-gold-400",
};
const DEFAULT_SOURCE_BORDER_COLOR = "border-l-slate-400 dark:border-l-white/20";

function sourceBorderColor(source: string): string {
  return SOURCE_BORDER_COLORS[source] ?? DEFAULT_SOURCE_BORDER_COLOR;
}

export default async function MobilePublicacoes() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [publicationsRaw, users, blockedSet] = await Promise.all([
    // Busca TODAS as publicações do escritório (não só as não lidas) para poder agrupar por
    // processo corretamente — ver lib/publicationGrouping.ts: precisamos saber de TODOS os itens
    // de um grupo (mesmo os já lidos por outra fonte) pra escolher a fonte principal certa e
    // mostrar o histórico completo ao expandir. O "take" é só uma rede de segurança bem folgada,
    // não um corte de exibição (esse corte acontece depois, sobre a lista já agrupada).
    prisma.publication.findMany({
      where: { officeId: viewer.officeId },
      include: { case: true, client: true, reads: { where: { userId: viewer.id }, select: { userId: true } } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 3000,
    }),
    prisma.user.findMany({
      where: { active: true, officeId: viewer.officeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getBlockedProcessNumberSet(viewer.id),
  ]);
  // Bloqueio de processo é por usuário — esconde só da fila de quem bloqueou.
  const publications = publicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet));

  const serializedAll = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: p.content,
    publishedAt: p.publishedAt.toISOString(),
    read: p.reads.length > 0,
    caseId: p.case?.id ?? null,
    caseTitle: p.case?.title ?? null,
    clientId: p.client?.id ?? null,
    clientName: p.client?.name ?? null,
    processNumberRaw: p.processNumberRaw,
    assignedToId: p.assignedToId,
  }));

  // A Início mobile só lista pendências (sem abas Lidas/Todos como no desktop) — mantém esse
  // comportamento por GRUPO: um grupo só desaparece daqui quando TODOS os seus itens (de
  // qualquer fonte) já foram lidos pelo viewer.
  const groups = groupPublicationsByProcess(serializedAll).filter((g) => !g.allRead);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Publicações</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{groups.length} não lida(s)</p>
      </div>

      <Card>
        {groups.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {groups.map((g, i) => (
              <div
                key={g.key}
                className={`border-l-4 ${sourceBorderColor(g.primary.source)} ${i % 2 === 0 ? "pub-card-a" : "pub-card-b"}`}
              >
                <MobilePublicationCard group={g} users={users} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
