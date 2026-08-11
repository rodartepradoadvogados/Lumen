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
// Chaves batem com Publication.source de verdade (DJE/PJE/ESAJ/PROJUDI/MANUAL/JUSBRASIL_EMAIL,
// ver prisma/schema.prisma) — a versão anterior usava "DJEN"/"DATAJUD", que não existem, então
// a borda nunca aparecia; achado testando ao vivo, corrigido junto com o desktop.
// DJE = --acao, ESAJ = --aviso, PROJUDI = --tx-2, MANUAL = --vinho (via alias --atencao, é o
// único lançamento feito por pessoa), JUSBRASIL_EMAIL = --concluido — todos tokens semânticos
// já existentes. PJE é a única fonte sem token próprio no design system (#2f6fb0 / #93c0f0 no
// manual, DESIGN-SYSTEM.md §9) — mesmo par cravado usado no desktop.
const SOURCE_BORDER_COLORS: Record<string, string> = {
  DJE: "border-l-acao",
  PJE: "border-l-[#2f6fb0] dark:border-l-[#93c0f0]",
  ESAJ: "border-l-aviso",
  PROJUDI: "border-l-tx-2",
  MANUAL: "border-l-atencao",
  JUSBRASIL_EMAIL: "border-l-concluido",
};
const DEFAULT_SOURCE_BORDER_COLOR = "border-l-regua-forte";

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
        <h1 className="font-serif text-xl font-bold text-tx">Publicações</h1>
        <p className="text-sm text-tx-2">{groups.length} não lida(s)</p>
      </div>

      <Card>
        {groups.length === 0 ? (
          <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
        ) : (
          <div className="divide-y divide-regua">
            {groups.map((g) => (
              <div key={g.key} className={`border-l-4 ${sourceBorderColor(g.primary.source)} bg-sf`}>
                <MobilePublicationCard group={g} users={users} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
