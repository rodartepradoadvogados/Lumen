import Link from "next/link";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { EmptyState } from "@/components/ui";
import PublicationsTriage, { type TriageGroup } from "@/components/PublicationsTriage";
import PublicationSelectFilter from "@/components/PublicationSelectFilter";
import DistributePublicationsButton from "@/components/DistributePublicationsButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import MarkAllPublicationsReadButton from "@/components/MarkAllPublicationsReadButton";
import { findPublicationIdsByProcessNumber } from "@/lib/processNumberSearch";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess, saoPauloDayKey } from "@/lib/publicationGrouping";
import { matchesPublicationChip, parsePublicationChip, type PublicationChipKey } from "@/lib/publicationChips";
import { extrairMelhorDoGrupo, situacaoPrazo, idadeEmDiasUteis, ORDEM_FAIXA } from "@/lib/prazoExtraido";
import { Search, TriangleAlert } from "lucide-react";
import { horaDeBrasilia } from "@/lib/horaDeBrasilia";

export const dynamic = "force-dynamic";

// Corte de segurança sobre os grupos JÁ FILTRADOS pelo chip ativo — mesmo espírito do corte de
// 100 que a listagem antiga (por abas) já aplicava (achado A70 da revisão gauntlet): nenhuma
// tela deste produto renderiza uma lista sem teto, por maior que seja o escritório.
const MAX_GROUPS_RENDERED = 150;

function formatHora(d: Date | null | undefined): string {
  if (!d) return "—";
  return horaDeBrasilia(d);
}

