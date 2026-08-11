import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, Badge, formatCurrency, EmptyState } from "@/components/ui";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import NewEntityMenu from "@/components/NewEntityMenu";
import ProcessosFiltroForm from "@/components/ProcessosFiltroForm";
import { buildCasesWhere } from "@/lib/casesFilter";
import { effectiveCaseClients, effectiveCaseParties, joinCaseNames } from "@/lib/caseParties";
import {
  type CaseNatureza,
  naturezaOf,
  naturezaWhere,
  parseNaturezaParam,
  NATUREZA_LABELS,
  ESFERAS,
  MATERIAS_ADMIN,
  MATERIA_LABELS,
} from "@/lib/caseNatureza";
import { Scale } from "lucide-react";

export const dynamic = "force-dynamic";

// ARQUIVADO usa o mesmo chip neutro de ENCERRADO — --urgente é reservado para dado vencido/KPI
// negativo (DESIGN-SYSTEM.md §2), e arquivar é encerramento deliberado, não isso.
const statusColors: Record<string, "green" | "amber" | "slate" | "red"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "slate",
};

const SORTS: Record<string, Prisma.CaseOrderByWithRelationInput> = {
  nome: { title: "asc" },
  valor: { caseValue: "desc" },
  movimentacao: { lastHistoryAt: "desc" },
  recente: { createdAt: "desc" },
};

const sortLabels: Record<string, string> = {
  nome: "Nome A-Z",
  valor: "Valor da causa ↓",
  movimentacao: "Última movimentação ↓",
  recente: "Mais recente",
};

