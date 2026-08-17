import { prisma } from "@/lib/prisma";
import { valorLiquido, isAdiantamentoPayable, isReembolsoReceivable } from "@/lib/financeCalc";

// Fonte única dos relatórios de REGIME DE CAIXA (Livro Caixa, DRE, painel do Financeiro,
// Relatórios Gerenciais) — site e app.
//
// POR QUE ISTO EXISTE. Antes, cada uma das 6 telas consultava Receivable/Payable com
// `status: "PAGO"` e somava `paidAmount`. Isso tinha dois defeitos, os dois com efeito em valor:
//
//   1. BAIXA PARCIAL SUMIA. Desde a Fase 3 uma conta com recebimento parcial fica com status
//      PARCIAL (statusPorPagamentos, lib/financeCalc.ts), então o filtro `status: "PAGO"` a
//      descartava inteira: dinheiro que de fato entrou no caixa valia ZERO no Livro Caixa e no
//      DRE. Quem recebe honorário em acordo informal ou o cliente que paga "por conta" ficava
//      invisível até a quitação.
//   2. QUITAÇÃO CAÍA TODA NO ÚLTIMO MÊS. Receivable.paidDate guarda a data do pagamento MAIS
//      RECENTE e paidAmount guarda a SOMA de todos (ver syncReceivableStatus em
//      lib/actions/financeiro.ts). Uma conta recebida R$ 400 em janeiro e R$ 600 em fevereiro
//      aparecia como R$ 1.000 inteiros em fevereiro — janeiro subdeclarado, fevereiro
//      superdeclarado, com reflexo direto na apuração de resultado e na base de imposto.
//
// A correção é ler o FinancePayment, que é a linha de caixa de verdade: cada pagamento tem seu
// próprio valor e sua própria data, então cai no mês certo e nenhum centavo se perde.
//
// AS DUAS ERAS DE DADO. Lançamentos anteriores à Fase 3 foram baixados direto nos campos legados
// (status=PAGO + paidAmount + paidDate) sem nunca criar um FinancePayment. Se esta função lesse
// SÓ FinancePayment, todo o histórico anterior desapareceria dos relatórios — trocaríamos um erro
// por outro maior. Por isso ela soma duas fontes que não se sobrepõem:
//   (a) todo FinancePayment do período;
//   (b) os lançamentos legados: status PAGO e `payments: { none: {} }` — ou seja, baixados sem
//       nenhuma linha de pagamento. O `none` é o que garante que nada seja contado duas vezes.
//
// Não filtra A_APURAR explicitamente: uma provisão percentual não tem como ter FinancePayment (o
// botão de baixa não aparece para ela) nem status PAGO sem antes ser apurada.

export type MovimentoCaixa = {
  id: string;
  data: Date;
  // Sempre positivo — o sinal fica em `tipo`, para quem soma não depender de convenção implícita.
  valor: number;
  tipo: "ENTRADA" | "SAIDA";
  descricao: string;
  clienteNome: string | null;
  categoriaNome: string | null;
  // Usado por lib/dreCalculo.ts (DRE Gerencial) pra montar a árvore de grupos do plano de contas
  // via buildCategoryBreakdown (lib/cashFlowGroups.ts) — categoriaNome sozinho não basta porque
  // essa função agrupa por ID (categorias com nomes iguais em ramos diferentes existem).
  categoryId: string | null;
  // Adiantamento a cliente e seu reembolso são TRANSFERÊNCIA, não receita/despesa do escritório
  // (ver isAdiantamentoPayable/isReembolsoReceivable). Quem monta DRE precisa separá-los; quem
  // monta Livro Caixa (extrato puro de movimentação) mostra tudo. Por isso a classificação vem
  // no movimento e a decisão de excluir fica com a tela.
  ehAdiantamento: boolean;
  ehReembolso: boolean;
};

type Periodo = {
  // Ambos opcionais: o Livro Caixa quer "tudo até agora", o DRE quer um mês fechado.
  de?: Date;
  ate?: Date;
  // `lt` (exclusivo) para o DRE, que passa o primeiro dia do mês seguinte; `lte` (inclusivo)
  // para o Livro Caixa, que passa "agora".
  ateExclusivo?: boolean;
  costCenterId?: string;
};

function faixaData({ de, ate, ateExclusivo }: Periodo) {
  if (!de && !ate) return undefined;
  return { ...(de ? { gte: de } : {}), ...(ate ? (ateExclusivo ? { lt: ate } : { lte: ate }) : {}) };
}

