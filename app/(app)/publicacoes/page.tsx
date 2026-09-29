import Link from "next/link";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { EmptyState } from "@/components/ui";
import PublicationsTriage, { type TriageGroup, type CargaPorPessoa } from "@/components/PublicationsTriage";
import PublicationSelectFilter from "@/components/PublicationSelectFilter";
import PublicationFilterToggle from "@/components/PublicationFilterToggle";
import DistributePublicationsButton from "@/components/DistributePublicationsButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import { findPublicationIdsByProcessNumber } from "@/lib/processNumberSearch";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess, saoPauloDayKey } from "@/lib/publicationGrouping";
import { matchesPublicationChip, parsePublicationChip, type PublicationChipKey } from "@/lib/publicationChips";
import { extrairMelhorDoGrupo, situacaoPrazo, idadeEmDiasUteis, ORDEM_FAIXA } from "@/lib/prazoExtraido";
import { Search, TriangleAlert, X } from "lucide-react";
import { horaDeBrasilia } from "@/lib/horaDeBrasilia";

export const dynamic = "force-dynamic";

// Corte de segurança sobre os grupos JÁ FILTRADOS pelo chip ativo: nenhuma tela deste produto
// renderiza uma lista sem teto. O corte vem DEPOIS da ordenação por urgência (o mais urgente nunca
// fica de fora) e a tela avisa "Mostrando N de M".
const MAX_GROUPS_RENDERED = 150;

function formatHora(d: Date | null | undefined): string {
  if (!d) return "—";
  return horaDeBrasilia(d);
}

const PRAZOS = ["venc", "hoje", "d3", "d10", "sem"] as const;
type PrazoFiltro = (typeof PRAZOS)[number];
const PRAZO_ROTULO: Record<PrazoFiltro, string> = {
  venc: "vencidos",
  hoje: "vence hoje",
  d3: "até 3 dias úteis",
  d10: "até 10 dias úteis",
  sem: "não identificado",
};

