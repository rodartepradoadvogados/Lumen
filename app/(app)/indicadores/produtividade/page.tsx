import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserHistory } from "@/lib/timesheet";
import { contar } from "@/lib/plural";
import { VBars } from "@/components/gestao/Barras";
import { Card, Badge, EmptyState, formatDate, taskTypeLabels, taskTypeColors } from "@/components/ui";
import IndicadoresPagina from "@/components/indicadores/IndicadoresPagina";
import { comoSeCalculamOsPontos } from "@/lib/gestao/pontos";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import clsx from "clsx";
import { horaDeBrasilia, dataDeBrasilia } from "@/lib/horaDeBrasilia";

export const dynamic = "force-dynamic";

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Interpreta ?mes=YYYY-MM; se inválido, usa o mês corrente.
function parseMonth(mes?: string): { year: number; month: number } {
  const now = new Date();
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

type Visao = "equipe" | "pessoa" | "tempo";

// Controle segmentado (NÃO um terceiro nível de guias): as três leituras da mesma pergunta.
function Visoes({ atual, mes, responsibleId }: { atual: Visao; mes?: string; responsibleId?: string }) {
  const q = (v: Visao) => {
    const p = new URLSearchParams({ visao: v });
    if (mes && v !== "tempo") p.set("mes", mes);
    if (responsibleId && v === "pessoa") p.set("responsibleId", responsibleId);
    return `/indicadores/produtividade?${p.toString()}`;
  };
  const itens: { v: Visao; rotulo: string }[] = [
    { v: "equipe", rotulo: "Equipe" },
    { v: "pessoa", rotulo: "Por pessoa" },
    { v: "tempo", rotulo: "Tempo no sistema" },
  ];
  return (
    <nav aria-label="Visão" className="inline-flex items-center gap-1 bg-sf border border-regua p-1 self-start">
      {itens.map((i) => (
        <Link
          key={i.v}
          href={q(i.v)}
          aria-current={atual === i.v ? "true" : undefined}
          className={clsx("text-xs font-semibold px-3 py-1.5 max-md:py-3.5 transition-colors", atual === i.v ? "bg-acao text-acao-tx" : "text-tx-2 hover:bg-sf-apoio")}
        >
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: { mes?: string; visao?: string; responsibleId?: string; pessoa?: string };
}) {
  const visao: Visao = searchParams.visao === "tempo" ? "tempo" : searchParams.visao === "pessoa" ? "pessoa" : "equipe";
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const socio = Boolean(viewer.isAdmin || viewer.financeAccess);

  if (visao === "tempo") {
    // Tempo de USO DO SISTEMA (login até o último sinal de atividade), NÃO hora faturável. Sócios
    // podem escolher a pessoa; os demais só veem o próprio tempo.
    const pessoas = socio
      ? await prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];
    const alvo = socio && searchParams.pessoa && pessoas.some((p) => p.id === searchParams.pessoa) ? pessoas.find((p) => p.id === searchParams.pessoa)! : { id: viewer.id, name: viewer.name };
    const history = await getUserHistory(alvo.id, 30);
    return (
      <IndicadoresPagina ativa="produtividade" temAcessoAoFinanceiro={socio} frase="Tempo de uso do sistema nos últimos 30 dias. Não é hora faturável.">
        <Visoes atual="tempo" />
        {socio && (
          <form className="flex items-end gap-3">
            <input type="hidden" name="visao" value="tempo" />
            <div>
              <label htmlFor="pessoa-tempo" className="text-xs font-medium text-tx-2 block mb-1">Pessoa</label>
              <select id="pessoa-tempo" name="pessoa" defaultValue={alvo.id} className="campo">
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 transition-colors">Ver</button>
          </form>
        )}
        <Card>
          <div className="px-5 py-4 border-b border-regua">
            <h2 className="font-bold text-tx text-base">{`Tempo no sistema — ${alvo.name}`}</h2>
            <p className="text-xs text-tx-2 mt-0.5">Mede quanto tempo o Lúmen ficou aberto e ativo para a pessoa. Não mede horas de trabalho em cada caso.</p>
          </div>
          {history.length === 0 ? (
            <EmptyState title="Nenhum registro de acesso" subtitle="Assim que a pessoa usar o sistema, o tempo aparecerá aqui." />
          ) : (
            <div className="divide-y divide-regua">
              {history.map((day) => (
                <div key={day.date} className="flex items-center gap-3 px-5 py-3">
                  <Clock size={14} aria-hidden="true" className="text-tx-3 shrink-0" />
                  <p className="text-sm text-tx flex-1">{formatDate(new Date(`${day.date}T00:00:00`))}</p>
                  <p className="text-xs text-tx-2 w-32 text-right">1º login {horaDeBrasilia(new Date(day.firstLogin))}</p>
                  <p className="text-sm font-semibold text-tx w-24 text-right tabular-nums">{formatHMS(day.seconds)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </IndicadoresPagina>
    );
  }

  const { year, month } = parseMonth(searchParams.mes);
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const prevParam = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
  const nextParam = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
  const label = `${MESES[month]} de ${year}`;
  const responsibleId = visao === "pessoa" ? searchParams.responsibleId || undefined : undefined;
  const base = (m: string) => `/indicadores/produtividade?visao=${visao}&mes=${m}${responsibleId ? `&responsibleId=${responsibleId}` : ""}`;

  // Total de pontos da equipe nos 6 meses que terminam no mês visto. Mesma conta do histórico
  // abaixo (tarefa concluída, com responsável, `Task.points`).
  const serieInicio = new Date(year, month - 5, 1);
  const [tasks, users, serieTarefas, pontosPorTipo] = await Promise.all([
    prisma.task.findMany({
      where: { status: "CONCLUIDO", completedAt: { gte: start, lt: end }, responsibleId: responsibleId ?? { not: null }, officeId: viewer.officeId },
      include: { responsible: { select: { id: true, name: true, color: true } }, case: { select: { id: true, title: true } } },
      orderBy: { completedAt: "desc" },
    }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.task.findMany({
      where: { status: "CONCLUIDO", completedAt: { gte: serieInicio, lt: end }, responsibleId: { not: null }, officeId: viewer.officeId },
      select: { completedAt: true, points: true },
    }),
    prisma.taskTypePoints.findMany({ where: { officeId: viewer.officeId } }),
  ]);

  const serie = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 5 + i, 1);
    const value = serieTarefas
      .filter((t) => t.completedAt && t.completedAt.getFullYear() === d.getFullYear() && t.completedAt.getMonth() === d.getMonth())
      .reduce((soma, t) => soma + t.points, 0);
    return { label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, display: String(value), value };
  });
  const totalDoMes = tasks.reduce((soma, t) => soma + t.points, 0);

  type Row = {
    user: { id: string; name: string; color: string };
    count: number;
    points: number;
    tasks: { id: string; title: string; type: string; completedAt: Date | null; dueDate: Date; points: number; caseTitle: string | null }[];
  };
  const byUser = new Map<string, Row>();
  for (const t of tasks) {
    if (!t.responsible) continue;
    let row = byUser.get(t.responsible.id);
    if (!row) {
      row = { user: t.responsible, count: 0, points: 0, tasks: [] };
      byUser.set(t.responsible.id, row);
    }
    row.count += 1;
    row.points += t.points;
    row.tasks.push({ id: t.id, title: t.title, type: t.type, completedAt: t.completedAt, dueDate: t.dueDate, points: t.points, caseTitle: t.case?.title ?? null });
  }
  const rows = Array.from(byUser.values()).sort((a, b) => b.points - a.points || b.count - a.count);
  const maxPontos = Math.max(1, ...rows.map((r) => r.points));

  const navegador = (
    <div className="flex items-center gap-2">
      <Link href={base(prevParam)} className="h-8 w-8 max-md:h-11 max-md:w-11 flex items-center justify-center bg-sf border border-regua text-tx-2 hover:bg-sf-apoio" aria-label="Mês anterior">
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <span className="text-sm font-semibold text-tx min-w-[150px] text-center">{label}</span>
      <Link href={base(nextParam)} className="h-8 w-8 max-md:h-11 max-md:w-11 flex items-center justify-center bg-sf border border-regua text-tx-2 hover:bg-sf-apoio" aria-label="Próximo mês">
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <IndicadoresPagina
      ativa="produtividade"
      temAcessoAoFinanceiro={socio}
      frase={visao === "equipe" ? "Pontos das tarefas concluídas, por pessoa e por mês." : "Tarefas concluídas por pessoa. Clique em um nome para ver o que foi feito."}
      acao={navegador}
    >
      <Visoes atual={visao} mes={searchParams.mes} responsibleId={responsibleId} />

      {visao === "equipe" && (
        <>
          <Card>
            <div className="px-5 py-4 border-b border-regua">
              <h2 className="font-bold text-tx text-base">Pontos por pessoa</h2>
              <p className="text-xs text-tx-2 mt-0.5">{label}: {totalDoMes} pts no total.</p>
            </div>
            {rows.length === 0 ? (
              <EmptyState title="Nenhuma tarefa concluída neste período" subtitle="As tarefas concluídas com responsável definido aparecem aqui." />
            ) : (
              <ul className="p-5 space-y-3">
                {rows.map((r) => (
                  <li key={r.user.id}>
                    <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
                      <span className="text-tx-2 truncate">{r.user.name}</span>
                      <span className="font-semibold text-tx shrink-0 tabular-nums">{r.points} pts · {contar(r.count, "tarefa")}</span>
                    </div>
                    <div className="h-2.5 rounded-sm bg-sf-apoio overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-sm bg-faixa-ardosia" style={{ width: `${(r.points / maxPontos) * 100}%`, minWidth: r.points > 0 ? 4 : 0 }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="px-5 py-4 border-b border-regua">
              <h2 className="font-bold text-tx text-base">Pontos da equipe por mês</h2>
              <p className="text-xs text-tx-2 mt-0.5">Últimos 6 meses, até {label}.</p>
            </div>
            <div className="p-5">
              <VBars items={serie} color="var(--faixa-ardosia)" />
            </div>
          </Card>
        </>
      )}

      {visao === "pessoa" && (
        <>
          <Card>
            <form className="p-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="visao" value="pessoa" />
              {searchParams.mes && <input type="hidden" name="mes" value={searchParams.mes} />}
              <div>
                <label htmlFor="responsavel" className="text-xs font-medium text-tx-2 block mb-1">Responsável</label>
                <select id="responsavel" name="responsibleId" defaultValue={responsibleId ?? ""} className="campo">
                  <option value="">Todos</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 transition-colors">Filtrar</button>
              {responsibleId && (
                <Link href={`/indicadores/produtividade?visao=pessoa${searchParams.mes ? `&mes=${searchParams.mes}` : ""}`} className="text-xs font-semibold text-tx-2 hover:text-tx px-2">
                  Limpar filtro
                </Link>
              )}
            </form>
          </Card>
          <Card>
            {rows.length === 0 ? (
              <EmptyState title="Nenhuma tarefa concluída neste período" subtitle="As tarefas concluídas com responsável definido aparecem aqui." />
            ) : (
              <div className="divide-y divide-regua">
                {rows.map((row) => (
                  <details key={row.user.id} className="group">
                    <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-sf-apoio list-none">
                      <span aria-hidden="true" className="h-7 w-7 rounded-full flex items-center justify-center bg-sf-apoio border border-regua-forte text-tx text-etiqueta font-bold shrink-0">
                        {initials(row.user.name)}
                      </span>
                      <p className="text-sm font-medium text-tx flex-1">{row.user.name}</p>
                      <span className="text-xs text-tx-2">{contar(row.count, "tarefa")}</span>
                      <span className="text-xs font-semibold text-tx tabular-nums">{row.points} pts</span>
                      <ChevronRight size={14} aria-hidden="true" className="text-tx-3 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="bg-sf-apoio px-5 pb-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-etiqueta uppercase tracking-wide text-tx-3">
                            <th scope="col" className="py-1.5 font-semibold">Tarefa</th>
                            <th scope="col" className="py-1.5 font-semibold">Tipo</th>
                            <th scope="col" className="py-1.5 font-semibold">Concluída em</th>
                            <th scope="col" className="py-1.5 font-semibold text-right">Pontos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-regua">
                          {row.tasks.map((t) => (
                            <tr key={t.id}>
                              <td className="py-1.5 pr-2 text-tx">
                                {t.title}
                                {t.caseTitle && <span className="block text-etiqueta text-tx-3 truncate">{t.caseTitle}</span>}
                              </td>
                              <td className="py-1.5 pr-2">
                                <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                              </td>
                              {/* completedAt é instante — formatDate() lia sem fuso e virava um dia errado perto da meia-noite. */}
                              <td className="py-1.5 pr-2 text-tx-2">{t.completedAt ? dataDeBrasilia(t.completedAt) : "—"}</td>
                              <td className="py-1.5 text-right font-semibold text-tx tabular-nums">{t.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <p className="text-sm text-tx-2 max-w-[68ch]">
        <span className="font-semibold text-tx">Como se calcula.</span> {comoSeCalculamOsPontos(pontosPorTipo)}
      </p>
    </IndicadoresPagina>
  );
}
