// Helpers puros (sem Prisma) para o lançamento de honorários da aba Financeiro do Processo, em
// dinheiro e/ou percentual, único ou parcelado — usados tanto pelos Server Actions
// (lib/actions/honorarioLancamento.ts) quanto pelos componentes client (components/honorarios/*
// e components/financeiro/*). Não confundir com lib/honorarios.ts (cláusula de honorários do
// contrato gerado em Peticionar — assunto totalmente diferente).
import { valorPercentualApurado } from "@/lib/financeCalc";

export const VALUE_TYPE_LABELS: Record<string, string> = {
  FIXO: "Dinheiro",
  PERCENTUAL: "Percentual",
};

// "Forma de cobrança" da Fase 2 (components/honorarios/LancarHonorariosModal.tsx) — mais amplo
// que VALUE_TYPE_LABELS acima (que descreve o valueType gravado por PARCELA): aqui é a escolha
// feita uma vez no cabeçalho do formulário, que pode gerar UMA parcela dinheiro, UMA parcela
// percentual, ou as duas (uma de cada) sob o mesmo HonorarioLancamento.
export const COBRANCA_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PERCENTUAL: "Percentual",
  AMBOS: "Dinheiro + Percentual",
};

export const NATUREZA_LABELS: Record<string, string> = {
  CONTRATUAL: "Contratual",
  SUCUMBENCIAL: "Sucumbencial",
};

export const PAYER_TYPE_LABELS: Record<string, string> = {
  CLIENTE: "Cliente do processo",
  ADVERSA: "Parte adversa",
  OUTRO: "Outro",
};

// ACORDO ("Valor do acordo") é a quarta base, adicionada na Fase 2 — ver Case.agreementValue
// (Fase 1) e baseValueFor logo abaixo.
export const PERCENTUAL_BASE_LABELS: Record<string, string> = {
  VALOR_CAUSA: "Valor da Causa",
  PROVEITO_ECONOMICO: "Proveito Econômico",
  CONDENACAO: "Valor da Condenação",
  ACORDO: "Valor do Acordo",
};

// Mesma lista fechada do comentário de schema de Payable.documentType/Receivable.documentType
// (Fase 1) — centralizada aqui porque tanto o Lançamento de Honorários (Fase 2) quanto Contas a
// Pagar/Receber (Fase 3) vão precisar dela.
export const DOCUMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "BOLETO", label: "Boleto" },
  { value: "CONTRATO", label: "Contrato" },
  { value: "FATURA", label: "Fatura" },
  { value: "FOLHA_PAGAMENTO", label: "Folha de pagamento" },
  { value: "NOTA_FISCAL", label: "Nota fiscal" },
  { value: "ORDEM_SERVICO", label: "Ordem de serviço" },
  { value: "RECIBO", label: "Recibo" },
  { value: "OUTROS", label: "Outros" },
];

export type CaseValueBases = {
  caseValue: number | null;
  economicBenefitValue: number | null;
  convictionValue: number | null;
  agreementValue: number | null;
};

// Valor de referência do processo para a base escolhida — null quando o campo correspondente
// ainda não foi preenchido no cadastro do processo (ver EditCaseModal.tsx), caso em que a
// estimativa da parcela fica em zero (ou, na Fase 2, a parcela nasce como provisão A_APURAR) até
// alguém completar o cadastro.
export function baseValueFor(base: string | null | undefined, values: CaseValueBases): number | null {
  if (base === "VALOR_CAUSA") return values.caseValue;
  if (base === "PROVEITO_ECONOMICO") return values.economicBenefitValue;
  if (base === "CONDENACAO") return values.convictionValue;
  if (base === "ACORDO") return values.agreementValue;
  return null;
}

// Estimativa em R$ de uma parcela percentual, SEM abatimento — só para exibição/soma na lista
// (ver HonorarioLancamentoCard.tsx); o valor efetivamente recebido é sempre lançado à mão na
// baixa (paidAmount, ver SettleButton), já que a base pode mudar ou só ser conhecida de fato no
// desfecho do processo.
export function estimatePercentualAmount(percentual: number, base: string | null | undefined, values: CaseValueBases): number {
  const baseValue = baseValueFor(base, values);
  if (!baseValue) return 0;
  return (baseValue * percentual) / 100;
}

// Mesma estimativa acima, mas já líquida do abatimento "entrada em dinheiro" (cláusula
// ENTRADA_EXITO, ver Receivable.abaterEntrada) — reaproveita valorPercentualApurado de
// lib/financeCalc.ts em vez de duplicar a conta (bruto = base × percentual; líquido = bruto menos
// o que já foi pago em dinheiro, nunca negativo), usada pela prévia ao vivo do
// LancarHonorariosModal e pelo Server Action que de fato grava a parcela.
export function estimatePercentualLiquido(params: {
  percentual: number;
  base: string | null | undefined;
  values: CaseValueBases;
  abaterEntrada: boolean;
  jaPagoEmDinheiro: number;
}): number {
  const baseValue = baseValueFor(params.base, params.values);
  return valorPercentualApurado({
    percentual: params.percentual,
    base: baseValue,
    abaterEntrada: params.abaterEntrada,
    jaPagoEmDinheiro: params.jaPagoEmDinheiro,
  });
}
