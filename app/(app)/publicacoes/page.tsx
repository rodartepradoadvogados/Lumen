import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PublicationsList from "@/components/PublicationsList";
import SyncJusbrasilButton from "@/components/SyncJusbrasilButton";
import MarkAllPublicationsReadButton from "@/components/MarkAllPublicationsReadButton";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage({
  searchParams,
}: {
  searchParams: { aba?: string; kind?: string; q?: string; adv?: string };
}) {
  const isLidas = searchParams.aba === "lidas";
  const q = (searchParams.q || "").trim();
  const adv = searchParams.adv === "Jairo" || searchParams.adv === "Rodrigo" ? searchParams.adv : undefined;

  const where: Prisma.PublicationWhereInput = {
    read: isLidas,
    kind: searchParams.kind || undefined,
    lawyerTag: adv ? { contains: adv } : undefined,
    ...(q
      ? {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            { processNumberRaw: { contains: q, mode: "insensitive" } },
            { emailSubject: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [publications, unreadCount] = await Promise.all([
    prisma.publication.findMany({
      where,
      include: { case: true, client: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: isLidas ? 100 : undefined,
    }),
    prisma.publication.count({ where: { read: false } }),
  ]);

  const taskCounts = await prisma.task.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: publications.map((p) => p.id) }, status: { not: "CANCELADO" } },
    _count: { _all: true },
  });
  const taskCountMap = new Map(taskCounts.map((t) => [t.publicationId as string, t._count._all]));

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
    taskCount: taskCountMap.get(p.id) ?? 0,
  }));

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { aba: searchParams.aba, kind: searchParams.kind, q: searchParams.q, adv: searchParams.adv, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <PageHeader
        title="Publicações e Andamentos Processuais"
        subtitle={
          isLidas
            ? `Histórico de lidas (100 mais recentes)`
            : `${unreadCount} não lida(s) — some daqui assim que marcada como lida`
        }
        action={<SyncJusbrasilButton />}
      />

      <div className="flex gap-2 mb-4">
        <TabLink label={`Não lidas${unreadCount ? ` (${unreadCount})` : ""}`} href={qs({ aba: undefined })} active={!isLidas} />
        <TabLink label="Lidas" href={qs({ aba: "lidas" })} active={isLidas} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <FilterLink label="Todos os tipos" href={qs({ kind: undefined })} active={!searchParams.kind} />
        <FilterLink label="Publicações" href={qs({ kind: "PUBLICACAO" })} active={searchParams.kind === "PUBLICACAO"} />
        <FilterLink label="Andamentos" href={qs({ kind: "ANDAMENTO" })} active={searchParams.kind === "ANDAMENTO"} />
        <span className="w-px h-5 bg-navy-800/10 mx-1" />
        <FilterLink label="Todos advogados" href={qs({ adv: undefined })} active={!adv} />
        <FilterLink label="Jairo" href={qs({ adv: "Jairo" })} active={adv === "Jairo"} />
        <FilterLink label="Rodrigo" href={qs({ adv: "Rodrigo" })} active={adv === "Rodrigo"} />
      </div>

      <form className="flex gap-2 mb-4">
        {searchParams.aba && <input type="hidden" name="aba" value={searchParams.aba} />}
        {searchParams.kind && <input type="hidden" name="kind" value={searchParams.kind} />}
        {searchParams.adv && <input type="hidden" name="adv" value={searchParams.adv} />}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30" />
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Buscar por número do processo, conteúdo ou título"
            className="w-full border border-navy-800/12 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
        </div>
        <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
        {q && (
          <Link href={qs({ q: undefined })} className="text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2 flex items-center">
            Limpar
          </Link>
        )}
      </form>

      {!isLidas && unreadCount > 0 && (
        <div className="flex justify-end mb-3">
          <MarkAllPublicationsReadButton count={unreadCount} />
        </div>
      )}

      <Card>
        {serialized.length === 0 ? (
          isLidas ? (
            <EmptyState title="Nenhuma publicação lida" subtitle="As publicações marcadas como lidas aparecem aqui" />
          ) : (
            <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
          )
        ) : (
          <PublicationsList publications={serialized} highlightNew={!isLidas} />
        )}
      </Card>
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      {label}
    </Link>
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
