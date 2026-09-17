import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, formatCurrency } from "@/components/ui";
import { valorLiquido } from "@/lib/financeCalc";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";


export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  // O RECORTE DO MÊS — pedido do dono na conferência visual de 17/09/2026: "os números de resumo
  // de financeiro devem considerar os resultados realizados e em aberto e tudo mais apenas dentro
  // do mês corrente."
  //
  // O realizado (recebido/pago, regime de caixa) já era do mês. O EM ABERTO não era: "a receber
  // em aberto" somava toda conta pendente do escritório, de qualquer vencimento — uma parcela de
  // março de 2027 entrava no mesmo número da que vence semana que vem, e o Resumo do mês virava
  // um saldo perpétuo que não respondia pergunta nenhuma.
  //
  // O corte é `dueDate <= fim do mês corrente`, não `dueDate dentro do mês`. A diferença importa:
  // a conta que venceu em agosto e continua aberta ainda é uma conta em aberto HOJE, e sumir com
  // ela seria esconder justamente o risco. Com este corte, a tarja de vencidas continua sendo um
  // subconjunto estrito dos dois totais — o mesmo cuidado de coerência entre números que o sino e
  // a tarja do Painel receberam. O que sai são os vencimentos de meses futuros.
  //
  // Conta sem vencimento (`noDueDate`) fica de fora dos dois: ela não pertence a mês nenhum. Já
  // tem alerta próprio na Central (PARCELA_SEM_VENCIMENTO), que é onde ela precisa ser resolvida.
  //
  // status in ["PENDENTE","ATRASADO"] já exclui A_APURAR (provisão sem valor real, Fase 1) e
  // PARCIAL (que tem saldo em aberto próprio, ver alertas/relatórios) das somas de "a receber" —
  // e o valor é o líquido (desconto/acréscimo), não o amount bruto.
  const fimDoMes = endOfMonth();
  const emAbertoNoMes = {
    officeId: viewer.officeId,
    status: { in: ["PENDENTE", "ATRASADO"] },
    noDueDate: false,
    dueDate: { lte: fimDoMes },
  };
  const [payablesPending, receivablesPending, movimentosDoMes] = await Promise.all([
    prisma.payable.findMany({ where: emAbertoNoMes }),
    prisma.receivable.findMany({ where: emAbertoNoMes }),
    // "Recebido/Pago este mês" é regime de caixa: lê FinancePayment, então inclui baixa PARCIAL
    // e conta cada pagamento no mês em que ele ocorreu. Ver lib/caixaMovimentos.ts.
    listarMovimentosCaixa(viewer.officeId, { de: startOfMonth() }),
  ]);

  const liquido = (x: { amount: number; discount?: number | null; surcharge?: number | null }) =>
    valorLiquido(x.amount, x.discount ?? 0, x.surcharge ?? 0);

  const totalPayable = payablesPending.reduce((s, p) => s + liquido(p), 0);
  const totalReceivable = receivablesPending.reduce((s, r) => s + liquido(r), 0);
  const paidThisMonth = movimentosDoMes.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + m.valor, 0);
  const receivedThisMonth = movimentosDoMes.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + m.valor, 0);
  const resultadoDoMes = receivedThisMonth - paidThisMonth;

  // O QUE ESTÁ VENCIDO — a pergunta que esta tela não respondia. As duas consultas acima já
  // trazem ATRASADO junto com PENDENTE, e os quatro cartões somavam os dois num número só
  // chamado "pendente": a conta que venceu ontem e a que vence daqui a três semanas entravam no
  // mesmo total, e o risco desaparecia dentro dele. Separar não custa consulta nenhuma — é um
  // filtro sobre o que já está na memória.
  const receberAtrasado = receivablesPending.filter((r) => r.status === "ATRASADO");
  const pagarAtrasado = payablesPending.filter((p) => p.status === "ATRASADO");
  const contasVencidas = receberAtrasado.length + pagarAtrasado.length;
  const valorAReceberVencido = receberAtrasado.reduce((s, r) => s + liquido(r), 0);
  const valorAPagarVencido = pagarAtrasado.reduce((s, p) => s + liquido(p), 0);
  // O rótulo diz o recorte, em vez de deixar a pessoa supor: "em aberto" sem data é a ambiguidade
  // que gerou o apontamento.
  const rotuloFimDoMes = fimDoMes.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const composicao = [
    receberAtrasado.length > 0 ? `${formatCurrency(valorAReceberVencido)} a receber` : null,
    pagarAtrasado.length > 0 ? `${formatCurrency(valorAPagarVencido)} a pagar` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="tela">
      <PageHeader
        title="Financeiro"
        subtitle={`O caixa do escritório neste mês — o que venceu, o que entrou e o que está em aberto até ${rotuloFimDoMes}`}
      />

      {/* A TARJA DE RISCO — uma por tela, mesma peça do /painel (ver o comentário lá: o tipo é
          matéria, o número É o bloco). Aqui ela responde "o que venceu e não foi pago", que era
          exatamente a pergunta que este Resumo não respondia. */}
      <div className="bg-campo-risco border-t-2 border-marca-tx px-5 py-4 flex items-baseline gap-4 flex-wrap">
        <span className="font-display text-tarja leading-none font-bold tabular-nums text-marca-tx">{contasVencidas}</span>
        <span className="text-destaque font-semibold leading-tight text-tx">
          conta{contasVencidas === 1 ? "" : "s"} vencida{contasVencidas === 1 ? "" : "s"},<br />a receber e a pagar
        </span>
        <span className="ml-auto text-etiqueta font-semibold uppercase tracking-[.09em] text-tx-2 self-center">
          {composicao || "nada vencido"}
        </span>
      </div>

      {/* Peso desigual, e cada número LEVA ao módulo que o explica. Antes eram quatro cartões
          iguais — a arrumação que o contrato de direção recusa por escrito — e abaixo deles cinco
          cartões de módulo que repetiam, com ícone e seta, exatamente os mesmos cinco destinos que
          a barra de seção já mostra no topo de TODA tela do Financeiro (PageSectionTabs +
          lib/navSections.ts). Metade de um "Resumo" era uma segunda cópia do próprio menu. */}
      <div className="flex flex-wrap items-stretch border-2 border-regua-forte bg-sf rounded-[2px] mt-5">
        <Link
          href="/financeiro/fluxo-de-caixa"
          className="flex-1 min-w-[240px] px-5 py-4 transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-etiqueta font-extrabold uppercase tracking-[.1em] text-tx-3">Resultado de caixa do mês</p>
          <p
            className={`text-guia font-bold tabular-nums mt-1 ${
              resultadoDoMes < 0 ? "text-urgente" : resultadoDoMes > 0 ? "text-concluido" : "text-tx"
            }`}
          >
            {formatCurrency(resultadoDoMes)}
          </p>
          <p className="text-etiqueta text-tx-2 mt-0.5">o que entrou menos o que saiu, neste mês</p>
        </Link>
        <Link
          href="/financeiro/livro-caixa"
          className="flex-1 min-w-[170px] px-5 py-4 border-l border-regua transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-destaque font-bold text-tx tabular-nums">{formatCurrency(receivedThisMonth)}</p>
          <p className="text-etiqueta text-tx-2 mt-0.5">Recebido este mês</p>
        </Link>
        <Link
          href="/financeiro/livro-caixa"
          className="flex-1 min-w-[170px] px-5 py-4 border-l border-regua transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-destaque font-bold text-tx tabular-nums">{formatCurrency(paidThisMonth)}</p>
          <p className="text-etiqueta text-tx-2 mt-0.5">Pago este mês</p>
        </Link>
      </div>

      <div className="flex flex-wrap items-stretch border-2 border-regua-forte border-t-0 bg-sf rounded-[2px]">
        <Link
          href="/financeiro/receitas"
          className="flex-1 min-w-[240px] px-5 py-4 transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-destaque font-bold text-tx tabular-nums">{formatCurrency(totalReceivable)}</p>
          <p className="text-etiqueta text-tx-2 mt-0.5">
            A receber em aberto até {rotuloFimDoMes} · {receivablesPending.length} conta{receivablesPending.length === 1 ? "" : "s"}
          </p>
        </Link>
        <Link
          href="/financeiro/despesas"
          className="flex-1 min-w-[240px] px-5 py-4 border-l border-regua transition-colors duration-100 ease-out hover:bg-acao-bg"
        >
          <p className="text-destaque font-bold text-tx tabular-nums">{formatCurrency(totalPayable)}</p>
          <p className="text-etiqueta text-tx-2 mt-0.5">
            A pagar em aberto até {rotuloFimDoMes} · {payablesPending.length} conta{payablesPending.length === 1 ? "" : "s"}
          </p>
        </Link>
      </div>
    </div>
  );
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Último instante do mês corrente — o teto do recorte "em aberto" (ver a nota longa acima).
function endOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
