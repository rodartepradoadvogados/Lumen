import { notFound } from "next/navigation";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState } from "@/components/ui";
import MobilePublicationsList from "@/components/mobile/MobilePublicationsList";
import MarkAllPublicationsReadButton from "@/components/MarkAllPublicationsReadButton";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess } from "@/lib/publicationGrouping";

export const dynamic = "force-dynamic";

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
    // Publicação já gravada antes da correção pode ter o teor escapado em HTML; decodificar na
  // leitura conserta o histórico sem precisar reescrever o banco. É inócuo em texto já limpo,
  // porque nele não sobra nenhuma sequência "&...;" para converter.
    content: decodificarEntidadesHtml(p.content),
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tx">Publicações</h1>
          <p className="text-sm text-tx-2">{groups.length} não lida(s)</p>
        </div>
        {groups.length > 0 && <MarkAllPublicationsReadButton count={groups.length} />}
      </div>

      <Card>
        {groups.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <MobilePublicationsList groups={groups} users={users} />
        )}
      </Card>
    </div>
  );
}
