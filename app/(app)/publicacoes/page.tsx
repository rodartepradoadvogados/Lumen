import Link from "next/link";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import PublicationsList from "@/components/PublicationsList";
import PublicationRespFilter from "@/components/PublicationRespFilter";
import DistributePublicationsButton from "@/components/DistributePublicationsButton";
import MarkAllPublicationsReadButton from "@/components/MarkAllPublicationsReadButton";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import { findPublicationIdsByProcessNumber } from "@/lib/processNumberSearch";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { groupPublicationsByProcess, countUnreadPublicationGroups } from "@/lib/publicationGrouping";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicacoesPage({
  searchParams,
}: {
  searchParams: { aba?: string; kind?: string; q?: string; adv?: string; resp?: string };
}) {
  const isLidas = searchParams.aba === "lidas";
  const isTodos = searchParams.aba === "todos";
  const q = (searchParams.q || "").trim();
  const adv = searchParams.adv === "Jairo" || searchParams.adv === "Rodrigo" ? searchParams.adv : undefined;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const resp = (searchParams.resp || "").trim() || undefined;

  // Filtro de lida/não lida NÃO entra mais no "where" do banco: agora ele é decidido depois de
  // agrupar por processo (ver abaixo), porque "lida" passa a ser uma propriedade do GRUPO (só
  // conta como lido quando TODOS os itens do grupo estão lidos) — filtrar linha a linha no banco
  // podia trazer só metade de um grupo (ex.: o item DJEN já lido ficava de fora da aba Não lidas
  // mesmo quando o item Jusbrasil do mesmo processo ainda estava pendente), o que quebraria a
  // escolha de qual fonte é a principal e o conteúdo mostrado ao expandir o grupo.
  const baseFilters: Prisma.PublicationWhereInput = {
    officeId: viewer.officeId,
    kind: searchParams.kind || undefined,
    lawyerTag: adv ? { contains: adv } : undefined,
    assignedToId: resp || undefined,
  };
  // Busca por nº de processo ignora máscara (hífen, ponto, barra...) — ver lib/processNumberSearch.ts.
  const matchingProcessNumberIds = q ? await findPublicationIdsByProcessNumber(q, baseFilters) : [];

  // Filtros/busca (tipo, advogado, responsável, texto/fonte) continuam operando por PUBLICAÇÃO
  // individual, não pelo grupo inteiro: cada linha ainda precisa bater com o "where" pra entrar
  // no resultado. Na prática isso já resolve a dúvida "filtrar por fonte deve olhar só o item
  // principal do grupo ou qualquer item?" a favor de "qualquer item que bater some no grupo, mas
  // só ele (e o que mais bater) entra na lista/expansão exibida" — ex.: buscar "esaj" mostra o
  // grupo com o card principal ESAJ (não DJEN), mesmo que o processo tenha um andamento DJEN mais
  // antigo que não bateu a busca e por isso não aparece nem no card nem ao expandir.
  const where: Prisma.PublicationWhereInput = {
    ...baseFilters,
    ...(q
      ? {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            { emailSubject: { contains: q, mode: "insensitive" } },
            // Fonte (Datajud, DJEN, Jusbrasil_email, PJE...) também entra na busca — sem isso,
            // digitar "datajud" no campo não achava nada, já que a fonte não é texto livre do
            // conteúdo/assunto.
            { source: { contains: q, mode: "insensitive" } },
            ...(matchingProcessNumberIds.length ? [{ id: { in: matchingProcessNumberIds } }] : []),
          ],
        }
      : {}),
  };

  const [publicationsRaw, unreadRowsRaw, users, blockedSet] = await Promise.all([
    prisma.publication.findMany({
      where,
      // select em vez de include para case/client: a serialização abaixo só usa
      // id/title/processNumber e id/name — trazer a linha inteira de cada um custava caro à toa
      // em até 3000 Publication por render (achado A70 da revisão gauntlet).
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
      // risco de truncar um grupo no meio. O corte por aba (100 mais recentes em Lidas/Todos)
      // acontece depois, sobre a lista já agrupada — este limite é só uma rede de segurança bem
      // folgada contra um escritório com histórico enorme.
      take: 3000,
    }),
    // Contagem de não lidas do cabeçalho/aba: ignora os filtros de tipo/advogado/responsável/busca
    // de propósito (mesmo comportamento de antes) — é sempre "quantos grupos têm pendência no
    // escritório inteiro". Só precisamos do id + processo de cada linha não lida: se a linha está
    // aqui, o grupo dela já conta como pendente, não precisamos saber o estado dos irmãos dela.
    prisma.publication.findMany({
      where: { officeId: viewer.officeId, reads: { none: { userId: viewer.id } } },
      select: { id: true, processNumberRaw: true, publishedAt: true },
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getBlockedProcessNumberSet(viewer.id),
  ]);
  // Bloqueio de processo é por usuário: esconde completamente da fila de quem bloqueou, em
  // qualquer aba (Não lidas/Lidas/Todos) — os demais advogados do escritório não são afetados.
  const publications = publicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet));
  const unreadCount = countUnreadPublicationGroups(unreadRowsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet)));

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
    // Publicação já gravada antes da correção pode ter o teor escapado em HTML; decodificar na
  // leitura conserta o histórico sem precisar reescrever o banco. É inócuo em texto já limpo,
  // porque nele não sobra nenhuma sequência "&...;" para converter.
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

  // Agrupa por processo (mesmo CNJ de 20 dígitos normalizado) — um card por grupo, escolhendo a
  // fonte de maior prioridade como principal (ver lib/publicationGrouping.ts). "allRead" decide a
  // aba: só sai de Não lidas quando TODOS os itens do grupo já foram lidos pelo viewer.
  const allGroups = groupPublicationsByProcess(serializedAll);
  const tabFilteredGroups = isTodos ? allGroups : isLidas ? allGroups.filter((g) => g.allRead) : allGroups.filter((g) => !g.allRead);
  // Corte de 100 grupos aplicado às três abas — antes só cobria Lidas/Todos; a aba padrão Não
  // lidas renderizava todos os grupos pendentes sem limite (achado A70 da revisão gauntlet).
  const groups = tabFilteredGroups.slice(0, 100);

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { aba: searchParams.aba, kind: searchParams.kind, q: searchParams.q, adv: searchParams.adv, resp: searchParams.resp, ...extra };
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
          isTodos
            ? `Todas (100 mais recentes) — lidas e não lidas`
            : isLidas
            ? `Histórico de lidas (100 mais recentes)`
            : `${unreadCount} não lida(s) — some daqui assim que marcada como lida`
        }
        action={
          viewer?.isAdmin && (
            <div className="flex gap-2">
              <SyncPublicationsButton />
              <DistributePublicationsButton />
            </div>
          )
        }
      />

      <div className="flex gap-1 border-b border-regua mb-4 overflow-x-auto">
        <TabLink label={`Não lidas${unreadCount ? ` (${unreadCount})` : ""}`} href={qs({ aba: undefined })} active={!isLidas && !isTodos} />
        <TabLink label="Lidas" href={qs({ aba: "lidas" })} active={isLidas} />
        <TabLink label="Todos" href={qs({ aba: "todos" })} active={isTodos} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <FilterLink label="Todos os tipos" href={qs({ kind: undefined })} active={!searchParams.kind} />
        <FilterLink label="Publicações" href={qs({ kind: "PUBLICACAO" })} active={searchParams.kind === "PUBLICACAO"} />
        <FilterLink label="Andamentos" href={qs({ kind: "ANDAMENTO" })} active={searchParams.kind === "ANDAMENTO"} />
        <span className="w-px h-5 bg-regua mx-1" />
        <FilterLink label="Todos advogados" href={qs({ adv: undefined })} active={!adv} />
        <FilterLink label="Jairo" href={qs({ adv: "Jairo" })} active={adv === "Jairo"} />
        <FilterLink label="Rodrigo" href={qs({ adv: "Rodrigo" })} active={adv === "Rodrigo"} />
        <span className="w-px h-5 bg-regua mx-1" />
        <PublicationRespFilter users={users} value={resp} baseParams={{ aba: searchParams.aba, kind: searchParams.kind, q: searchParams.q, adv: searchParams.adv }} />
        {viewer && (
          <FilterLink label="Minhas" href={qs({ resp: viewer.id })} active={resp === viewer.id} />
        )}
      </div>

      <form className="flex gap-2 mb-4">
        {searchParams.aba && <input type="hidden" name="aba" value={searchParams.aba} />}
        {searchParams.kind && <input type="hidden" name="kind" value={searchParams.kind} />}
        {searchParams.adv && <input type="hidden" name="adv" value={searchParams.adv} />}
        {searchParams.resp && <input type="hidden" name="resp" value={searchParams.resp} />}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Buscar por número do processo, conteúdo ou título"
            className="w-full border border-regua bg-sf text-tx rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40"
          />
        </div>
        <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
        {q && (
          <Link href={qs({ q: undefined })} className="text-xs font-semibold text-tx-2 hover:text-tx px-2 flex items-center">
            Limpar
          </Link>
        )}
      </form>

      {!isLidas && !isTodos && unreadCount > 0 && (
        <div className="flex justify-end mb-3">
          <MarkAllPublicationsReadButton count={unreadCount} />
        </div>
      )}

      <Card>
        {groups.length === 0 ? (
          isTodos ? (
            <EmptyState title="Nenhuma publicação" subtitle="Publicações e andamentos aparecem aqui assim que forem capturados" />
          ) : isLidas ? (
            <EmptyState title="Nenhuma publicação lida" subtitle="As publicações marcadas como lidas aparecem aqui" />
          ) : (
            <EmptyState title="Tudo lido!" subtitle="Nenhuma publicação ou andamento pendente" />
          )
        ) : (
          <PublicationsList groups={groups} highlightNew={!isLidas && !isTodos} users={users} />
        )}
      </Card>
    </div>
  );
}

function TabLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-sm px-4 py-2.5 border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? "border-acao text-tx font-semibold" : "border-transparent text-tx-3 font-medium hover:text-tx-2"
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
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active ? "bg-acao text-acao-tx border-acao" : "bg-sf text-tx-2 border-regua hover:bg-sf-apoio"
      }`}
    >
      {label}
    </Link>
  );
}
