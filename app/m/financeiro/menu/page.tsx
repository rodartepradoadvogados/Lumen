import Link from "next/link";
import { Card } from "@/components/ui";
import { ArrowLeft, Wallet, FileBarChart, LineChart, BookOpen, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// Lista completa das 6 sub-rotas do Financeiro — movida para trás de "Ver detalhes" em
// app/m/financeiro/page.tsx (P0-3 do roteiro de adequação), que agora abre direto no resumo de
// 3 números em vez desta lista.
const FINANCE_ITEMS: { href: string; label: string; desc: string; Icon: LucideIcon }[] = [
  { href: "/m/financeiro/despesas", label: "Despesas", desc: "Contas a pagar, pagas e todas", Icon: Wallet },
  { href: "/m/financeiro/receitas", label: "Receitas", desc: "Contas a receber, recebidas e todas", Icon: Wallet },
  { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", desc: "Visão consolidada do Financeiro", Icon: FileBarChart },
  { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", desc: "Entradas e saídas por período", Icon: LineChart },
  { href: "/m/financeiro/dre", label: "DRE", desc: "Demonstrativo de resultado", Icon: FileBarChart },
  { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", desc: "Extrato cronológico de lançamentos", Icon: BookOpen },
];

export default function MobileFinanceiroMenu() {
  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/financeiro" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Financeiro
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Ver detalhes</h1>
        <p className="text-sm text-tx-2">Contas, relatórios e caixa do escritório</p>
      </div>

      <Card>
        <div className="divide-y divide-regua">
          {FINANCE_ITEMS.map(({ href, label, desc, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-9 w-9 bg-sf-apoio text-tx-2 flex items-center justify-center shrink-0">
                <Icon size={17} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-tx">{label}</p>
                <p className="text-xs text-tx-2 truncate">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