export default async function PublicacoesPage({
  searchParams,
}: {
  searchParams: { aba?: string; kind?: string; q?: string; adv?: string; resp?: string; ordem?: string; p?: string };
}) {
  const activeChip: PublicationChipKey = parsePublicationChip(searchParams.aba);
  const q = (searchParams.q || "").trim();
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const kind = searchParams.kind === "PUBLICACAO" || searchParams.kind === "ANDAMENTO" ? searchParams.kind : undefined;
  // Arquivadas é histórico: a ordem por urgência não faz sentido para o que já foi tratado.
  const ordem: "urgencia" | "recentes" = searchParams.ordem === "recentes" || activeChip === "arquivadas" ? "recentes" : "urgencia";

  // Universo do escritório inteiro, SEM filtros de tipo/citado/responsável/busca: alimenta a
  // contagem dos chips, as opções dos filtros de pessoa (que vêm dos dados, não do código) e a
  // frase de "quantas ficaram fora do filtro" do estado vazio. Uma consulta só, mesmo conjunto
  // para tudo — é o que impede a contradição de contadores que a tela tinha ("Sem processo 0"
  // ao lado de "Não triadas 46" com a mesma busca ativa).
  const [officeRowsRaw, users, blockedSet] = await Promise.all([
    prisma.publication.findMany({
      where: { officeId: viewer.officeId },
      select: {
        id: true,
        source: true,
        publishedAt: true,
        processNumberRaw: true,
        lawyerTag: true,
        assignedToId: true,
        triageStatus: true,
        caseId: true,
        reads: { where: { userId: viewer.id }, select: { userId: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 5000,
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getBlockedProcessNumberSet(viewer.id),
  ]);
  const officeGroups = groupPublicationsByProcess(
    officeRowsRaw
      .filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet))
      .map((p) => ({
        id: p.id,
        source: p.source,
        publishedAt: p.publishedAt.toISOString(),
        processNumberRaw: p.processNumberRaw,
        read: p.reads.length > 0,
        lawyerTag: p.lawyerTag,
        assignedToId: p.assignedToId,
        triageStatus: p.triageStatus,
        case: p.caseId ? { id: p.caseId } : null,
      }))
  );

  const citadoCount = new Map<string, number>();
  const respCount = new Map<string, number>();
  let semResponsavel = 0;
  for (const g of officeGroups) {
    const tag = g.primary.lawyerTag?.trim();
    if (tag) citadoCount.set(tag, (citadoCount.get(tag) ?? 0) + 1);
    if (g.primary.assignedToId) respCount.set(g.primary.assignedToId, (respCount.get(g.primary.assignedToId) ?? 0) + 1);
    else semResponsavel++;
  }
  const citadoOptions = Array.from(citadoCount.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([value, count]) => ({ value, label: value, count }));
  const respOptions = [
    ...users.map((u) => ({ value: u.id, label: u.name, count: respCount.get(u.id) ?? 0 })),
    { value: "none", label: "Ninguém (sem responsável)", count: semResponsavel },
  ];

  // Parâmetro de filtro que não existe nos dados NÃO é descartado em silêncio (antes, "?adv=Camila"
  // devolvia a fila inteira como se tivesse filtrado): a tela avisa e ignora.
  const adv = searchParams.adv && citadoCount.has(searchParams.adv) ? searchParams.adv : undefined;
  const resp = searchParams.resp && (searchParams.resp === "none" || users.some((u) => u.id === searchParams.resp)) ? searchParams.resp : undefined;
  const avisosFiltro: string[] = [];
  if (searchParams.adv && !adv) avisosFiltro.push(`Nenhuma publicação cita "${searchParams.adv}". Filtro ignorado.`);
  if (searchParams.resp && !resp) avisosFiltro.push("O responsável do filtro não existe neste escritório. Filtro ignorado.");

  // Filtro do CHIP ativo não entra no "where" do banco, pelo mesmo motivo de sempre: ele é uma
  // propriedade do GRUPO (agrupado por processo+dia, ver lib/publicationGrouping.ts), decidida
  // só depois do agrupamento — filtrar linha a linha no banco podia trazer metade de um grupo.
  const baseFilters: Prisma.PublicationWhereInput = {
    officeId: viewer.officeId,
    kind,
    lawyerTag: adv ? { equals: adv, mode: "insensitive" } : undefined,
    assignedToId: resp === "none" ? null : resp || undefined,
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

  const [publicationsRaw, holidaysRaw, ultimoRunDjen, ultimoRunDatajud] = await Promise.all([
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
        tribunalDetectado: true,
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
    // Feriados extras do escritório (Holiday) para contar o prazo extraído do teor — ver
    // lib/prazoExtraido.ts / lib/prazos.ts.
    prisma.holiday.findMany({ where: { officeId: viewer.officeId }, select: { date: true } }),
    // Última execução de DJEN/DATAJUD (IntegrationRun, ver documento 04 / /conexoes) — só para a
    // linha "DJEN {hora} · Datajud {hora}" do cabeçalho; o estado de saúde da integração em si
    // (ok/erro/aviso) mora em /conexoes, não aqui.
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DJEN" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DATAJUD" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  const publications = publicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet));

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
    tribunalDetectado: p.tribunalDetectado,
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
  const hojeKey = saoPauloDayKey(new Date());
  const groupsWithPrazo: TriageGroup[] = allGroups.map((g) => {
    const prazo = extrairMelhorDoGrupo(g.items, feriadosExtras);
    const registrado = g.items.some((i) => i.deadlineGenerated || (i.taskCount ?? 0) > 0);
    return {
      ...g,
      prazo,
      situacao: situacaoPrazo(prazo, g.primary.kind, hojeKey, feriadosExtras),
      idadeDu: idadeEmDiasUteis(g.primary.publishedAt, hojeKey, feriadosExtras),
      registrado,
    };
  });

  // FILA POR URGÊNCIA (padrão): vencido, vence hoje, até 3 dias úteis, até 15, depois, prazo não
  // identificado, só ciência — dentro da faixa, o vencimento mais próximo primeiro e, no empate, a
  // publicação mais antiga. Quem já tem prazo registrado (ou foi tratada) vai para o fim. Ordena ANTES
  // de cortar em MAX_GROUPS_RENDERED, para o mais urgente nunca ser o que fica de fora. "Mais
  // recentes" mantém a ordem do agrupamento (data de publicação, mais nova primeiro).
  const rank = (g: TriageGroup) => (g.registrado || g.primary.triageStatus === "TRATADA" ? 7 : ORDEM_FAIXA[g.situacao.faixa]);
  const ordenados =
    ordem === "recentes"
      ? groupsWithPrazo
      : groupsWithPrazo.slice().sort((a, b) => {
          const r = rank(a) - rank(b);
          if (r !== 0) return r;
          const da = a.prazo.data ?? "";
          const db = b.prazo.data ?? "";
          if (da !== db) return da < db ? -1 : 1;
          return new Date(a.primary.publishedAt).getTime() - new Date(b.primary.publishedAt).getTime();
        });

  const doChip = ordenados.filter((g) => matchesPublicationChip(g, activeChip, viewer.id));
  const groups = doChip.slice(0, MAX_GROUPS_RENDERED);
  const cortado = doChip.length > groups.length;

  const chipCount = (chip: PublicationChipKey) => officeGroups.filter((g) => matchesPublicationChip(g, chip, viewer.id)).length;
  const foraDoFiltro = chipCount(activeChip);
  const semProcessoCount = chipCount("sem-processo");
  const naoTriadasCount = chipCount("nao-triadas");
  const aTratarCount = chipCount("a-tratar");
  const minhasCount = chipCount("minhas");
  const temFiltro = Boolean(q || kind || adv || resp);

  // Publicação aberta por link (?p=): só vale se estiver na lista mostrada.
  const initialKey = searchParams.p ? groups.find((g) => g.items.some((i) => i.id === searchParams.p))?.key : undefined;

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { aba: searchParams.aba, kind, q: searchParams.q, adv, resp, ordem: searchParams.ordem, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };

  const chips: { key: PublicationChipKey; label: string; count?: number }[] = [
    { key: "nao-triadas", label: "Não triadas", count: naoTriadasCount },
    { key: "a-tratar", label: "A tratar", count: aTratarCount },
    { key: "minhas", label: "Minhas", count: minhasCount },
    { key: "sem-processo", label: "Sem processo", count: semProcessoCount },
    { key: "arquivadas", label: "Arquivadas" },
  ];
  const chipLabel = chips.find((c) => c.key === activeChip)?.label ?? "";
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="tela tela-alta">
      <header className="shrink-0 border-b-2 border-regua-forte px-6 pt-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <h1 className="text-autuacao font-extrabold text-tx">Publicações</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display text-corpo text-tx-2">
              DJEN {formatHora(ultimoRunDjen?.startedAt)} · Datajud {formatHora(ultimoRunDatajud?.startedAt)}
            </span>
            <SyncPublicationsButton />
            {naoTriadasCount > 0 && <MarkAllPublicationsReadButton count={naoTriadasCount} />}
            {viewer.isAdmin && <DistributePublicationsButton />}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pb-3 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={qs({ aba: chip.key === "nao-triadas" ? undefined : chip.key })}
                aria-current={activeChip === chip.key ? "page" : undefined}
                className={`font-display text-sm font-semibold px-3.5 py-1.5 transition-colors ${
                  activeChip === chip.key ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 hover:bg-regua"
                }`}
              >
                {chip.label}
                {chip.count !== undefined && ` · ${chip.count}`}
              </Link>
            ))}
          </div>
          {activeChip !== "arquivadas" && (
            <nav aria-label="Ordem da fila" className="flex items-center gap-1 text-xs font-semibold text-tx-2">
              <span>Ordem:</span>
              <Link
                href={qs({ ordem: undefined })}
                aria-current={ordem === "urgencia" ? "true" : undefined}
                className={`px-2.5 py-1.5 ${ordem === "urgencia" ? "bg-acao text-acao-tx" : "bg-sf border border-regua hover:bg-sf-apoio"}`}
              >
                Urgência
              </Link>
              <Link
                href={qs({ ordem: "recentes" })}
                aria-current={ordem === "recentes" ? "true" : undefined}
                className={`px-2.5 py-1.5 ${ordem === "recentes" ? "bg-acao text-acao-tx" : "bg-sf border border-regua hover:bg-sf-apoio"}`}
              >
                Mais recentes
              </Link>
            </nav>
          )}
        </div>

        <form className="pub-filtros flex gap-2 pb-4 flex-wrap items-center">
          {searchParams.aba && <input type="hidden" name="aba" value={searchParams.aba} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          {adv && <input type="hidden" name="adv" value={adv} />}
          {resp && <input type="hidden" name="resp" value={resp} />}
          {searchParams.ordem && <input type="hidden" name="ordem" value={searchParams.ordem} />}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q}
              aria-label="Buscar publicações por processo, conteúdo ou fonte"
              placeholder="Buscar por processo, conteúdo ou fonte"
              className="w-full border border-regua bg-sf text-tx pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca-tx"
            />
          </div>
          <FilterLink label="Publicações" href={qs({ kind: kind === "PUBLICACAO" ? undefined : "PUBLICACAO" })} active={kind === "PUBLICACAO"} />
          <FilterLink label="Andamentos" href={qs({ kind: kind === "ANDAMENTO" ? undefined : "ANDAMENTO" })} active={kind === "ANDAMENTO"} />
          {citadoOptions.length > 0 && (
            <PublicationSelectFilter
              param="adv"
              label="Citado"
              options={citadoOptions}
              value={adv}
              baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, resp, ordem: searchParams.ordem }}
            />
          )}
          <PublicationSelectFilter
            param="resp"
            label="Responsável"
            options={respOptions}
            value={resp}
            baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, adv, ordem: searchParams.ordem }}
          />
          {temFiltro && (
            <Link href={qs({ q: undefined, kind: undefined, adv: undefined, resp: undefined })} className="text-xs font-semibold text-tx-3 hover:text-tx px-1">
              Limpar filtros
            </Link>
          )}
        </form>

        {(avisosFiltro.length > 0 || cortado) && (
          <div className="pb-3 space-y-1" role="status">
            {avisosFiltro.map((a) => (
              <p key={a} className="flex items-center gap-1.5 text-xs font-semibold text-aviso">
                <TriangleAlert size={13} /> {a}
              </p>
            ))}
            {cortado && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-aviso">
                <TriangleAlert size={13} /> Mostrando as {groups.length} mais {ordem === "urgencia" ? "urgentes" : "recentes"} de {doChip.length}. Refine os filtros para ver as demais.
              </p>
            )}
          </div>
        )}
      </header>

      {groups.length === 0 ? (
        <div className="p-6" role="status">
          {temFiltro ? (
            // Busca ou filtro sem resultado NUNCA é "tudo triado": o escritório pode ter dezenas de
            // pendências que só ficaram fora do recorte.
            <EmptyState
              title="Nada encontrado com esses filtros"
              subtitle={
                foraDoFiltro > 0
                  ? `${plural(foraDoFiltro, "publicação da aba", "publicações da aba")} "${chipLabel}" ficam fora do filtro.`
                  : `A aba "${chipLabel}" está vazia, mesmo sem filtros.`
              }
              action={
                <Link
                  href={qs({ q: undefined, kind: undefined, adv: undefined, resp: undefined })}
                  className="inline-flex items-center min-h-11 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2"
                >
                  Limpar filtros
                </Link>
              }
            />
          ) : activeChip === "nao-triadas" ? (
            // "Não triadas" é leitura pessoal: vazio quer dizer "você já viu tudo", não "não há
            // nada pendente". O que foi visto e não tratado continua na aba "A tratar".
            <EmptyState
              title="Nenhuma publicação não lida"
              subtitle={
                aTratarCount > 0
                  ? `Você já viu tudo o que chegou, mas ${plural(aTratarCount, "publicação ainda não foi tratada", "publicações ainda não foram tratadas")} (sem prazo registrado nem arquivamento).`
                  : "Você já viu tudo o que chegou e nada está pendente de tratamento."
              }
              action={
                aTratarCount > 0 ? (
                  <Link href={qs({ aba: "a-tratar" })} className="inline-flex items-center min-h-11 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2">
                    Ver as {aTratarCount} a tratar
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              title={activeChip === "a-tratar" ? "Nada a tratar" : "Nada por aqui"}
              subtitle={
                activeChip === "a-tratar"
                  ? "Toda publicação do escritório já foi tratada."
                  : activeChip === "sem-processo"
                    ? "Toda publicação já está vinculada a um processo."
                    : activeChip === "arquivadas"
                      ? "Nenhuma publicação arquivada."
                      : "Nenhuma publicação atribuída a você."
              }
            />
          )}
        </div>
      ) : (
        <PublicationsTriage groups={groups} users={users} activeChip={activeChip} viewerId={viewer.id} initialKey={initialKey} />
      )}
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`font-display text-xs font-semibold px-2.5 py-1.5 transition-colors ${
        active ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
      }`}
    >
      {label}
    </Link>
  );
}