// Cor da etiqueta de natureza na listagem e no cabeçalho do processo — --vinho é reservado para
// marca e ação destrutiva (DESIGN-SYSTEM.md §2), então uma etiqueta de natureza não usa bordô.
// Judicial (a mais frequente na tela) fica com o único destaque em ouro autorizado fora do chip
// de Audiência; Administrativo vira chip neutro; Caso usa --acao. Continua usando as chaves de
// cor do Badge (components/ui.tsx) — só cor de detalhe direta no JSX é que migra para os tokens novos.
const naturezaBadgeColor: Record<CaseNatureza, "gold" | "slate" | "blue"> = {
  JUDICIAL: "gold",
  ADMINISTRATIVO: "slate",
  CASO: "blue",
};

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    area?: string;
    q?: string;
    responsibleId?: string;
    sort?: string;
    natureza?: string;
    esfera?: string;
    materia?: string;
  };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const q = (searchParams.q || "").trim();
  const sortKey = searchParams.sort && SORTS[searchParams.sort] ? searchParams.sort : "nome";
  // Ausente ou inválido = "Todos" (padrão pedido pelo dono do escritório: ver tudo de antemão).
  const natureza = parseNaturezaParam(searchParams.natureza);
  const esfera = searchParams.esfera || undefined;
  const materia = searchParams.materia || undefined;

  const baseFilters: Prisma.CaseWhereInput = {
    officeId: viewer.officeId,
    status: searchParams.status || undefined,
    // Ver mesmo comentário em lib/casesFilter.ts — "area" no filtro busca em Case.materias.
    materias: searchParams.area ? { has: searchParams.area } : undefined,
    responsibleId: searchParams.responsibleId || undefined,
  };
  // Mesmo builder de where usado pela pré-visualização dinâmica do formulário (ver
  // lib/actions/casesSearch.ts) — garante que a prévia mostrada ao digitar bate exatamente com
  // o que "Aplicar" traz aqui.
  const where = await buildCasesWhere({
    officeId: viewer.officeId,
    status: searchParams.status,
    area: searchParams.area,
    responsibleId: searchParams.responsibleId,
    natureza,
    esfera,
    materia,
    q,
  });

  const [cases, totalCount, areaRows, users, countTodos, countJudicial, countAdministrativo, countCaso] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        client: true,
        clients: { include: { client: true } },
        parties: true,
        responsible: true,
        _count: { select: { tasks: true, comments: true } },
      },
      orderBy: SORTS[sortKey],
    }),
    prisma.case.count({ where: { officeId: viewer.officeId } }),
    // Prisma não faz distinct em elementos de coluna String[] — traz todas as listas não-vazias e
    // achata/deduplica em memória (ver `areas` abaixo). Volume de Processos de um escritório não
    // justifica preocupação de performance aqui.
    prisma.case.findMany({ where: { officeId: viewer.officeId, materias: { isEmpty: false } }, select: { materias: true } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Contagem das 4 abas de natureza — sempre respeitando os DEMAIS filtros ativos (status/area/
    // responsável), só sem o filtro de natureza em si, pra cada aba mostrar quantos registros
    // apareceriam se o usuário clicasse nela a partir do estado atual dos outros filtros.
    prisma.case.count({ where: baseFilters }),
    prisma.case.count({ where: { ...baseFilters, ...(naturezaWhere("JUDICIAL") as Prisma.CaseWhereInput) } }),
    prisma.case.count({ where: { ...baseFilters, ...(naturezaWhere("ADMINISTRATIVO") as Prisma.CaseWhereInput) } }),
    prisma.case.count({ where: { ...baseFilters, ...(naturezaWhere("CASO") as Prisma.CaseWhereInput) } }),
  ]);

  const areas = Array.from(new Set(areaRows.flatMap((c) => c.materias))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const isFiltered = Boolean(q || searchParams.area || searchParams.responsibleId || searchParams.status);

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader
        title="Processos e Casos"
        subtitle={isFiltered ? `${cases.length} de ${totalCount} processo(s)` : `${cases.length} registro(s)`}
        action={<NewEntityMenu />}
      />

      {/* Abas de NATUREZA (Todos/Judiciais/Administrativos/Casos) — mesmo visual de borda inferior
          dourada usado nas abas do processo (app/(app)/processos/[id]/page.tsx). Trocar de aba
          preserva os demais filtros (status/área/busca/responsável/ordenação) via qsFor; só sai da
          aba Administrativos limpa esfera/matéria, que só fazem sentido ali. */}
      <div className="flex gap-1 border-b border-regua mb-4 overflow-x-auto">
        <NaturezaTab
          label="Todos"
          count={countTodos}
          href={qsFor(searchParams, { natureza: undefined, esfera: undefined, materia: undefined })}
          active={!natureza}
        />
        <NaturezaTab
          label="Judiciais"
          count={countJudicial}
          href={qsFor(searchParams, { natureza: "judicial", esfera: undefined, materia: undefined })}
          active={natureza === "JUDICIAL"}
        />
        <NaturezaTab
          label="Administrativos"
          count={countAdministrativo}
          href={qsFor(searchParams, { natureza: "administrativo" })}
          active={natureza === "ADMINISTRATIVO"}
        />
        <NaturezaTab
          label="Casos"
          count={countCaso}
          href={qsFor(searchParams, { natureza: "caso", esfera: undefined, materia: undefined })}
          active={natureza === "CASO"}
        />
      </div>

      {/* Chips extras de esfera/matéria — só existem na aba Administrativos (nas demais abas o
          conceito nem se aplica: Judicial/Caso não têm esfera/matéria administrativa). */}
      {natureza === "ADMINISTRATIVO" && (
        <div className="space-y-2 mb-4">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] font-semibold text-tx-3 uppercase tracking-wide mr-1">Esfera</span>
            <FilterLink label="Todas" href={qsFor(searchParams, { esfera: undefined })} active={!esfera} />
            {ESFERAS.map((e) => (
              <FilterLink key={e.value} label={e.label} href={qsFor(searchParams, { esfera: e.value })} active={esfera === e.value} />
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] font-semibold text-tx-3 uppercase tracking-wide mr-1">Matéria</span>
            <FilterLink label="Todas" href={qsFor(searchParams, { materia: undefined })} active={!materia} />
            {MATERIAS_ADMIN.map((m) => (
              <FilterLink key={m.value} label={m.label} href={qsFor(searchParams, { materia: m.value })} active={materia === m.value} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href={qsFor(searchParams, { status: undefined })} active={!searchParams.status} />
        {["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"].map((s) => (
          <FilterLink key={s} label={s} href={qsFor(searchParams, { status: s })} active={searchParams.status === s} />
        ))}
      </div>

      <Card className="mb-4">
        <ProcessosFiltroForm
          status={searchParams.status}
          natureza={searchParams.natureza}
          esfera={searchParams.esfera}
          materia={searchParams.materia}
          initialQ={searchParams.q || ""}
          initialArea={searchParams.area || ""}
          initialResponsibleId={searchParams.responsibleId || ""}
          initialSort={sortKey}
          areas={areas}
          users={users}
          sortLabels={sortLabels}
          clearHref={
            q || searchParams.area || searchParams.responsibleId || (searchParams.sort && searchParams.sort !== "nome")
              ? qsFor(searchParams, { q: undefined, area: undefined, responsibleId: undefined, sort: undefined })
              : null
          }
        />
      </Card>

      <Card>
        {cases.length === 0 ? (
          <EmptyState title="Nenhum processo encontrado" />
        ) : (
          <div className="divide-y divide-regua">
            {cases.map((c) => {
              const nat = naturezaOf(c.type);
              return (
                <Link key={c.id} href={`/processos/${c.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-sf-apoio transition-colors">
                  <div className="h-10 w-10 rounded-full bg-sf-apoio text-tx-2 flex items-center justify-center shrink-0">
                    <Scale size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color={naturezaBadgeColor[nat]}>{NATUREZA_LABELS[nat]}</Badge>
                      <p className="font-medium text-tx truncate">{c.title}</p>
                      <Badge color={statusColors[c.status]}>{c.status}</Badge>
                      {/* Etiqueta de matéria não repete o ouro da natureza — vira chip neutro, para a
                          natureza continuar sendo o único elemento em destaque de cada linha. */}
                      {c.materias.map((m) => (
                        <Badge key={m} color="slate">
                          {m}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-tx-2 mt-1 truncate tabular-nums">
                      {nat === "ADMINISTRATIVO" ? (
                        // Linha secundária administrativa: número · órgão · matéria (em vez do
                        // formato "cliente x parte adversa", que não se aplica a esse setor).
                        [c.processNumber, c.tribunalSigla, c.adminMateria ? MATERIA_LABELS[c.adminMateria] || c.adminMateria : null]
                          .filter(Boolean)
                          .join(" · ") || "Sem detalhes cadastrados"
                      ) : (
                        <>
                          {c.processNumber ? `${c.processNumber} · ` : ""}
                          {joinCaseNames(effectiveCaseClients(c).map((cc) => cc.name))}
                          {c.parties.length || c.opposingPartyName ? ` x ${joinCaseNames(effectiveCaseParties(c).map((p) => p.name))}` : ""}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    {c.caseValue != null && <p className="text-sm font-semibold text-tx tabular-nums">{formatCurrency(c.caseValue)}</p>}
                    <p className="text-xs text-tx-3 mt-0.5">{c.responsible?.name ?? "Sem responsável"}</p>
                  </div>
                  <div className="text-xs text-tx-3 shrink-0 w-20 text-right hidden md:block tabular-nums">
                    {c._count.tasks} tarefa(s)
                  </div>
                  <DeleteEntityButton entityType="CASE" entityId={c.id} entityLabel={c.title} confirmMessage={`Excluir "${c.title}"?`} />
                </Link>
              );
            })}
          </div>
        )}
      </Card>
      <style>{`
        .pr-input { border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; background: var(--sf-superficie); color: var(--tx); }
        .pr-input:focus { outline: none; box-shadow: 0 0 0 2px var(--acao-bg); }
      `}</style>
    </div>
  );
}

function qsFor(current: Record<string, string | undefined>, extra: Record<string, string | undefined>) {
  const merged = { ...current, ...extra };
  const params = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
  const s = params.toString();
  return `/processos${s ? `?${s}` : ""}`;
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

// Aba de natureza — mesmo padrão visual de filete inferior de 2px em --acao usado nas abas
// internas do processo (app/(app)/processos/[id]/page.tsx, ver DESIGN-SYSTEM.md §3), com a
// contagem ao lado do rótulo.
function NaturezaTab({ label, count, href, active }: { label: string; count: number; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
        active ? "border-acao text-tx font-semibold" : "border-transparent text-tx-3 hover:text-tx-2"
      }`}
    >
      {label} <span className="text-xs text-tx-3 tabular-nums">({count})</span>
    </Link>
  );
}
