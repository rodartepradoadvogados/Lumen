import { prisma } from "@/lib/prisma";

// "apurar" (Fase 1, ainda dormente — nenhuma tela passa este valor em `tab` hoje) existe para o
// status A_APURAR ter uma aba própria assim que uma tela precisar filtrar por ela; ver
// matchesTab() logo abaixo para o motivo de A_APURAR não poder ficar em "abertas"/"pagas".
export type FinanceTab = "abertas" | "pagas" | "todas" | "apurar";

export type FinanceSearchParams = {
  tab?: string;
  from?: string;
  to?: string;
  costCenterId?: string;
  q?: string;
  categoryId?: string;
};

// App mobile (Menu > Financeiro): sem filtro nenhum, a lista de Despesas/Receitas mostrava TODOS
// os lançamentos desde sempre — no site (desktop) isso já é assim de propósito (quem quer período
// preenche De/Até), mas no app, sem a mesma tela de filtros, a lista virava uma rolagem sem fim.
// Este helper dá o padrão "mês corrente" só para as páginas mobile aplicarem quando o usuário
// ainda não escolheu De/Até — ver app/m/financeiro/despesas/page.tsx e
// app/m/financeiro/receitas/page.tsx.
export function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

// Só PENDENTE vira ATRASADO por data de vencimento — de propósito. PARCIAL já teve pelo menos um
// FinancePayment lançado (não é mais "nada pago"; o alerta de atraso não faz sentido do mesmo
// jeito) e A_APURAR nem tem valor real conhecido ainda (não existe "atraso" de uma provisão sem
// valor). Confirmar isto aqui sempre que status novo for adicionado: promover PARCIAL/A_APURAR
// para ATRASADO por acidente faria uma parcela parcialmente paga ou uma provisão percentual
// aparecerem coladas com contas de verdade vencidas.
function effective(status: string, dueDate: Date, noDueDate: boolean, now: Date) {
  return status === "PENDENTE" && dueDate < now && !noDueDate ? "ATRASADO" : status;
}

// "abertas" (padrão) = pendentes/atrasadas + PARCIAL — PARCIAL é dinheiro que ainda falta
// entrar/sair (saldo em aberto), então continua contando como conta aberta; não entra em "pagas"
// porque ainda não foi. A_APURAR fica de fora tanto de "abertas" quanto de "pagas": é só uma
// ESTIMATIVA sem valor real ainda, misturar com conta aberta de verdade infla a lista com dinheiro
// que talvez nem exista — tem aba própria ("apurar", ver FinanceTab). "todas" não filtra por
// status nenhum (inclui também CANCELADO e A_APURAR).
function matchesTab(effectiveStatus: string, tab: FinanceTab) {
  if (tab === "todas") return true;
  if (tab === "apurar") return effectiveStatus === "A_APURAR";
  if (tab === "pagas") return effectiveStatus === "PAGO";
  return effectiveStatus === "PENDENTE" || effectiveStatus === "ATRASADO" || effectiveStatus === "PARCIAL";
}

function resolveTab(tab?: string): FinanceTab {
  return tab === "pagas" || tab === "todas" || tab === "apurar" ? tab : "abertas";
}

// Intervalo De/Até informado pelo usuário — o CAMPO ao qual ele se aplica muda conforme a aba:
// em "Recebidas"/"Pagas" (tab === "pagas") o que importa é QUANDO o dinheiro entrou/saiu de
// verdade (paidDate, regime de caixa — mesmo campo que DRE/Relatórios/Livro Caixa já usam), não
// o vencimento original da parcela. Filtrar "pagas" por dueDate escondia, por exemplo, uma
// parcela com vencimento em agosto mas baixada em julho (ou vice-versa) de um filtro "julho" —
// ela tinha sido paga de verdade, só não aparecia. Nas demais abas (abertas/apurar/todas) o
// filtro continua por dueDate, que é o que faz sentido para contas ainda não liquidadas.
function periodWhere(sp: FinanceSearchParams, tab: FinanceTab): { dueDate?: { gte?: Date; lte?: Date }; paidDate?: { gte?: Date; lte?: Date } } {
  const range = {
    gte: sp.from ? new Date(sp.from) : undefined,
    lte: sp.to ? new Date(`${sp.to}T23:59:59`) : undefined,
  };
  if (!range.gte && !range.lte) return {};
  return tab === "pagas" ? { paidDate: range } : { dueDate: range };
}

export async function getFilteredPayables(sp: FinanceSearchParams, officeId: string) {
  const now = new Date();
  const tab = resolveTab(sp.tab);
  const all = await prisma.payable.findMany({
    where: {
      officeId,
      ...periodWhere(sp, tab),
      costCenterId: sp.costCenterId || undefined,
      categoryId: sp.categoryId || undefined,
    },
    include: {
      category: true,
      case: true,
      costCenter: true,
      responsible: true,
      payments: true,
      // Problema 2 (autoavaliação Fase 10) — sem isto, PayablesList não tem como avisar que a
      // despesa já tem um reembolso vinculado. Só os campos mínimos usados no badge, ver
      // components/PayablesList.tsx.
      reimbursementReceivable: { select: { id: true, amount: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const q = (sp.q || "").trim().toLowerCase();
  return all
    .map((p) => ({
      ...p,
      effectiveStatus: effective(p.status, p.dueDate, p.noDueDate, now),
      // Soma real dos FinancePayment desta conta (Fase 3) — é o que decide o saldo em aberto
      // exibido na listagem quando o status é PARCIAL; paidAmount (legado) já é mantido
      // consistente com esta soma pelas Server Actions, mas a lista usa a soma direto para nunca
      // depender de um campo derivado ficar desatualizado.
      paidSum: p.payments.reduce((s, x) => s + x.amount, 0),
    }))
    .filter((p) => matchesTab(p.effectiveStatus, tab))
    .filter((p) => !q || p.description.toLowerCase().includes(q) || (p.supplier || "").toLowerCase().includes(q));
}

export async function getFilteredReceivables(sp: FinanceSearchParams, officeId: string) {
  const now = new Date();
  const tab = resolveTab(sp.tab);
  const all = await prisma.receivable.findMany({
    where: {
      officeId,
      ...periodWhere(sp, tab),
      costCenterId: sp.costCenterId || undefined,
      categoryId: sp.categoryId || undefined,
    },
    include: {
      client: true,
      case: true,
      costCenter: true,
      category: true,
      responsible: true,
      payments: true,
      // Contraparte do reimbursementReceivable de getFilteredPayables acima — só o campo mínimo
      // usado no badge de ReceivablesList.tsx.
      reimbursesPayable: { select: { id: true, description: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const q = (sp.q || "").trim().toLowerCase();
  return all
    .map((r) => ({
      ...r,
      effectiveStatus: effective(r.status, r.dueDate, r.noDueDate, now),
      paidSum: r.payments.reduce((s, x) => s + x.amount, 0),
    }))
    .filter((r) => matchesTab(r.effectiveStatus, tab))
    .filter((r) => !q || r.description.toLowerCase().includes(q) || (r.client?.name || "").toLowerCase().includes(q));
}
