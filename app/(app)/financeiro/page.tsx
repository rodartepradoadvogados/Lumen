import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, StatCard, Card, formatCurrency } from "@/components/ui";
import { TrendingDown, TrendingUp, Wallet, BookOpen, PieChart, ArrowRight, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const [payablesPending, receivablesPending, payablesPaidMonth, receivablesPaidMonth] = await Promise.all([
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: { in: ["PENDENTE", "ATRASADO"] } } }),
    prisma.payable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: startOfMonth() } } }),
    prisma.receivable.findMany({ where: { officeId: viewer.officeId, status: "PAGO", paidDate: { gte: startOfMonth() } } }),
  ]);

  const totalPayable = payablesPending.reduce((s, p) => s + p.amount, 0);
  const totalReceivable = receivablesPending.reduce((s, r) => s + r.amount, 0);
  const paidThisMonth = payablesPaidMonth.reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);
  const receivedThisMonth = receivablesPaidMonth.reduce((s, r) => s + (r.paidAmount ?? r.amount), 0);

  const modules = [
    { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: TrendingUp, desc: "Honorários contratuais, sucumbenciais e reembolsos" },
    { href: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: TrendingDown, desc: "Despesas fixas, custas processuais e fornecedores" },
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
            <Card className="p-5 h-full hover:shadow-pop transition-shadow">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-navy-900/5 text-navy-800">
                  <m.icon size={20} />
                </div>
                <ArrowRight size={16} className="text-navy-800/30" />
              </div>
              <h3 className="font-serif font-bold text-navy-900 mt-3">{m.label}</h3>
              <p className="text-xs text-navy-800/50 mt-1">{m.desc}</p>
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
