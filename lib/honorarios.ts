export const FORMA_COBRANCA_OPTIONS = [
  { value: "PERCENTUAL", label: "Percentual sobre o êxito" },
  { value: "FIXO", label: "Valor fixo" },
  { value: "MENSALIDADE", label: "Mensalidade (contrato continuado)" },
  { value: "ENTRADA_EXITO", label: "Entrada + percentual no êxito" },
  { value: "SO_EXITO", label: "Somente êxito (percentual)" },
  { value: "SO_ENTRADA", label: "Somente entrada (valor fixo, sem êxito)" },
] as const;

export type FormaCobranca = (typeof FORMA_COBRANCA_OPTIONS)[number]["value"];

export const FORMA_PAGAMENTO_OPTIONS = [
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto bancário" },
  { value: "TRANSFERENCIA", label: "Transferência bancária" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
] as const;

export type FormaPagamento = (typeof FORMA_PAGAMENTO_OPTIONS)[number]["value"];

export type HonorariosInput = {
  formaCobranca: FormaCobranca;
  percentualExito?: number;
  valorFixo?: number;
  valorMensalidade?: number;
  valorEntrada?: number;
  parcelado?: boolean;
  numeroParcelas?: number;
  formaPagamento?: FormaPagamento;
  numeroBoleto?: string;
  notaFiscal?: boolean;
};

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formaPagamentoTexto(input: HonorariosInput): string {
  if (!input.formaPagamento) return "";
  const label = FORMA_PAGAMENTO_OPTIONS.find((f) => f.value === input.formaPagamento)?.label ?? "";
  if (input.formaPagamento === "BOLETO" && input.numeroBoleto) {
    return ` O pagamento será realizado via boleto bancário nº ${input.numeroBoleto}.`;
  }
  return label ? ` O pagamento será realizado via ${label.toLowerCase()}.` : "";
}

function parcelamentoTexto(input: HonorariosInput, valorBase?: number): string {
  if (!input.parcelado || !input.numeroParcelas || input.numeroParcelas < 2) return "";
  const parcela = valorBase != null ? valorBase / input.numeroParcelas : undefined;
  return ` O valor será pago em ${input.numeroParcelas} (${extenso(input.numeroParcelas)}) parcelas${
    parcela != null ? ` de ${currency(parcela)}` : ""
  }, com vencimento da primeira parcela no ato da assinatura deste contrato e as demais em igual dia dos meses subsequentes.`;
}

function extenso(n: number): string {
  const nums: Record<number, string> = { 1: "uma", 2: "duas", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez", 11: "onze", 12: "doze" };
  return nums[n] ?? String(n);
}

function notaFiscalTexto(input: HonorariosInput): string {
  return input.notaFiscal
    ? " Será emitida nota fiscal de prestação de serviços correspondente a cada pagamento recebido."
    : "";
}

export function buildHonorariosClause(input: HonorariosInput): string {
  const partes: string[] = [];

  switch (input.formaCobranca) {
    case "PERCENTUAL": {
      const pct = input.percentualExito ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados, o CONTRATANTE pagará aos CONTRATADOS, a título de honorários advocatícios contratuais, o percentual de ${percentLabel(pct)} sobre o valor bruto total do êxito obtido, seja mediante sentença, acordo ou qualquer outra forma de solução do caso.`
      );
      break;
    }
    case "FIXO": {
      const valor = input.valorFixo ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados, o CONTRATANTE pagará aos CONTRATADOS o valor fixo de ${currency(valor)} a título de honorários advocatícios contratuais, independentemente do resultado final da demanda ou do serviço prestado.${parcelamentoTexto(input, valor)}`
      );
      break;
    }
    case "MENSALIDADE": {
      const valor = input.valorMensalidade ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados de forma continuada, o CONTRATANTE pagará aos CONTRATADOS o valor mensal de ${currency(valor)}, a título de honorários advocatícios, com vencimento todo dia 5 (cinco) de cada mês, enquanto vigorar a prestação de serviços objeto deste contrato.`
      );
      break;
    }
    case "ENTRADA_EXITO": {
      const entrada = input.valorEntrada ?? 0;
      const pct = input.percentualExito ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados, o CONTRATANTE pagará aos CONTRATADOS: (i) a título de entrada, o valor de ${currency(entrada)}, devido no ato da assinatura deste contrato;${parcelamentoTexto(input, entrada)} e (ii) o percentual de ${percentLabel(pct)} sobre o valor bruto total do êxito obtido, a ser apurado ao final da demanda, com abatimento do valor já pago a título de entrada.`
      );
      break;
    }
    case "SO_EXITO": {
      const pct = input.percentualExito ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados, o CONTRATANTE pagará aos CONTRATADOS exclusivamente o percentual de ${percentLabel(pct)} sobre o valor bruto total do êxito obtido, não sendo devido qualquer valor a título de honorários caso não haja êxito na demanda ou no serviço prestado.`
      );
      break;
    }
    case "SO_ENTRADA": {
      const entrada = input.valorEntrada ?? 0;
      partes.push(
        `Em remuneração pelos serviços prestados, o CONTRATANTE pagará aos CONTRATADOS, exclusivamente e a título de honorários advocatícios contratuais, o valor de ${currency(entrada)}, devido no ato da assinatura deste contrato, não incidindo qualquer percentual adicional sobre eventual êxito.${parcelamentoTexto(input, entrada)}`
      );
      break;
    }
  }

  partes.push(formaPagamentoTexto(input));
  partes.push(notaFiscalTexto(input));

  return partes.filter(Boolean).join("");
}

function percentLabel(pct: number): string {
  return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (por cento)`;
}
