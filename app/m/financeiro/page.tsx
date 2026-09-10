import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, formatCurrency } from "@/components/ui";
import { getFilteredPayables, getFilteredReceivables } from "@/lib/financeQuery";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";
import { valorLiquido } from "@/lib/financeCalc";
import { getCurrentUser } from "@/lib/currentUser";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

// P0-3 do roteiro de adequação (.impeccable/plano-adequacao/roteiro-de-adequacao.md): esta aba
// era a lista das 6 sub-rotas (peso morto, ver design_handoff_lumen_redesign/08-pwa.md — "isso é
// peso morto"), sem responder "como estão minhas contas" num relance. Agora mostra 3 números
// antes de qualquer lista; as 6 sub-rotas continuam acessíveis um toque adiante, em
// /m/financeiro/menu (mesmo conteúdo que estava aqui, só movido).
export default async function MobileFinanceiroHub() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [payablesAbertas, receivablesAbertas, movimentos] = await Promise.all([
    getFilteredPayables({ tab: "abertas" }, viewer.officeId),
    getFilteredReceivables({ tab: "abertas" }, viewer.officeId),
    // Sem período: saldo acumulado de toda a história do caixa (mesma leitura do Livro Caixa),
    // não só do mês corrente — é "quanto tem em caixa agora", não "quanto moveu neste mês".
    listarMovimentosCaixa(viewer.officeId),
  ]);

  const saldoEmCaixa = movimentos.reduce((s, m) => s + (m.tipo === "ENTRADA" ? m.valor : -m.valor), 0);

  // "A vencer hoje"/"Atrasadas" somam Pagar e Receber juntos — o resumo responde "o que precisa
  // de atenção agora", não "quanto vou pagar" separado de "quanto vou receber". Reusa
  // effectiveStatus de getFilteredPayables/Receivables (lib/financeQuery.ts) em vez de recalcular
  // a promoção PENDENTE→ATRASADO aqui — mesma regra usada em toda tela de Financeiro.
  const abertas = [...payablesAbertas, ...receivablesAbertas];
  const atrasadas = abertas.filter((x) => x.effectiveStatus === "ATRASADO");
  const venceHoje = abertas.filter((x) => x.effectiveStatus === "PENDENTE" && !x.noDueDate && isHoje(x.dueDate));

  const totalAtrasadas = atrasadas.reduce((s, x) => s + valorLiquido(x.amount, x.discount, x.surcharge), 0);
  const totalVenceHoje = venceHoje.reduce((s, x) => s + valorLiquido(x.amount, x.discount, x.surcharge), 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Financeiro</h1>
        <p className="text-sm text-tx-2">Como estão as contas do escritório agora</p>
      </div>

      <Card>
        <div>
          <SummaryRow label="Saldo em caixa" value={saldoEmCaixa} tone={saldoEmCaixa < 0 ? "urgente" : "concluido"} />
          <SummaryRow
            label="A vencer hoje"
            value={totalVenceHoje}
            tone="aviso"
            hint={venceHoje.length ? `${venceHoje.length} conta${venceHoje.length > 1 ? "s" : ""}` : undefined}
          />
          <SummaryRow
            label="Atrasadas"
            value={totalAtrasadas}
            tone="urgente"
            hint={atrasadas.length ? `${atrasadas.length} conta${atrasadas.length > 1 ? "s" : ""}` : undefined}
          />
        </div>
      </Card>

      <Link
        href="/m/financeiro/menu"
        className="flex items-center justify-center gap-1.5 border-2 border-regua-forte text-tx font-semibold text-sm h-11 hover:bg-acao-bg"
      >
        Ver detalhes <ArrowRight size={15} />
      </Link>
    </div>
  );
}

// dueDate é data-calendário pura (meia-noite UTC — mesma convenção de lib/dueStatus.ts); ler os
// componentes em UTC antes de comparar contra o calendário local evita classificar errado perto
// da virada do dia.
function isHoje(dueDate: Date, now: Date = new Date()): boolean {
  const d = new Date(dueDate);
  const dCalendar = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dCalendar.getTime() === hoje.getTime();
}

function SummaryRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "concluido" | "aviso" | "urgente";
  hint?: string;
}) {
  const textTone = { concluido: "text-concluido", aviso: "text-aviso", urgente: "text-urgente" }[tone];
  const borderTone = { concluido: "border-t-concluido", aviso: "border-t-aviso", urgente: "border-t-urgente" }[tone];
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5 border-t-4 first:border-t-0 ${borderTone}`}>
      <div>
        <p className="text-sm font-medium text-tx">{label}</p>
        {hint && <p className="text-xs text-tx-2">{hint}</p>}
      </div>
      <p className={`text-base font-bold tabular-nums shrink-0 ${textTone}`}>{formatCurrency(value)}</p>
    </div>
  );
}
