// Helpers puros (sem Prisma) para o lançamento de honorários parcelado da aba Financeiro do
// Processo, em dinheiro ou percentual — usados tanto pelos Server Actions
// (lib/actions/honorarioLancamento.ts) quanto pelos componentes client
// (components/honorarios/*). Não confundir com lib/honorarios.ts (cláusula de honorários do
// contrato gerado em Peticionar — assunto totalmente diferente).

export const VALUE_TYPE_LABELS: Record<string, string> = {
  FIXO: "Dinheiro",
  PERCENTUAL: "Percentual",
};

export const PERCENTUAL_BASE_LABELS: Record<string, string> = {
  VALOR_CAUSA: "Valor da Causa",
  PROVEITO_ECONOMICO: "Proveito Econômico",
  CONDENACAO: "Valor da Condenação",
};

export type CaseValueBases = {
  caseValue: number | null;
  economicBenefitValue: number | null;
  convictionValue: number | null;
};

// Valor de referência do processo para a base escolhida — null quando o campo correspondente
// ainda não foi preenchido no cadastro do processo (ver EditCaseModal.tsx), caso em que a
// estimativa da parcela fica em zero até alguém completar o cadastro.
export function baseValueFor(base: string | null | undefined, values: CaseValueBases): number | null {
  if (base === "VALOR_CAUSA") return values.caseValue;
  if (base === "PROVEITO_ECONOMICO") return values.economicBenefitValue;
  if (base === "CONDENACAO") return values.convictionValue;
  return null;
}

// Estimativa em R$ de uma parcela percentual — só para exibição/soma na lista; o valor
// efetivamente recebido é sempre lançado à mão na baixa (paidAmount, ver SettleButton), já que a
// base pode mudar ou só ser conhecida de fato no desfecho do processo.
export function estimatePercentualAmount(percentual: number, base: string | null | undefined, values: CaseValueBases): number {
  const baseValue = baseValueFor(base, values);
  if (!baseValue) return 0;
  return (baseValue * percentual) / 100;
}
