// Funções puras (sem Prisma) de cálculo financeiro para Contas a Pagar/Receber — compartilhadas
// entre listagem, relatórios e o lançamento de honorários (dinheiro + percentual + parcelamento +
// apuração do êxito). Fase 1: fundação de dados ainda dormente — valorLiquido() já é usado pelas
// somas existentes (fluxo de caixa, DRE, livro caixa, painel, relatórios, alertas, e-mail,
// assistente), pois é a correção que impede desconto/acréscimo de ficarem invisíveis nelas;
// statusPorPagamentos/saldoEmAberto/valorPercentualApurado ainda não são chamadas por nenhuma
// tela — são a conta pronta para quando a Fase 2+ implementar a baixa parcial e a apuração do
// êxito.

// Valor líquido de um lançamento (Payable/Receivable): amount é sempre o valor "bruto" indicado
// no cadastro; discount/surcharge (Fase 1) ajustam esse bruto para o valor de fato esperado —
// ex.: acordo com desconto de pontualidade, ou juros/multa por atraso lançados manualmente.
// Todo registro criado antes desta fase tem discount=surcharge=0 (default do schema), então o
// resultado aqui é idêntico a amount para qualquer dado já existente — a correção só passa a
// valer para lançamentos novos que preencherem os dois campos.
export function valorLiquido(amount: number, discount: number = 0, surcharge: number = 0): number {
  return amount - discount + surcharge;
}

// PENDENTE (nada pago ainda) | PARCIAL (algo pago, mas a soma não cobre o valor devido) | PAGO
// (soma cobre o valor devido) — decide puramente pela soma de FinancePayment.amount contra o
// valor devido (já líquido de desconto/acréscimo — passe valorLiquido(...) como amountDevido).
// Não decide ATRASADO: isso continua sendo responsabilidade de effective() em
// lib/financeQuery.ts, que olha a data de vencimento, não quanto já foi pago.
export function statusPorPagamentos(amountDevido: number, somaPagamentos: number): "PENDENTE" | "PARCIAL" | "PAGO" {
  if (somaPagamentos <= 0) return "PENDENTE";
  if (somaPagamentos >= amountDevido) return "PAGO";
  return "PARCIAL";
}

// Quanto ainda falta entrar/sair desta conta — valor líquido menos o que os FinancePayment já
// cobriram. Nunca negativo: um pagamento a maior não vira "saldo a receber negativo" aqui; o que
// fazer com o excedente é decisão de tela, fora do escopo desta fase.
export function saldoEmAberto(amount: number, discount: number, surcharge: number, somaPagamentos: number): number {
  const liquido = valorLiquido(amount, discount, surcharge);
  return Math.max(0, liquido - somaPagamentos);
}

// Apuração do valor real de uma parcela de honorário PERCENTUAL no desfecho do processo (a conta
// pronta para a Fase 4, que implementa a tela). base é o valor de referência do processo no
// momento da apuração (valor da causa, condenação, proveito econômico ou valor do acordo — ver
// Case.caseValue/convictionValue/economicBenefitValue/agreementValue); null/undefined/0 (base
// ainda não preenchida no cadastro do processo) resulta em zero, nunca em erro.
//
// abaterEntrada reproduz a cláusula "com abatimento do valor já pago a título de entrada" do
// contrato ENTRADA_EXITO gerado em lib/honorarios.ts: quando true, desconta do apurado o que já
// foi recebido em dinheiro (jaPagoEmDinheiro) no mesmo HonorarioLancamento — sem isso, o
// escritório cobraria de novo, no êxito, um valor que o cliente já pagou como entrada. O
// resultado nunca é negativo (entrada maior que o percentual apurado não gera cobrança negativa).
export function valorPercentualApurado(params: {
  percentual: number;
  base: number | null | undefined;
  abaterEntrada: boolean;
  jaPagoEmDinheiro: number;
}): number {
  const { percentual, base, abaterEntrada, jaPagoEmDinheiro } = params;
  if (!base) return 0;
  const bruto = (base * percentual) / 100;
  const apurado = abaterEntrada ? bruto - jaPagoEmDinheiro : bruto;
  return Math.max(0, apurado);
}

// "Adiantamento a Cliente" (Despesas do Processo, ver Payable.expensePayer/reimbursementReceivable
// e Receivable.reimbursesPayableId/kind no schema): quando o escritório paga uma despesa que é do
// cliente e cria uma conta a receber de reembolso vinculada, o par Payable/Receivable NÃO é
// despesa nem receita de verdade da atividade do escritório — é uma transferência (o dinheiro sai,
// vira um direito a receber; depois volta). Contar os dois cheios no DRE/Relatórios infla Receita
// e Despesa ao mesmo tempo, distorcendo o Resultado do Período. Estas duas funções identificam os
// dois lados do par para quem monta o resultado (DRE desktop/mobile, Relatórios) excluí-los da
// Receita/Despesa normais e somar à parte, numa seção informativa própria.
//
// isAdiantamentoPayable exige reimbursementReceivable presente (não só expensePayer === "CLIENTE")
// de propósito: uma despesa CLIENTE sem reembolso vinculado (usuário optou por não criar, ou vai
// lançar/cobrar de outra forma) não tem o "outro lado" rastreado para compensar — nesse caso ela
// continua sendo despesa normal do escritório do ponto de vista contábil desta tela.
export function isAdiantamentoPayable(p: { expensePayer: string; reimbursementReceivable?: { id: string } | null }): boolean {
  return p.expensePayer === "CLIENTE" && !!p.reimbursementReceivable;
}

// Espelho do lado Receivable do par — kind "REEMBOLSO" sozinho não basta (é só rótulo livre,
// alguém poderia lançar um "REEMBOLSO" avulso sem processo por trás); exige reimbursesPayableId
// preenchido, a FK @unique que de fato liga esta receita a uma despesa adiantada.
export function isReembolsoReceivable(r: { kind: string; reimbursesPayableId?: string | null }): boolean {
  return r.kind === "REEMBOLSO" && !!r.reimbursesPayableId;
}

// Texto de confirmação ao excluir um lançamento de honorários inteiro (todas as parcelas de
// uma vez), compartilhado entre HonorarioLancamentoCard (desktop) e MobileHonorarioLancamentoGroup
// (app) — antes cada plataforma tinha sua própria cópia escrita à mão, e quando o critério de
// exclusão mudou de `status === "PAGO"` para "tem FinancePayment" (ver lib/actions/deletion.ts),
// só a cópia do desktop foi atualizada; a do mobile ficou descrevendo a regra antiga e prometia
// apagar parcelas PARCIAIS que na verdade continuam em Contas a Receber (achado A50 da revisão
// gauntlet).
export const HONORARIO_LANCAMENTO_DELETE_CONFIRM =
  "Excluir este lançamento de honorários? Parcelas que já receberam algo (pagas ou parciais) continuam em Contas a Receber, com o histórico de recebimento; as que nunca receberam nada são apagadas.";