export async function listarMovimentosCaixa(officeId: string, periodo: Periodo = {}): Promise<MovimentoCaixa[]> {
  const data = faixaData(periodo);
  const { costCenterId } = periodo;

  // Centro de custo é atributo da CONTA, não do pagamento — por isso o filtro entra no pai em
  // ambas as consultas. `OR` porque um FinancePayment aponta para receivable OU payable.
  const filtroCentroCusto = costCenterId
    ? { OR: [{ receivable: { costCenterId } }, { payable: { costCenterId } }] }
    : {};

  const [pagamentos, receivablesLegado, payablesLegado] = await Promise.all([
    prisma.financePayment.findMany({
      where: { officeId, ...(data ? { paidDate: data } : {}), ...filtroCentroCusto },
      include: {
        receivable: { include: { client: { select: { name: true } }, category: { select: { name: true } } } },
        payable: { include: { category: { select: { name: true } }, reimbursementReceivable: { select: { id: true } } } },
      },
    }),
    prisma.receivable.findMany({
      where: { officeId, status: "PAGO", payments: { none: {} }, ...(data ? { paidDate: data } : {}), costCenterId },
      include: { client: { select: { name: true } }, category: { select: { name: true } } },
    }),
    prisma.payable.findMany({
      where: { officeId, status: "PAGO", payments: { none: {} }, ...(data ? { paidDate: data } : {}), costCenterId },
      include: { category: { select: { name: true } }, reimbursementReceivable: { select: { id: true } } },
    }),
  ]);

  const movimentos: MovimentoCaixa[] = [];

  for (const pg of pagamentos) {
    if (pg.receivable) {
      const r = pg.receivable;
      movimentos.push({
        id: pg.id,
        data: pg.paidDate,
        valor: pg.amount,
        tipo: "ENTRADA",
        descricao: r.description,
        clienteNome: r.client?.name ?? null,
        categoriaNome: r.category?.name ?? null,
        categoryId: r.categoryId,
        ehAdiantamento: false,
        ehReembolso: isReembolsoReceivable(r),
      });
    } else if (pg.payable) {
      const p = pg.payable;
      movimentos.push({
        id: pg.id,
        data: pg.paidDate,
        valor: pg.amount,
        tipo: "SAIDA",
        descricao: p.description,
        clienteNome: null,
        categoriaNome: p.category?.name ?? null,
        categoryId: p.categoryId,
        ehAdiantamento: isAdiantamentoPayable(p),
        ehReembolso: false,
      });
    }
    // FinancePayment sem receivable nem payable não deveria existir (ver comentário do model no
    // schema); se existir, é dado órfão e fica de fora em vez de virar movimento sem origem.
  }

  // Legado: o valor movimentado é paidAmount; o fallback para amount cobre registro antigo sem
  // paidAmount e passa por valorLiquido para respeitar desconto/acréscimo — mesma regra que as
  // telas já aplicavam antes desta função existir.
  for (const r of receivablesLegado) {
    movimentos.push({
      id: r.id,
      data: r.paidDate!,
      valor: r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge),
      tipo: "ENTRADA",
      descricao: r.description,
      clienteNome: r.client?.name ?? null,
      categoriaNome: r.category?.name ?? null,
      categoryId: r.categoryId,
      ehAdiantamento: false,
      ehReembolso: isReembolsoReceivable(r),
    });
  }
  for (const p of payablesLegado) {
    movimentos.push({
      id: p.id,
      data: p.paidDate!,
      valor: p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge),
      tipo: "SAIDA",
      descricao: p.description,
      clienteNome: null,
      categoriaNome: p.category?.name ?? null,
      categoryId: p.categoryId,
      ehAdiantamento: isAdiantamentoPayable(p),
      ehReembolso: false,
    });
  }

  return movimentos.sort((a, b) => a.data.getTime() - b.data.getTime());
}

// Agrupamento por categoria já separando adiantamento/reembolso — o corte que DRE e Relatórios
// Gerenciais fazem, idêntico nos dois, agora num lugar só.
export function apurarResultado(movimentos: MovimentoCaixa[]) {
  const receitasPorCategoria: Record<string, number> = {};
  const despesasPorCategoria: Record<string, number> = {};
  let totalAdiantado = 0;
  let totalReembolsado = 0;

  for (const m of movimentos) {
    if (m.tipo === "ENTRADA") {
      if (m.ehReembolso) {
        totalReembolsado += m.valor;
        continue;
      }
      const chave = m.categoriaNome ?? "Outras Receitas";
      receitasPorCategoria[chave] = (receitasPorCategoria[chave] ?? 0) + m.valor;
    } else {
      if (m.ehAdiantamento) {
        totalAdiantado += m.valor;
        continue;
      }
      const chave = m.categoriaNome ?? "Outras Despesas";
      despesasPorCategoria[chave] = (despesasPorCategoria[chave] ?? 0) + m.valor;
    }
  }

  const totalReceitas = Object.values(receitasPorCategoria).reduce((s, v) => s + v, 0);
  const totalDespesas = Object.values(despesasPorCategoria).reduce((s, v) => s + v, 0);

  return {
    receitasPorCategoria,
    despesasPorCategoria,
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
    totalAdiantado,
    totalReembolsado,
    saldoAdiantamentos: totalAdiantado - totalReembolsado,
  };
}