export default async function PublicacoesPage({
  searchParams,
}: {
  searchParams: { aba?: string; kind?: string; q?: string; adv?: string; resp?: string; prazo?: string; ordem?: string; p?: string };
}) {
  const activeChip: PublicationChipKey = parsePublicationChip(searchParams.aba);
  const q = (searchParams.q || "").trim();
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const kind = searchParams.kind === "PUBLICACAO" || searchParams.kind === "ANDAMENTO" ? searchParams.kind : undefined;
  const prazoFiltro = (PRAZOS as readonly string[]).includes(searchParams.prazo ?? "") ? (searchParams.prazo as PrazoFiltro) : undefined;
  // "Tratadas" é histórico: a ordem por urgência não faz sentido para o que já foi tratado.
  const ordem: "urgencia" | "recentes" = searchParams.ordem === "recentes" || activeChip === "tratadas" ? "recentes" : "urgencia";

  // Um só universo do escritório inteiro, SEM filtros: dele saem a fila, as contagens das abas, o
  // quadro do dia e as opções dos filtros de pessoa. Mesmo conjunto para tudo é o que impede a
  // contradição de contadores ("46 contra 73") que a tela tinha. Os filtros são aplicados depois,
  // em memória, sobre os grupos (o corte de 3000 linhas já existia).
  const [publicationsRaw, users, blockedSet, holidaysRaw, ultimoRunDjen, ultimoRunDatajud, matchingProcessNumberIds] = await Promise.all([
    prisma.publication.findMany({
      where: { officeId: viewer.officeId },
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
      take: 3000,
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getBlockedProcessNumberSet(viewer.id),
    prisma.holiday.findMany({ where: { officeId: viewer.officeId }, select: { date: true } }),
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DJEN" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.integrationRun.findFirst({ where: { officeId: viewer.officeId, integration: "DATAJUD" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    // Busca por nº de processo ignora máscara (hífen, ponto, barra...) — ver lib/processNumberSearch.ts.
    q ? findPublicationIdsByProcessNumber(q, { officeId: viewer.officeId }) : Promise.resolve([] as string[]),
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

  // Agrupa por processo (mesmo CNJ normalizado) + dia — um card por grupo, ver lib/publicationGrouping.ts.
  const allGroups = groupPublicationsByProcess(serializedAll);

  const feriadosExtras = holidaysRaw.map((h) => ({ date: h.date.toISOString().slice(0, 10) }));
  const hojeKey = saoPauloDayKey(new Date());
  const todos: TriageGroup[] = allGroups.map((g) => {
    const prazo = extrairMelhorDoGrupo(g.items, feriadosExtras);
    return {
      ...g,
      prazo,
      situacao: situacaoPrazo(prazo, g.primary.kind, hojeKey, feriadosExtras),
      idadeDu: idadeEmDiasUteis(g.primary.publishedAt, hojeKey, feriadosExtras),
      registrado: g.items.some((i) => i.deadlineGenerated || (i.taskCount ?? 0) > 0),
    };
  });

  // ---- opções dos filtros de pessoa (dos DADOS, nunca nomes no código) e contagens ----
  const abertas = todos.filter((g) => g.primary.triageStatus !== "TRATADA");
  const citadoCount = new Map<string, number>();
  const respCount = new Map<string, number>();
  let semResponsavel = 0;
  for (const g of abertas) {
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

  // Parâmetro de filtro que não existe nos dados NÃO é descartado em silêncio: a tela avisa e ignora.
  const todasTags = new Set(todos.map((g) => g.primary.lawyerTag?.trim()).filter(Boolean) as string[]);
  const adv = searchParams.adv && todasTags.has(searchParams.adv) ? searchParams.adv : undefined;
  const resp = searchParams.resp && (searchParams.resp === "none" || users.some((u) => u.id === searchParams.resp)) ? searchParams.resp : undefined;
  const avisosFiltro: string[] = [];
  if (searchParams.adv && !adv) avisosFiltro.push(`Nenhuma publicação cita "${searchParams.adv}". Filtro ignorado.`);
  if (searchParams.resp && !resp) avisosFiltro.push("O responsável do filtro não existe neste escritório. Filtro ignorado.");
  const temFiltro = Boolean(q || kind || adv || resp || prazoFiltro);

  // ---- filtros em memória (sobre grupos) ----
  const qNorm = q.toLowerCase();
  const idsPorNumero = new Set(matchingProcessNumberIds);
  const passaFiltros = (g: TriageGroup): boolean => {
    if (kind && g.primary.kind !== kind) return false;
    if (adv && (g.primary.lawyerTag ?? "").trim().toLowerCase() !== adv.toLowerCase()) return false;
    if (resp === "none" ? g.primary.assignedToId !== null : resp && g.primary.assignedToId !== resp) return false;
    if (q && !g.items.some((i) => idsPorNumero.has(i.id) || i.content.toLowerCase().includes(qNorm) || i.source.toLowerCase().includes(qNorm))) return false;
    if (prazoFiltro) {
      const s = g.situacao;
      const ok =
        prazoFiltro === "venc" ? s.faixa === "venc" :
        prazoFiltro === "hoje" ? s.faixa === "hoje" :
        prazoFiltro === "d3" ? s.du !== null && s.du >= 0 && s.du <= 3 :
        prazoFiltro === "d10" ? s.du !== null && s.du >= 0 && s.du <= 10 :
        s.faixa === "sem" || s.faixa === "cien";
      if (!ok || g.registrado) return false;
    }
    return true;
  };

  // FILA POR URGÊNCIA (padrão): vencido, hoje, até 3 dias úteis, até 15, depois, prazo não
  // identificado, só ciência; dentro da faixa o vencimento mais próximo primeiro e, no empate, a
  // publicação mais antiga. Quem já tem prazo registrado vai para o fim. Ordena ANTES de cortar.
  const rank = (g: TriageGroup) => (g.registrado ? 7 : ORDEM_FAIXA[g.situacao.faixa]);
  const ordenados =
    ordem === "recentes"
      ? todos
      : todos.slice().sort((a, b) => {
          const r = rank(a) - rank(b);
          if (r !== 0) return r;
          const da = a.prazo.data ?? "";
          const db = b.prazo.data ?? "";
          if (da !== db) return da < db ? -1 : 1;
          return new Date(a.primary.publishedAt).getTime() - new Date(b.primary.publishedAt).getTime();
        });

  const doChip = ordenados.filter((g) => matchesPublicationChip(g, activeChip, viewer.id) && passaFiltros(g));
  const groups = doChip.slice(0, MAX_GROUPS_RENDERED);
  const cortado = doChip.length > groups.length;

  const chipCount = (chip: PublicationChipKey) => todos.filter((g) => matchesPublicationChip(g, chip, viewer.id)).length;
  const foraDoFiltro = chipCount(activeChip);
  const aTratarCount = abertas.length;

  // Carga por pessoa (abertas e vencidas) para o seletor de delegar/atribuir.
  const carga: CargaPorPessoa = {};
  for (const g of abertas) {
    const id = g.primary.assignedToId;
    if (!id) continue;
    carga[id] ??= { abertas: 0, vencidas: 0 };
    carga[id].abertas++;
    if (!g.registrado && g.situacao.faixa === "venc") carga[id].vencidas++;
  }

  // Quadro do dia: mesmo conjunto e mesma função da fila. "Vencidos" só com confiança média/alta;
  // os de confiança baixa aparecem à parte ("a confirmar"), para o número que assusta ser verdadeiro.
  const abertasSemRegistro = abertas.filter((g) => !g.registrado);
  const vencidos = abertasSemRegistro.filter((g) => g.situacao.faixa === "venc" && !g.situacao.aConfirmar).length;
  const aConfirmar = abertasSemRegistro.filter((g) => g.situacao.faixa === "venc" && g.situacao.aConfirmar).length;
  const ate3 = abertasSemRegistro.filter((g) => g.situacao.du !== null && g.situacao.du >= 0 && g.situacao.du <= 3 && g.prazo.tipo === "PRAZO").length;
  const maisAntiga = abertas.reduce((m, g) => Math.max(m, g.idadeDu), 0);
  const semRespAbertas = abertas.filter((g) => !g.primary.assignedToId).length;

  const initialKey = searchParams.p ? groups.find((g) => g.items.some((i) => i.id === searchParams.p))?.key : undefined;

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { aba: searchParams.aba, kind, q: searchParams.q, adv, resp, prazo: prazoFiltro, ordem: searchParams.ordem, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/publicacoes${s ? `?${s}` : ""}`;
  };
  const semFiltros = { q: undefined, kind: undefined, adv: undefined, resp: undefined, prazo: undefined };

  const chips: { key: PublicationChipKey; label: string; count: number }[] = [
    { key: "a-tratar", label: "A tratar", count: aTratarCount },
    { key: "minhas", label: "Minhas", count: chipCount("minhas") },
    { key: "sem-processo", label: "Sem processo", count: chipCount("sem-processo") },
    { key: "tratadas", label: "Tratadas", count: chipCount("tratadas") },
  ];
  const chipLabel = chips.find((c) => c.key === activeChip)?.label ?? "";
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const filtrosAtivos: { rotulo: string; href: string }[] = [];
  if (q) filtrosAtivos.push({ rotulo: `Busca: "${q}"`, href: qs({ q: undefined }) });
  if (kind) filtrosAtivos.push({ rotulo: kind === "PUBLICACAO" ? "Publicações" : "Andamentos", href: qs({ kind: undefined }) });
  if (resp) filtrosAtivos.push({ rotulo: `Responsável: ${resp === "none" ? "ninguém" : users.find((u) => u.id === resp)?.name ?? ""}`, href: qs({ resp: undefined }) });
  if (adv) filtrosAtivos.push({ rotulo: `Citado: ${adv}`, href: qs({ adv: undefined }) });
  if (prazoFiltro) filtrosAtivos.push({ rotulo: `Prazo: ${PRAZO_ROTULO[prazoFiltro]}`, href: qs({ prazo: undefined }) });

  const agora = horaDeBrasilia(new Date());

  return (
    <div className="pub-scope tela tela-alta">
      <a
        href="#fila-publicacoes"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:bg-acao focus:text-acao-tx focus:px-3 focus:py-2"
      >
        Pular para a fila de publicações
      </a>
      <header className="shrink-0 border-b-2 border-regua-forte px-4 md:px-6 pt-4">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-2">
          <h1 className="text-autuacao font-extrabold text-tx max-md:flex-1">Publicações</h1>
          {/* Quadro do dia: cada número filtra a fila. Vencido só com confiança média/alta. */}
          <nav aria-label="Quadro do dia" className="flex items-center gap-1 flex-wrap flex-1 min-w-0 max-md:order-3 max-md:basis-full max-md:flex-nowrap max-md:overflow-x-auto">
            <Link href={qs({ ...semFiltros, aba: undefined, prazo: "venc" })} className="min-h-11 md:min-h-9 px-2.5 inline-flex items-center gap-1.5 text-sm text-tx-2 hover:bg-sf-apoio whitespace-nowrap">
              <b className={vencidos > 0 ? "text-risco-vencido-tx" : "text-tx"}>{vencidos}</b> vencidos
            </Link>
            {aConfirmar > 0 && (
              <Link href={qs({ ...semFiltros, aba: undefined, prazo: "venc" })} className="min-h-11 md:min-h-9 px-2.5 inline-flex items-center gap-1.5 text-sm text-tx-2 hover:bg-sf-apoio whitespace-nowrap">
                <b className="text-risco-hoje-tx">{aConfirmar}</b> a confirmar
              </Link>
            )}
            <Link href={qs({ ...semFiltros, aba: undefined, prazo: "d3" })} className="min-h-11 md:min-h-9 px-2.5 inline-flex items-center gap-1.5 text-sm text-tx-2 hover:bg-sf-apoio whitespace-nowrap">
              <b className={ate3 > 0 ? "text-risco-hoje-tx" : "text-tx"}>{ate3}</b> vencem em até 3 dias úteis
            </Link>
            <Link href={qs({ ...semFiltros, aba: undefined })} className="min-h-11 md:min-h-9 px-2.5 inline-flex items-center gap-1.5 text-sm text-tx-2 hover:bg-sf-apoio whitespace-nowrap">
              <b className="text-tx">{aTratarCount}</b> a tratar
            </Link>
            <span className="px-2 text-sm text-tx-2 whitespace-nowrap">
              mais antiga: <b className="text-tx">{maisAntiga} {maisAntiga === 1 ? "dia útil" : "dias úteis"}</b>
            </span>
          </nav>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-tx-2 text-right leading-tight max-md:hidden">
              DJEN {formatHora(ultimoRunDjen?.startedAt)}
              <br />
              DataJud {formatHora(ultimoRunDatajud?.startedAt)}
            </span>
            <SyncPublicationsButton />
            {viewer.isAdmin && semRespAbertas > 0 && <DistributePublicationsButton count={semRespAbertas} />}
          </div>
        </div>

        <nav aria-label="Filas de publicações" className="flex overflow-x-auto scrollbar-thin -mx-4 px-4 md:mx-0 md:px-0">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={qs({ aba: chip.key === "a-tratar" ? undefined : chip.key })}
              aria-current={activeChip === chip.key ? "true" : undefined}
              className={`min-h-11 px-3.5 inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold border-b-[3px] transition-colors ${
                activeChip === chip.key ? "text-tx border-marca-tx" : "text-tx-2 border-transparent hover:bg-sf-apoio"
              }`}
            >
              {chip.label} <span className="font-medium text-tx-3">{chip.count}</span>
            </Link>
          ))}
        </nav>

        <form className="pub-filtros flex gap-2 py-2.5 flex-wrap items-center">
          {searchParams.aba && <input type="hidden" name="aba" value={searchParams.aba} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          {adv && <input type="hidden" name="adv" value={adv} />}
          {resp && <input type="hidden" name="resp" value={resp} />}
          {prazoFiltro && <input type="hidden" name="prazo" value={prazoFiltro} />}
          {searchParams.ordem && <input type="hidden" name="ordem" value={searchParams.ordem} />}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={searchParams.q}
              aria-label="Buscar por processo, parte, conteúdo ou fonte"
              placeholder="Processo, parte ou texto"
              className="w-full border border-regua-forte bg-sf text-tx placeholder:text-tx-3 pl-8 pr-3 min-h-11 md:min-h-9 text-sm"
            />
          </div>
          <PublicationFilterToggle ativos={filtrosAtivos.length}>
            <PublicationSelectFilter param="kind" label="Tipo" allLabel="todos" options={[{ value: "PUBLICACAO", label: "publicações" }, { value: "ANDAMENTO", label: "andamentos" }]} value={kind} baseParams={{ aba: searchParams.aba, q: searchParams.q, adv, resp, prazo: prazoFiltro, ordem: searchParams.ordem }} />
            <PublicationSelectFilter param="resp" label="Responsável" allLabel="todos" options={respOptions} value={resp} baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, adv, prazo: prazoFiltro, ordem: searchParams.ordem }} />
            {citadoOptions.length > 0 && (
              <PublicationSelectFilter param="adv" label="Citado" allLabel="todos" options={citadoOptions} value={adv} baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, resp, prazo: prazoFiltro, ordem: searchParams.ordem }} />
            )}
            <PublicationSelectFilter
              param="prazo"
              label="Prazo"
              allLabel="qualquer"
              options={PRAZOS.map((p) => ({ value: p, label: PRAZO_ROTULO[p] }))}
              value={prazoFiltro}
              baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, adv, resp, ordem: searchParams.ordem }}
            />
            {activeChip !== "tratadas" && (
              <PublicationSelectFilter param="ordem" label="Ordem" allLabel="urgência" neutro options={[{ value: "recentes", label: "mais recentes" }]} value={searchParams.ordem === "recentes" ? "recentes" : undefined} baseParams={{ aba: searchParams.aba, kind, q: searchParams.q, adv, resp, prazo: prazoFiltro }} />
            )}
          </PublicationFilterToggle>
          <button type="submit" className="sr-only">Buscar</button>
        </form>

        {(filtrosAtivos.length > 0 || avisosFiltro.length > 0 || cortado) && (
          <div className="pb-2.5 space-y-1.5" role="status">
            {filtrosAtivos.length > 0 && (
              <p className="flex items-center gap-2 flex-wrap text-xs text-tx-2">
                <span>
                  <b className="text-tx">{doChip.length}</b> de {foraDoFiltro}
                </span>
                {filtrosAtivos.map((f) => (
                  <Link key={f.rotulo} href={f.href} aria-label={`Remover filtro: ${f.rotulo}`} className="inline-flex items-center gap-1 border border-regua-forte bg-sf pl-2 pr-1 min-h-8 font-semibold text-tx">
                    {f.rotulo} <X size={14} aria-hidden="true" />
                  </Link>
                ))}
                <Link href={qs(semFiltros)} className="font-semibold text-marca-tx underline underline-offset-2 px-1 min-h-8 inline-flex items-center">
                  Limpar filtros
                </Link>
              </p>
            )}
            {avisosFiltro.map((a) => (
              <p key={a} className="flex items-center gap-1.5 text-xs font-semibold text-risco-hoje-tx">
                <TriangleAlert size={13} aria-hidden="true" /> {a}
              </p>
            ))}
            {cortado && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-risco-hoje-tx">
                <TriangleAlert size={13} aria-hidden="true" /> Mostrando as {groups.length} mais {ordem === "urgencia" ? "urgentes" : "recentes"} de {doChip.length}. Refine os filtros para ver as demais.
              </p>
            )}
          </div>
        )}
      </header>

      {groups.length === 0 ? (
        <div className="p-6" role="status" id="fila-publicacoes" tabIndex={-1}>
          {temFiltro ? (
            // Busca ou filtro sem resultado NUNCA é "tudo triado": o escritório pode ter dezenas de
            // pendências que só ficaram fora do recorte.
            <EmptyState
              title="Nada encontrado com esses filtros"
              subtitle={
                foraDoFiltro > 0
                  ? `${plural(foraDoFiltro, "publicação da aba", "publicações da aba")} "${chipLabel}" ficam fora do filtro${activeChip === "a-tratar" && vencidos > 0 ? `, ${vencidos} delas vencidas` : ""}.`
                  : `A aba "${chipLabel}" está vazia, mesmo sem filtros.`
              }
              action={
                <Link href={qs(semFiltros)} className="inline-flex items-center min-h-11 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2">
                  Limpar filtros
                </Link>
              }
            />
          ) : activeChip === "a-tratar" ? (
            // Só aqui, com a fila de STATUS zerada e sem filtro nenhum, a tela diz que zerou — e a hora.
            <EmptyState title={`Fila zerada às ${agora}`} subtitle={`${plural(chipCount("tratadas"), "publicação tratada", "publicações tratadas")} no total. Novas publicações chegam pela busca automática.`} action={<Link href="/agenda" className="inline-flex items-center min-h-11 border border-regua-forte text-sm font-semibold px-4 py-2 hover:bg-sf-apoio">Ver a Agenda</Link>} />
          ) : (
            <EmptyState
              title={activeChip === "minhas" ? "Nada atribuído a você" : activeChip === "sem-processo" ? "Todas as publicações a tratar têm processo" : "Nenhuma tratada ainda"}
              subtitle={
                activeChip === "minhas"
                  ? `${plural(aTratarCount, "publicação a tratar", "publicações a tratar")} no escritório${vencidos ? `, ${vencidos} vencidas` : ""}.`
                  : activeChip === "sem-processo"
                    ? "Nenhuma publicação a tratar está sem processo vinculado."
                    : "As publicações tratadas aparecem aqui."
              }
              action={
                activeChip === "minhas" || activeChip === "sem-processo" ? (
                  <Link href={qs({ aba: undefined })} className="inline-flex items-center min-h-11 border border-regua-forte text-sm font-semibold px-4 py-2 hover:bg-sf-apoio">
                    Ver todas a tratar
                  </Link>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <PublicationsTriage
          groups={groups}
          users={users}
          activeChip={activeChip}
          viewerId={viewer.id}
          initialKey={initialKey}
          carga={carga}
          totalAbertas={aTratarCount}
          agrupar={ordem === "urgencia"}
        />
      )}
    </div>
  );
}
