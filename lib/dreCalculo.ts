import { listarMovimentosCaixa, apurarResultado, MovimentoCaixa } from "@/lib/caixaMovimentos";
import { buildCategoryBreakdown, CategoryBreakdown } from "@/lib/cashFlowGroups";

// Camada de cálculo da DRE Gerencial (pedido explícito: "apresentar as linhas todas, completas,
// com os indicadores da DRE normal" — cascata com subtotal por grupo, % da receita e comparação
// com o período anterior). Reaproveita as duas peças que já existiam: listarMovimentosCaixa (regime
// de caixa de verdade, ver comentário no topo de lib/caixaMovimentos.ts) para OS VALORES, e
// buildCategoryBreakdown (mesma árvore de grupos que o Fluxo de Caixa já usa) para A ESTRUTURA —
// nenhuma tabela nova, nenhuma classificação inventada (não existe "Deduções"/"Financeiro" no plano
// de contas hoje; forçar essa divisão sem dado real por trás produziria uma DRE tecnicamente
// "completa" mas com números chutados, pior que a estrutura simples atual).

export type DrePeriodo = { de: Date; ate: Date }; // `ate` é EXCLUSIVO — mesma convenção de caixaMovimentos

export type DreResultado = {
  periodo: DrePeriodo;
  receitas: CategoryBreakdown;
  despesas: CategoryBreakdown;
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
  totalAdiantado: number;
  totalReembolsado: number;
  saldoAdiantamentos: number;
};

// Período anterior de MESMA DURAÇÃO, encostado logo antes — usado pela coluna de comparação.
// Ex.: DRE de agosto/2026 (01 a 01/set exclusivo) compara com julho inteiro; um intervalo
// personalizado de 10 dias compara com os 10 dias imediatamente anteriores a ele.
export function periodoAnterior({ de, ate }: DrePeriodo): DrePeriodo {
  const duracaoMs = ate.getTime() - de.getTime();
  return { de: new Date(de.getTime() - duracaoMs), ate: new Date(de.getTime()) };
}

function paraEntradasDeCategoria(movimentos: MovimentoCaixa[]) {
  return movimentos.map((m) => ({ id: m.id, description: m.descricao, date: m.data, amount: m.valor, categoryId: m.categoryId }));
}

export async function calcularDre(officeId: string, periodo: DrePeriodo, costCenterId?: string): Promise<DreResultado> {
  const movimentos = await listarMovimentosCaixa(officeId, { de: periodo.de, ate: periodo.ate, ateExclusivo: true, costCenterId });
  const { totalReceitas, totalDespesas, resultado, totalAdiantado, totalReembolsado, saldoAdiantamentos } = apurarResultado(movimentos);

  // Mesmo corte de apurarResultado (adiantamento/reembolso são transferência, não entram na
  // árvore de receita/despesa "de verdade" do escritório).
  const movReceitas = movimentos.filter((m) => m.tipo === "ENTRADA" && !m.ehReembolso);
  const movDespesas = movimentos.filter((m) => m.tipo === "SAIDA" && !m.ehAdiantamento);

  const [receitas, despesas] = await Promise.all([
    buildCategoryBreakdown("RECEITA", officeId, paraEntradasDeCategoria(movReceitas)),
    buildCategoryBreakdown("DESPESA", officeId, paraEntradasDeCategoria(movDespesas)),
  ]);

  return { periodo, receitas, despesas, totalReceitas, totalDespesas, resultado, totalAdiantado, totalReembolsado, saldoAdiantamentos };
}

// Variação percentual entre dois valores — null quando o anterior é zero (0% base não tem
// "variação percentual" que faça sentido: qualquer valor novo seria "infinito"), a UI mostra um
// travessão nesse caso em vez de "∞%"/"NaN%".
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
