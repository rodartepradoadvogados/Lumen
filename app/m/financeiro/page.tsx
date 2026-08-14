import Link from "next/link";
import { Card } from "@/components/ui";
import { ArrowLeft, Wallet, FileBarChart, LineChart, BookOpen, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// Hub/porta de entrada do Financeiro no app mobile — reaproveita os mesmos 6 links já usados
// no hub suspenso "Financeiro" de app/m/page.tsx, só que como página própria (para servir de
// destino do item "Financeiro" em app/m/mais/page.tsx, que antes apontava pro site desktop).
//
// Gate de módulo/acesso mora em app/m/financeiro/layout.tsx (cobre este hub e as 7 páginas
// abaixo dele) — quem chega até aqui já passou por ele.
const FINANCE_ITEMS: { href: string; label: string; desc: string; Icon: LucideIcon }[] = [
  { href: "/m/financeiro/despesas", label: "Despesas", desc: "Contas a pagar, pagas e todas", Icon: Wallet },
  { href: "/m/financeiro/receitas", label: "Receitas", desc: "Contas a receber, recebidas e todas", Icon: Wallet },
  { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", desc: "Visão consolidada do Financeiro", Icon: FileBarChart },
  { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", desc: "Entradas e saídas por período", Icon: LineChart },
  { href: "/m/financeiro/dre", label: "DRE", desc: "Demonstrativo de resultado", Icon: FileBarChart },
  { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", desc: "Extrato cronológico de lançamentos", Icon: BookOpen },
];

export default function MobileFinanceiroHub() {
  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Financeiro</h1>
        <p className="text-sm text-tx-2">Contas, relatórios e caixa do escritório</p>
      </div>

      <Card>
        <div className="divide-y divide-regua">
          {FINANCE_ITEMS.map(({ href, label, desc, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-9 w-9 rounded-lg bg-sf-apoio text-tx-2 flex items-center justify-center shrink-0">
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
