import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, EmptyState, formatCurrency } from "@/components/ui";
import { Users, Target, Newspaper, Wallet, Scale, Info, SlidersHorizontal } from "lucide-react";
import RelatorioPersonalizadoView from "@/components/relatorios/RelatorioPersonalizadoView";
import { valorLiquido, saldoEmAberto, isAdiantamentoPayable, isReembolsoReceivable } from "@/lib/financeCalc";
import { groupCasesByMateria } from "@/lib/caseMaterias";
import { STAGES, stageLabels, stageColor, CASE_STATUS_ORDER, caseStatusLabels, caseStatusColor, triageLabels, triageColor } from "@/lib/relatoriosLabels";

export const dynamic = "force-dynamic";

// ---------- helpers de período ----------

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type MonthBucket = { year: number; month: number; key: string; label: string };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function buildMonths(meses: number): MonthBucket[] {
  const now = new Date();
  const arr: MonthBucket[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      key: monthKey(d),
      label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
    });
  }
  return arr;
}

function parseMeses(v?: string): 3 | 6 | 12 {
  if (v === "3") return 3;
  if (v === "12") return 12;
  return 6;
}

function compactBRL(v: number) {
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

// ---------- micro-gráficos (só divs/CSS) ----------

function HBar({ label, display, value, max, color }: { label: string; display: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
        <span className="text-tx-2 truncate">{label}</span>
        <span className="font-semibold text-tx shrink-0">{display}</span>
      </div>
      <div className="h-2.5 rounded-full bg-sf-apoio overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, minWidth: value > 0 ? 4 : 0, backgroundColor: color }} />
      </div>
    </div>
  );
}

function VBars({ items, color }: { items: { label: string; display: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {items.map((it, i) => (
        <div key={i} className="flex-1 min-w-[38px] flex flex-col items-center">
          <span className="text-[10px] font-semibold text-tx-2 mb-1">{it.display}</span>
          <div className="w-full h-32 flex items-end">
            <div
              className="w-full "
              style={{ height: `${(it.value / max) * 100}%`, minHeight: it.value > 0 ? 4 : 0, backgroundColor: color }}
            />
          </div>
          <span className="text-[10px] text-tx-2 mt-1.5 whitespace-nowrap">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- rótulos ----------
// STAGES/stageLabels/stageColor, CASE_STATUS_ORDER/caseStatusLabels/caseStatusColor e
// triageLabels/triageColor vêm de lib/relatoriosLabels.ts, compartilhado com o resumo mobile
// (app/m/relatorios/page.tsx) — antes cada tela tinha a própria cópia e elas divergiram sem
// ninguém notar (achado A47 da revisão gauntlet).

const LEAD_ORDER = ["INDICACAO", "INSTAGRAM", "GOOGLE", "SITE", "WHATSAPP", "OUTRO", "NAO_INFORMADO"];
const leadSourceLabels: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
  NAO_INFORMADO: "Não informado",
};

const LAWYER_ORDER = ["Jairo", "Rodrigo", "Jairo e Rodrigo", "Sem identificação"];

const NAVY = "var(--acao)";

// ---------- seções (cada uma busca só os dados de que precisa) ----------

const SECOES = [
  // Personalizado vem primeiro: é a única seção em que o usuário monta a pergunta: as demais são
  // painéis fechados de leitura rápida.
  { key: "personalizado", label: "Personalizado", icon: SlidersHorizontal, financeOnly: false },
  { key: "produtividade", label: "Produtividade", icon: Users, financeOnly: false },
  { key: "processos", label: "Processos", icon: Scale, financeOnly: false },
  { key: "funil", label: "Funil Comercial", icon: Target, financeOnly: false },
  { key: "publicacoes", label: "Publicações", icon: Newspaper, financeOnly: false },
  { key: "financeiro", label: "Financeiro", icon: Wallet, financeOnly: true },
] as const;

type SecaoKey = (typeof SECOES)[number]["key"];

async function ProdutividadeSection({ start, end, months, officeId }: { start: Date; end: Date; months: MonthBucket[]; officeId: string }) {
  const doneTasks = await prisma.task.findMany({
    where: { officeId, status: "CONCLUIDO", completedAt: { gte: start, lt: end }, responsibleId: { not: null } },
    include: { responsible: { select: { id: true, name: true, color: true } } },
  });

  const prodByUser = new Map<string, { user: { id: string; name: string; color: string }; points: number; count: number }>();
  for (const t of doneTasks) {
    if (!t.responsible) continue;
    let row = prodByUser.get(t.responsible.id);
    if (!row) {
      row = { user: t.responsible, points: 0, count: 0 };
      prodByUser.set(t.responsible.id, row);
    }
    row.points += t.points;
    row.count += 1;
  }
  const prodRanking = Array.from(prodByUser.values()).sort((a, b) => b.points - a.points || b.count - a.count);
  const maxUserPoints = Math.max(0, ...prodRanking.map((r) => r.points));
  const monthlyPoints = months.map((m) => ({
    label: m.label,
    value: doneTasks.filter((t) => t.completedAt && monthKey(t.completedAt) === m.key).reduce((s, t) => s + t.points, 0),
  }));

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-regua">
        <Users size={18} className="text-marca-tx" />
        <h3 className="font-bold text-tx text-base">Produtividade</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        <div>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Pontos e tarefas por pessoa</p>
          {prodRanking.length === 0 ? (
            <EmptyState title="Nenhuma tarefa concluída no período" />
          ) : (
            <div className="space-y-3">
              {prodRanking.map((r) => (
                <HBar
                  key={r.user.id}
                  label={r.user.name}
                  display={`${r.points} pts · ${r.count} tarefa(s)`}
                  value={r.points}
                  max={maxUserPoints}
                  color={r.user.color}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Total de pontos da equipe por mês</p>
          <VBars items={monthlyPoints.map((m) => ({ label: m.label, display: String(m.value), value: m.value }))} color={NAVY} />
        </div>
      </div>
    </Card>
  );
}

async function ProcessosSection({ start, end, officeId }: { start: Date; end: Date; officeId: string }) {
  const [activeCases, casesByStatus, closedCasesInPeriod] = await Promise.all([
    prisma.case.findMany({ where: { officeId, status: "ATIVO" }, select: { materias: true } }),
    prisma.case.groupBy({ by: ["status"], where: { officeId }, _count: { _all: true } }),
    prisma.case.findMany({
      where: { officeId, status: "ENCERRADO", distributedAt: { not: null }, closedAt: { gte: start, lt: end } },
      select: { materias: true, distributedAt: true, closedAt: true },
    }),
  ]);

  // Um processo com mais de uma matéria conta em cada grupo — totalActiveCases é o número real de
  // processos ativos (não a soma dos grupos), por isso as % das barras abaixo podem somar mais de
  // 100% quando há processos multi-matéria.
  const areaRows = groupCasesByMateria(activeCases).map((r) => ({ label: r.label, value: r.count }));
  const totalActiveCases = activeCases.length;
  const maxAreaCount = Math.max(0, ...areaRows.map((r) => r.value));

  const statusCounts: Record<string, number> = {};
  for (const s of CASE_STATUS_ORDER) statusCounts[s] = 0;
  for (const r of casesByStatus) {
    if (CASE_STATUS_ORDER.includes(r.status)) statusCounts[r.status] = r._count._all;
  }
  const maxStatusCount = Math.max(0, ...CASE_STATUS_ORDER.map((s) => statusCounts[s]));

  const closedDurations = closedCasesInPeriod
    .filter((c) => c.distributedAt && c.closedAt)
    .map((c) => Math.round((c.closedAt!.getTime() - c.distributedAt!.getTime()) / 86400000))
    .filter((days) => days >= 0);
  const avgTramitacaoDays =
    closedDurations.length > 0 ? Math.round(closedDurations.reduce((s, d) => s + d, 0) / closedDurations.length) : null;

  // Média geral acima usa uma linha por processo (sem duplicar); a quebra por matéria abaixo
  // credita a duração de um processo multi-matéria em cada uma das suas matérias.
  const durByArea = new Map<string, { sum: number; count: number }>();
  for (const c of closedCasesInPeriod) {
    if (!c.distributedAt || !c.closedAt) continue;
    const days = Math.round((c.closedAt.getTime() - c.distributedAt.getTime()) / 86400000);
    if (days < 0) continue;
    const materias = c.materias.filter(Boolean).length > 0 ? c.materias.filter(Boolean) : ["Sem matéria"];
    for (const area of materias) {
      let row = durByArea.get(area);
      if (!row) {
        row = { sum: 0, count: 0 };
        durByArea.set(area, row);
      }
      row.sum += days;
      row.count += 1;
    }
  }
  const avgTramitacaoByArea = Array.from(durByArea.entries())
    .map(([label, { sum, count }]) => ({ label, value: Math.round(sum / count), count }))
    .sort((a, b) => b.count - a.count);
  const maxTramitacaoArea = Math.max(0, ...avgTramitacaoByArea.map((r) => r.value));

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-regua">
        <Scale size={18} className="text-marca-tx" />
        <h3 className="font-bold text-tx text-base">Processos</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        <div>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">
            Distribuição por área/matéria (processos ativos)
          </p>
          {areaRows.length === 0 ? (
            <EmptyState title="Nenhum processo ativo" />
          ) : (
            <div className="space-y-3">
              {areaRows.map((r) => (
                <HBar
                  key={r.label}
                  label={r.label}
                  display={`${r.value} · ${totalActiveCases > 0 ? ((r.value / totalActiveCases) * 100).toFixed(0) : 0}%`}
                  value={r.value}
                  max={maxAreaCount}
                  color={NAVY}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">
            Distribuição por status (todos os processos)
          </p>
          <div className="space-y-3">
            {CASE_STATUS_ORDER.map((s) => (
              <HBar
                key={s}
                label={caseStatusLabels[s]}
                display={String(statusCounts[s])}
                value={statusCounts[s]}
                max={maxStatusCount}
                color={caseStatusColor[s]}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">
          Tempo médio de tramitação (processos encerrados no período)
        </p>
        <div className={avgTramitacaoByArea.length >= 2 ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>
          <div className="border-t-2 border-regua-forte bg-sf-apoio p-5">
            {avgTramitacaoDays !== null ? (
              <>
                <p className="font-bold text-3xl text-tx">{avgTramitacaoDays} dias</p>
                <p className="text-xs text-tx-2 mt-1">
                  {closedDurations.length} processo(s) encerrado(s) no período com datas completas
                </p>
              </>
            ) : (
              <EmptyState title="Sem processos encerrados com datas completas no período" />
            )}
          </div>
          {avgTramitacaoByArea.length >= 2 && (
            <div>
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Por área</p>
              <div className="space-y-3">
                {avgTramitacaoByArea.map((r) => (
                  <HBar
                    key={r.label}
                    label={r.label}
                    display={`${r.value} dias (${r.count})`}
                    value={r.value}
                    max={maxTramitacaoArea}
                    color={NAVY}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

async function FunilSection({ start, end, officeId }: { start: Date; end: Date; officeId: string }) {
  const attendances = await prisma.attendance.findMany({
    where: { officeId, status: { not: "ARQUIVADO" }, createdAt: { gte: start, lt: end } },
  });

  const stageTotals = STAGES.map((s) => {
    const items = attendances.filter((a) => (STAGES.includes(a.stage) ? a.stage : "NOVO") === s);
    return { stage: s, count: items.length, sum: items.reduce((x, a) => x + (a.estimatedValue || 0), 0) };
  });
  const maxStageCount = Math.max(0, ...stageTotals.map((s) => s.count));
  const closed = stageTotals.find((s) => s.stage === "FECHADO")?.count ?? 0;
  const lost = stageTotals.find((s) => s.stage === "PERDIDO")?.count ?? 0;
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  const leadCounts: Record<string, number> = {};
  for (const key of LEAD_ORDER) leadCounts[key] = 0;
  for (const a of attendances) {
    const key = a.leadSource && LEAD_ORDER.includes(a.leadSource) ? a.leadSource : "NAO_INFORMADO";
    leadCounts[key] = (leadCounts[key] ?? 0) + 1;
  }
  const leadRows = LEAD_ORDER.map((k) => ({ label: leadSourceLabels[k], value: leadCounts[k] })).filter((r) => r.value > 0);
  const maxLead = Math.max(0, ...leadRows.map((r) => r.value));

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-regua">
        <Target size={18} className="text-marca-tx" />
        <h3 className="font-bold text-tx text-base flex-1">Funil Comercial</h3>
        <span className="text-xs text-tx-2">
          Conversão:{" "}
          {conversionRate !== null ? (
            <span className="font-semibold text-concluido">{conversionRate.toFixed(0)}%</span>
          ) : (
            <span className="text-tx-3">—</span>
          )}
          {conversionRate !== null && (
            <span className="text-tx-3">
              {" "}
              ({closed} de {closed + lost})
            </span>
          )}
        </span>
      </div>
      {attendances.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Nenhum atendimento no período" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Quantidade e valor estimado por estágio</p>
            <div className="space-y-3">
              {stageTotals.map((s) => (
                <HBar
                  key={s.stage}
                  label={stageLabels[s.stage]}
                  display={`${s.count}${s.sum > 0 ? ` · ${formatCurrency(s.sum)}` : ""}`}
                  value={s.count}
                  max={maxStageCount}
                  color={stageColor[s.stage]}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Leads por origem</p>
            {leadRows.length === 0 ? (
              <EmptyState title="Sem origem registrada" />
            ) : (
              <div className="space-y-3">
                {leadRows.map((r) => (
                  <HBar key={r.label} label={r.label} display={String(r.value)} value={r.value} max={maxLead} color={NAVY} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

async function PublicacoesSection({ start, end, months, officeId }: { start: Date; end: Date; months: MonthBucket[]; officeId: string }) {
  const publications = await prisma.publication.findMany({
    where: { officeId, publishedAt: { gte: start, lt: end } },
    select: { id: true, publishedAt: true, lawyerTag: true, triageStatus: true },
  });

  const pubMonthly = months.map((m) => ({
    label: m.label,
    value: publications.filter((p) => monthKey(p.publishedAt) === m.key).length,
  }));
  const lawyerCounts: Record<string, number> = {};
  for (const p of publications) {
    const tag = p.lawyerTag && p.lawyerTag.trim() ? p.lawyerTag.trim() : "Sem identificação";
    lawyerCounts[tag] = (lawyerCounts[tag] ?? 0) + 1;
  }
  const lawyerRows = Object.entries(lawyerCounts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => {
      const ia = LAWYER_ORDER.indexOf(a.label);
      const ib = LAWYER_ORDER.indexOf(b.label);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || b.value - a.value;
    });
  const maxLawyer = Math.max(0, ...lawyerRows.map((r) => r.value));
  const triageRows = ["PENDENTE", "EM_ANALISE", "TRATADA"].map((s) => ({
    status: s,
    value: publications.filter((p) => p.triageStatus === s).length,
  }));

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-regua">
        <Newspaper size={18} className="text-marca-tx" />
        <h3 className="font-bold text-tx text-base">Publicações</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5">
        <div>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Volume por mês</p>
          <VBars items={pubMonthly.map((m) => ({ label: m.label, display: String(m.value), value: m.value }))} color={NAVY} />
        </div>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Distribuição por advogado</p>
            {lawyerRows.length === 0 ? (
              <EmptyState title="Nenhuma publicação no período" />
            ) : (
              <div className="space-y-3">
                {lawyerRows.map((r) => (
                  <HBar key={r.label} label={r.label} display={String(r.value)} value={r.value} max={maxLawyer} color={NAVY} />
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Pendências de triagem</p>
            <div className="grid grid-cols-3 gap-3">
              {triageRows.map((t) => (
                <div key={t.status} className=" bg-sf-apoio border border-regua p-3 text-center">
                  <p className="font-bold text-xl text-tx">{t.value}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: triageColor[t.status] }} />
                    <span className="text-[11px] text-tx-2">{triageLabels[t.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

async function FinanceiroSection({ start, end, months, now, officeId }: { start: Date; end: Date; months: MonthBucket[]; now: Date; officeId: string }) {
  const [paidReceivables, paidPayables, overdueReceivables] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId, status: "PAGO", paidDate: { gte: start, lt: end } }, include: { category: true } }),
    prisma.payable.findMany({
      where: { officeId, status: "PAGO", paidDate: { gte: start, lt: end } },
      include: { category: true, reimbursementReceivable: { select: { id: true } } },
    }),
    prisma.receivable.findMany({
      where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false, dueDate: { lt: now } },
      include: { payments: true },
    }),
  ]);

  // paidReceivables/paidPayables (status "PAGO" exato) e overdueReceivables (status em
  // [PENDENTE, ATRASADO, PARCIAL]) já excluem A_APURAR sozinhos — nenhum dos filtros deixaria
  // passar uma provisão de honorário percentual ainda sem valor real. As somas usam valorLiquido/
  // paidAmount para respeitar desconto/acréscimo. PARCIAL entra na inadimplência (mesma regra da
  // Central de Alertas, lib/alerts.ts) porque já teve parte paga e ainda tem saldo em aberto —
  // por isso soma saldoEmAberto (não o valor cheio) logo abaixo.
  //
  // Adiantamentos a Clientes (Despesas do Processo com reembolso vinculado) são excluídos da
  // Receita/Despesa normais — mesma lógica do DRE (/financeiro/dre), ver isAdiantamentoPayable/
  // isReembolsoReceivable em lib/financeCalc.ts — e somados à parte, numa seção informativa
  // própria mais abaixo.
  const receitasNormais = paidReceivables.filter((r) => !isReembolsoReceivable(r));
  const despesasNormais = paidPayables.filter((p) => !isAdiantamentoPayable(p));
  const adiantamentos = paidPayables.filter(isAdiantamentoPayable);
  const reembolsos = paidReceivables.filter(isReembolsoReceivable);
  const totalAdiantado = adiantamentos.reduce((s, p) => s + (p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge)), 0);
  const totalReembolsado = reembolsos.reduce((s, r) => s + (r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge)), 0);

  const financeMonthly = months.map((m) => ({
    label: m.label,
    receita: receitasNormais.filter((r) => r.paidDate && monthKey(r.paidDate) === m.key).reduce((s, r) => s + (r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge)), 0),
    despesa: despesasNormais.filter((p) => p.paidDate && monthKey(p.paidDate) === m.key).reduce((s, p) => s + (p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge)), 0),
  }));
  const maxFinance = Math.max(1, ...financeMonthly.flatMap((m) => [m.receita, m.despesa]));

  const expenseByCat: Record<string, number> = {};
  for (const p of despesasNormais) {
    const key = p.category?.name ?? "Sem categoria";
    expenseByCat[key] = (expenseByCat[key] ?? 0) + (p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge));
  }
  const topExpenses = Object.entries(expenseByCat)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const maxExpense = Math.max(0, ...topExpenses.map((e) => e.value));

  const inadimplenciaTotal = overdueReceivables.reduce(
    (s, r) => s + saldoEmAberto(r.amount, r.discount, r.surcharge, r.payments.reduce((sum, p) => sum + p.amount, 0)),
    0
  );
  const inadimplenciaCount = overdueReceivables.length;
  const saldoAdiantamentos = totalAdiantado - totalReembolsado;

  return (
    <Card>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-regua">
        <Wallet size={18} className="text-marca-tx" />
        <h3 className="font-bold text-tx text-base">Financeiro</h3>
      </div>
      <div className="p-5 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Recebido x Pago por mês (regime de caixa)</p>
            {/* "Pago" não é --urgente: só dado vencido é vermelho no sistema (DESIGN-SYSTEM.md §2),
                e despesa paga em dia não é isso — pintá-la de vermelho confundiria com "algo
                furou". Usa o grafite neutro da escala base; "Recebido" fica em --concluido. */}
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-concluido" /> Recebido
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-tx-3" /> Pago
              </span>
            </div>
          </div>
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {financeMonthly.map((m) => (
              <div key={m.label} className="flex-1 min-w-[52px] flex flex-col items-center">
                <div className="flex flex-col items-center text-[9px] leading-tight mb-1">
                  <span className="text-concluido font-semibold">{compactBRL(m.receita)}</span>
                  <span className="text-tx-3 font-semibold">{compactBRL(m.despesa)}</span>
                </div>
                <div className="w-full h-32 flex items-end justify-center gap-1">
                  <div
                    className="w-1/2 bg-concluido"
                    style={{ height: `${(m.receita / maxFinance) * 100}%`, minHeight: m.receita > 0 ? 4 : 0 }}
                    title={`Recebido: ${formatCurrency(m.receita)}`}
                  />
                  <div
                    className="w-1/2 bg-tx-3"
                    style={{ height: `${(m.despesa / maxFinance) * 100}%`, minHeight: m.despesa > 0 ? 4 : 0 }}
                    title={`Pago: ${formatCurrency(m.despesa)}`}
                  />
                </div>
                <span className="text-[10px] text-tx-2 mt-1.5 whitespace-nowrap">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Top 5 categorias de despesa</p>
            {topExpenses.length === 0 ? (
              <EmptyState title="Nenhuma despesa paga no período" />
            ) : (
              <div className="space-y-3">
                {topExpenses.map((e) => (
                  <HBar key={e.label} label={e.label} display={formatCurrency(e.value)} value={e.value} max={maxExpense} color={NAVY} />
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-3">Inadimplência atual</p>
            <div className="border-t-2 border-urgente bg-urgente-bg p-5">
              <p className="font-bold text-2xl tabular-nums text-urgente">{formatCurrency(inadimplenciaTotal)}</p>
              <p className="text-xs text-tx-2 mt-1">
                {inadimplenciaCount} conta(s) a receber vencida(s)
              </p>
            </div>
          </div>
        </div>

        {(totalAdiantado > 0 || totalReembolsado > 0) && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Adiantamentos a Clientes</p>
              <span className="text-[10px] font-semibold text-tx-3">(informativo — fora da Receita/Despesa acima)</span>
            </div>
            <div className=" border border-dashed border-regua-forte p-5">
              <div className="flex items-start gap-2 text-xs text-tx-2 mb-4">
                <Info size={14} className="shrink-0 mt-0.5" />
                <p>
                  Despesas do processo pagas por conta do cliente (com reembolso vinculado) são um adiantamento que volta, não custo
                  nem receita real do escritório — por isso não entram nos números de Receita/Despesa/Recebido x Pago desta seção.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-tx-2 uppercase tracking-wide">Adiantado no período</p>
                  <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(totalAdiantado)}</p>
                </div>
                <div>
                  <p className="text-xs text-tx-2 uppercase tracking-wide">Reembolsado no período</p>
                  <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(totalReembolsado)}</p>
                </div>
                <div>
                  <p className="text-xs text-tx-2 uppercase tracking-wide">Saldo do período</p>
                  <p className="font-bold text-lg tabular-nums text-tx mt-1">{formatCurrency(saldoAdiantamentos)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default async function RelatoriosPage({ searchParams }: { searchParams: { meses?: string; secao?: string } }) {
  const meses = parseMeses(searchParams.meses);
  const now = new Date();
  const months = buildMonths(meses);
  const start = new Date(now.getFullYear(), now.getMonth() - (meses - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const hasFinanceAccess = Boolean(viewer?.isAdmin || viewer?.financeAccess);

  const availableSecoes = SECOES.filter((s) => !s.financeOnly || hasFinanceAccess);
  const requestedSecao = searchParams.secao as SecaoKey | undefined;
  const secao: SecaoKey = availableSecoes.some((s) => s.key === requestedSecao) ? (requestedSecao as SecaoKey) : "produtividade";

  const periodOptions: { value: 3 | 6 | 12; label: string }[] = [
    { value: 3, label: "3 meses" },
    { value: 6, label: "6 meses" },
    { value: 12, label: "12 meses" },
  ];

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle={`Painel consolidado (BI) · ${months[0].label} a ${months[months.length - 1].label}`}
        action={
          <div className="flex items-center gap-1 bg-sf border border-regua p-1">
            {periodOptions.map((opt) => (
              <Link
                key={opt.value}
                href={`/relatorios?secao=${secao}&meses=${opt.value}`}
                className={`text-xs font-semibold px-3 py-1.5 transition-colors ${
                  meses === opt.value ? "bg-acao text-acao-tx" : "text-tx-2 hover:bg-sf-apoio"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {availableSecoes.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              href={`/relatorios?secao=${s.key}&meses=${meses}`}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 transition-colors ${
                secao === s.key
                  ? "bg-acao text-acao-tx"
                  : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
              }`}
            >
              <Icon size={15} />
              {s.label}
            </Link>
          );
        })}
      </div>

      {secao === "personalizado" && <RelatorioPersonalizadoView />}
      {secao === "produtividade" && <ProdutividadeSection start={start} end={end} months={months} officeId={viewer.officeId} />}
      {secao === "processos" && <ProcessosSection start={start} end={end} officeId={viewer.officeId} />}
      {secao === "funil" && <FunilSection start={start} end={end} officeId={viewer.officeId} />}
      {secao === "publicacoes" && <PublicacoesSection start={start} end={end} months={months} officeId={viewer.officeId} />}
      {secao === "financeiro" && hasFinanceAccess && <FinanceiroSection start={start} end={end} months={months} now={now} officeId={viewer.officeId} />}
    </div>
  );
}
