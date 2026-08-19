import Link from "next/link";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { EmptyState } from "@/components/ui";
import PublicationsTriage, { type TriageGroup } from "@/components/PublicationsTriage";
import PublicationRespFilter from "@/components/PublicationRespFilter";
import DistributePublicationsButton from "@/components/DistributePublicationsButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import { findPublicationIdsByProcessNumber } from "@/lib/processNumberSearch";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess, countUnreadPublicationGroups } from "@/lib/publicationGrouping";
import { matchesPublicationChip, parsePublicationChip, type PublicationChipKey } from "@/lib/publicationChips";
import { calcularPrazoSugerido } from "@/lib/prazoSugerido";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

// Corte de segurança sobre os grupos JÁ FILTRADOS pelo chip ativo — mesmo espírito do corte de
// 100 que a listagem antiga (por abas) já aplicava (achado A70 da revisão gauntlet): nenhuma
// tela deste produto renderiza uma lista sem teto, por maior que seja o escritório.
const MAX_GROUPS_RENDERED = 150;

function formatHora(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default async function PublicacoesPage({
  searchParams,
}: {
  searchParams: { aba?: string; kind?: string; q?: string; adv?: string; resp?: string };
}) {
  const activeChip: PublicationChipKey = parsePublicationChip(searchParams.aba);
  const q = (searchParams.q || "").trim();
  const adv = searchParams.adv === "Jairo" || searchParams.adv === "Rodrigo" ? searchParams.adv : undefined;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const resp = (searchParams.resp || "").trim() || undefined;

  // Filtro do CHIP ativo não entra no "where" do banco, pelo mesmo motivo de sempre: ele é uma
  // propriedade do GRUPO (agrupado por processo+dia, ver lib/publicationGrouping.ts), decidida
  // só depois do agrupamento — filtrar linha a linha no banco podia trazer metade de um grupo.
  const baseFilters: Prisma.PublicationWhereInput = {
    officeId: viewer.officeId,
    kind: searchParams.kind || undefined,
    lawyerTag: adv ? { contains: adv } : undefined,
    assignedToId: resp || undefined,
  };
  // Busca por nº de processo ignora máscara (hífen, ponto, barra...) — ver lib/processNumberSearch.ts.
  const matchingProcessNumberIds = q ? await findPublicationIdsByProcessNumber(q, baseFilters) : [];

  const where: Prisma.PublicationWhereInput = {
    ...baseFilters,
    ...(q
      ? {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            { emailSubject: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
            ...(matchingProcessNumberIds.length ? [{ id: { in: matchingProcessNumberIds } }] : []),
          ],
        }
      : {}),
  };

  const [publicationsRaw, unreadRowsRaw, users, blockedSet, holidaysRaw, ultimoRunDjen, ultimoRunDatajud] = await Promise.all([
    prisma.publication.findMany({
      where,
      select: {
        id: true,
        kind: true,
        source: true,
        content: true,
        publishedAt: true,
        deadlineGenerated: true,
        lawyerTag: true,
        processNumberRaw: true,
        assignedToId: true,
        triageStatus: true,
        case: { select: { id: true, title: true, processNumber: true } },
        client: { select: { id: true, name: true } },
        reads: { where: { userId: viewer.id }, select: { userId: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      // Sem "take" fixo pequeno aqui: cortar a query bruta ANTES de agrupar por processo corre o
      // risco de truncar um grupo no meio. O corte por chip (MAX_GROUPS_RENDERED) acontece
      // depois, sobre a lista já agrupada — este limite é só uma rede de segurança bem folgada.
      take: 3000,
    }),
    // Contagem do chip "Não triadas": sempre "quantos grupos têm pendência no escritório
    // inteiro", ignorando os filtros de tipo/advogado/responsável/busca de propósito (mesmo
    // comportamento de antes da antiga aba "Não lidas").
    prisma.publication.findMany({
      where: { officeId: viewer.officeId, reads: { none: { userId: viewer.id } } },
      select: { id: true, processNumberRaw: true, publishedAt: true },
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getBlockedProcessNumberSet(viewer.id),
    // Feriados extras do escritório (Holiday) para o cálculo do prazo sugerido — ver
    // lib/prazoSugerido.ts / lib/prazos.ts.
    prisma.holiday.findMany({ where: { officeId: viewer.officeId }, select: { date: true } }),
    // Última execução de DJEN/DATAJUD (IntegrationRun, ver documento 04 / /conexoes) — só para a
    // linha "DJEN {hora} · Datajud {hora}" do cabeçalho; o estado de saúde da integração em si
    // (ok/erro/aviso) mora em /conexoes, não aqui.
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DJEN" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DATAJUD" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  const publications = publicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet));
  const naoTriadasCount = countUnreadPublicationGroups(unreadRowsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet)));

  const taskCounts = await prisma.task.groupBy({
    by: ["publicationId"],
    where: { publicationId: { in: publications.map((p) => p.id) }, status: { not: "CANCELADO" }, officeId: viewer.officeId },
    _count: { _all: true },
  });
  const taskCountMap = new Map(taskCounts.map((t) => [t.publicationId as string, t._count._all]));

  const serializedAll = publications.map((p) => ({
    id: p.id,
    kind: p.kind,
    source: p.source,
    content: decodificarEntidadesHtml(p.content),
    publishedAt: p.publishedAt.toISOString(),
    read: p.reads.length > 0,
    deadlineGenerated: p.deadlineGenerated,
    lawyerTag: p.lawyerTag,
    processNumberRaw: p.processNumberRaw,
    case: p.case ? { id: p.case.id, title: p.case.title, processNumber: p.case.processNumber } : null,
    client: p.client ? { id: p.client.id, name: p.client.name } : null,
    taskCount: taskCountMap.get(p.id) ?? 0,
    assignedToId: p.assignedToId,
    triageStatus: p.triageStatus,
  }));

  // Agrupa por processo (mesmo CNJ de 20 dígitos normalizado) + dia — um card por grupo, ver
  // lib/publicationGrouping.ts.
  const allGroups = groupPublicationsByProcess(serializedAll);

  const feriadosExtras = holidaysRaw.map((h) => ({ date: h.date.toISOString().slice(0, 10) }));
  const groupsWithPrazo: TriageGroup[] = allGroups.map((g) => {
    const prazo = calcularPrazoSugerido(g.primary.publishedAt, feriadosExtras);
    return { ...g, prazoSugeridoDate: prazo.date, prazoSugeridoDiasUteis: prazo.diasUteis };
  });

  const semProcessoCount = allGroups.filter((g) => !g.primary.case).length;

  const groups = groupsWithPrazo.filter((g) => matchesPublicationChip(g, activeChip, viewer.id)).slice(0, MAX_GROUPS_RENDERED);

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { aba: searchParams.aba, kind: searchParams.kind, q: searchParams.q, adv: searchParams.adv, resp: searchParams.resp, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };

  const chips: { key: PublicationChipKey; label: string; count?: number }[] = [
    { key: "nao-triadas", label: "Não triadas", count: naoTriadasCount },
    { key: "minhas", label: "Minhas" },
    { key: "sem-processo", label: "Sem processo", count: semProcessoCount },
    { key: "arquivadas", label: "Arquivadas" },
  ];

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <header className="shrink-0 border-b-2 border-regua-forte px-6 pt-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <h1 className="text-[26px] font-extrabold text-tx">Publicações</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-tx-2">
              DJEN {formatHora(ultimoRunDjen?.startedAt)} · Datajud {formatHora(ultimoRunDatajud?.startedAt)}
            </span>
            <SyncPublicationsButton />
            {viewer.isAdmin && <DistributePublicationsButton />}
          </div>
        </div>

        <div className="flex items-center gap-1 pb-3 flex-wrap">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={qs({ aba: chip.key === "nao-triadas" ? undefined : chip.key })}
              className={`text-sm font-semibold px-3.5 py-1.5 transition-colors ${
                activeChip === chip.key ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 hover:bg-regua"
              }`}
            >
              {chip.label}
              {chip.count !== undefined && ` · ${chip.count}`}
            </Link>
          ))}
        </div>

        <form className="flex gap-2 pb-4 flex-wrap items-center">
          {searchParams.aba && <input type="hidden" name="aba" value={searchParams.aba} />}
          {searchParams.kind && <input type="hidden" name="kind" value={searchParams.kind} />}
          {searchParams.adv && <input type="hidden" name="adv" value={searchParams.adv} />}
          {searchParams.resp && <input type="hidden" name="resp" value={searchParams.resp} />}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q}
              placeholder="Buscar por processo, conteúdo ou fonte"
              className="w-full border border-regua bg-sf text-tx pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-acao/40"
            />
          </div>
          <FilterLink label="Publicações" href={qs({ kind: searchParams.kind === "PUBLICACAO" ? undefined : "PUBLICACAO" })} active={searchParams.kind === "PUBLICACAO"} />
          <FilterLink label="Andamentos" href={qs({ kind: searchParams.kind === "ANDAMENTO" ? undefined : "ANDAMENTO" })} active={searchParams.kind === "ANDAMENTO"} />
          <FilterLink label="Jairo" href={qs({ adv: adv === "Jairo" ? undefined : "Jairo" })} active={adv === "Jairo"} />
          <FilterLink label="Rodrigo" href={qs({ adv: adv === "Rodrigo" ? undefined : "Rodrigo" })} active={adv === "Rodrigo"} />
          <PublicationRespFilter users={users} value={resp} baseParams={{ aba: searchParams.aba, kind: searchParams.kind, q: searchParams.q, adv: searchParams.adv }} />
          {(q || searchParams.kind || adv || resp) && (
            <Link href={qs({ q: undefined, kind: undefined, adv: undefined, resp: undefined })} className="text-xs font-semibold text-tx-3 hover:text-tx px-1">
              Limpar filtros
            </Link>
          )}
        </form>
      </header>

      {groups.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={activeChip === "nao-triadas" ? "Tudo triado!" : "Nada por aqui"}
            subtitle={
              activeChip === "nao-triadas"
                ? "Nenhuma publicação ou andamento pendente"
                : activeChip === "sem-processo"
                  ? "Toda publicação recente já está vinculada a um processo"
                  : activeChip === "arquivadas"
                    ? "Nenhuma publicação arquivada"
                    : "Nenhuma publicação atribuída a você"
            }
          />
        </div>
      ) : (
        <PublicationsTriage groups={groups} users={users} activeChip={activeChip} viewerId={viewer.id} />
      )}
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-2.5 py-1.5 transition-colors ${
        active ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
      }`}
    >
      {label}
    </Link>
  );
}
