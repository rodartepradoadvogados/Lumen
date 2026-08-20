import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, StatCard, Card, formatCurrency } from "@/components/ui";
import { valorLiquido } from "@/lib/financeCalc";
import { listarMovimentosCaixa } from "@/lib/caixaMovimentos";
import { TrendingDown, TrendingUp, Wallet, BookOpen, PieChart, ArrowRight, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  // status in ["PENDENTE","ATRASADO"] já exclui A_APURAR (provisão sem valor real, Fase 1) e
  // PARCIAL (que tem saldo em aberto próprio, ver alertas/relatórios) das somas de "a receber" —
  // o ajuste desta fase é trocar o amount BRUTO por valorLiquido() (desconto/acréscimo).
  const [payablesPending, receivablesPending, movimentosDoMes] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] } } }),
    // "Recebido/Pago este mês" é regime de caixa: lê FinancePayment, então inclui baixa PARCIAL
    // e conta cada pagamento no mês em que ele ocorreu. Ver lib/caixaMovimentos.ts.
    listarMovimentosCaixa(viewer.officeId, { de: startOfMonth() }),
  ]);

  const totalPayable = payablesPending.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);
  const totalReceivable = receivablesPending.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  const paidThisMonth = movimentosDoMes.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + m.valor, 0);
  const receivedThisMonth = movimentosDoMes.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + m.valor, 0);

  const modules = [
    { href: "/financeiro/receitas", label: "Receitas", icon: TrendingUp, desc: "Honorários contratuais, sucumbenciais e reembolsos" },
    { href: "/financeiro/despesas", label: "Despesas", icon: TrendingDown, desc: "Despesas fixas, custas processuais e fornecedores" },
    { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: Wallet, desc: "Entradas e saídas projetadas por mês" },
    { href: "/financeiro/dre", label: "DRE", icon: PieChart, desc: "Resultado do exercício por categoria" },
    { href: "/financeiro/livro-caixa", label: "Livro Caixa", icon: BookOpen, desc: "Extrato cronológico de todas as movimentações" },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader title="Financeiro" subtitle="Controle completo de fluxo de caixa do escritório" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="A Receber (pendente)" value={formatCurrency(totalReceivable)} tone="green" icon={<TrendingUp size={18} />} hint={`${receivablesPending.length} contas`} />
        <StatCard label="A Pagar (pendente)" value={formatCurrency(totalPayable)} tone="red" icon={<TrendingDown size={18} />} hint={`${payablesPending.length} contas`} />
        <StatCard label="Recebido este mês" value={formatCurrency(receivedThisMonth)} tone="green" icon={<ListChecks size={18} />} />
        <StatCard label="Pago este mês" value={formatCurrency(paidThisMonth)} tone="navy" icon={<ListChecks size={18} />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="p-5 h-full hover:bg-sf-apoio transition-colors">
              <div className="flex items-start justify-between">
                <div className="p-2.5 bg-sf-apoio text-tx-2">
                  <m.icon size={20} />
                </div>
                <ArrowRight size={16} className="text-tx-3" />
              </div>
              <h3 className="font-bold text-tx mt-3">{m.label}</h3>
              <p className="text-xs text-tx-2 mt-1">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
