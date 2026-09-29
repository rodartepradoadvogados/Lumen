import { prisma } from "@/lib/prisma";
import { valorLiquido, isAdiantamentoPayable, isReembolsoReceivable } from "@/lib/financeCalc";
import { diaDeBrasilia, inicioDoMesEmBrasilia } from "@/lib/horaDeBrasilia";

// RECEITA E RESULTADO da Visão geral — regime de CAIXA (o que entrou e saiu de verdade, por data de
// baixa), com a MESMA régua de Relatórios > Financeiro e do DRE: adiantamentos a clientes e seus
// reembolsos ficam de fora (não são receita nem custo do escritório).
//
// Só entra aqui quem tem acesso ao Financeiro — a checagem é de quem chama; a função exige
// `permitido` para não vazar valor por engano.

export type MesDeCaixa = { chave: string; rotulo: string; recebido: number; pago: number };

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** As últimas `quantos` chaves "AAAA-MM" terminando no mês de `agora` (Brasília). */
export function ultimosMeses(agora: Date, quantos: number): { chave: string; rotulo: string }[] {
  const [ano, mes] = diaDeBrasilia(agora).split("-").map(Number);
  const lista: { chave: string; rotulo: string }[] = [];
  for (let i = quantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    lista.push({ chave: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, rotulo: `${ABREV[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` });
  }
  return lista;
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function agregarCaixa(
  recebidos: { paidDate: Date; valor: number }[],
  pagos: { paidDate: Date; valor: number }[],
  meses: { chave: string; rotulo: string }[]
): MesDeCaixa[] {
  const porChave = new Map<string, MesDeCaixa>(meses.map((m) => [m.chave, { ...m, recebido: 0, pago: 0 }]));
  for (const r of recebidos) {
    const linha = porChave.get(diaDeBrasilia(r.paidDate).slice(0, 7));
    if (linha) linha.recebido += r.valor;
  }
  for (const p of pagos) {
    const linha = porChave.get(diaDeBrasilia(p.paidDate).slice(0, 7));
    if (linha) linha.pago += p.valor;
  }
  return meses.map((m) => porChave.get(m.chave)!);
}

export type ResumoDeCaixa = {
  /** Série mostrada no gráfico (no mínimo 6 meses). */
  serie: MesDeCaixa[];
  /** Os meses do período escolhido. */
  periodo: { recebido: number; pago: number; resultado: number; meses: number };
  /** Variação do recebido contra o período anterior de mesmo tamanho; nula quando a base não cobre (12 meses). */
  variacaoDoRecebido: number | null;
  medianaDoRecebido12m: number;
  /** Mês de pico (mais de 1,8 vez a mediana) que faz o período parecer menor; nulo quando não se aplica. */
  pico: { rotulo: string; valor: number } | null;
};

export function resumirCaixa(todos24: MesDeCaixa[], nMeses: 1 | 3 | 6 | 12): ResumoDeCaixa {
  const ultimos12 = todos24.slice(-12);
  const mediana12 = mediana(ultimos12.map((m) => m.recebido));
  const periodoMeses = todos24.slice(-nMeses);
  const recebido = periodoMeses.reduce((s, m) => s + m.recebido, 0);
  const pago = periodoMeses.reduce((s, m) => s + m.pago, 0);
  let variacao: number | null = null;
  if (nMeses < 12) {
    const anterior = todos24.slice(-2 * nMeses, -nMeses).reduce((s, m) => s + m.recebido, 0);
    variacao = anterior > 0 ? ((recebido - anterior) / anterior) * 100 : null;
  }
  const maior = ultimos12.reduce((a, b) => (b.recebido > a.recebido ? b : a), ultimos12[0] ?? { chave: "", rotulo: "", recebido: 0, pago: 0 });
  const mediaDoPeriodo = recebido / nMeses;
  const pico = nMeses <= 3 && mediana12 > 0 && maior.recebido > 1.8 * mediana12 && mediaDoPeriodo < mediana12 && !periodoMeses.some((m) => m.chave === maior.chave)
    ? { rotulo: maior.rotulo, valor: maior.recebido }
    : null;
  return {
    serie: todos24.slice(-Math.max(nMeses, 6)),
    periodo: { recebido, pago, resultado: recebido - pago, meses: nMeses },
    variacaoDoRecebido: variacao,
    medianaDoRecebido12m: mediana12,
    pico,
  };
}

export async function receitaEResultado(officeId: string, permitido: boolean, nMeses: 1 | 3 | 6 | 12, agora: Date = new Date()): Promise<ResumoDeCaixa | null> {
  if (!permitido) return null;
  const meses = ultimosMeses(agora, 24);
  const inicio = inicioDoMesEmBrasilia(new Date(agora.getTime() - 23 * 31 * 86_400_000));
  const [recs, pags] = await Promise.all([
    prisma.receivable.findMany({ where: { officeId, status: "PAGO", paidDate: { gte: inicio } } }),
    prisma.payable.findMany({
      where: { officeId, status: "PAGO", paidDate: { gte: inicio } },
      include: { reimbursementReceivable: { select: { id: true } } },
    }),
  ]);
  const recebidos = recs
    .filter((r) => r.paidDate && !isReembolsoReceivable(r))
    .map((r) => ({ paidDate: r.paidDate as Date, valor: r.paidAmount ?? valorLiquido(r.amount, r.discount, r.surcharge) }));
  const pagos = pags
    .filter((p) => p.paidDate && !isAdiantamentoPayable(p))
    .map((p) => ({ paidDate: p.paidDate as Date, valor: p.paidAmount ?? valorLiquido(p.amount, p.discount, p.surcharge) }));
  return resumirCaixa(agregarCaixa(recebidos, pagos, meses), nMeses);
}
