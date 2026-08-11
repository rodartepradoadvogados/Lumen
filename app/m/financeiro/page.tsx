import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { Card } from "@/components/ui";
import { ArrowLeft, Wallet, FileBarChart, LineChart, BookOpen, ShieldAlert, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// Hub/porta de entrada do Financeiro no app mobile — reaproveita os mesmos 6 links já usados
// no hub suspenso "Financeiro" de app/m/page.tsx, só que como página própria (para servir de
// destino do item "Financeiro" em app/m/mais/page.tsx, que antes apontava pro site desktop).
const FINANCE_ITEMS: { href: string; label: string; desc: string; Icon: LucideIcon }[] = [
  { href: "/m/financeiro/despesas", label: "Despesas", desc: "Contas a pagar, pagas e todas", Icon: Wallet },
  { href: "/m/financeiro/receitas", label: "Receitas", desc: "Contas a receber, recebidas e todas", Icon: Wallet },
  { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", desc: "Visão consolidada do Financeiro", Icon: FileBarChart },
  { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", desc: "Entradas e saídas por período", Icon: LineChart },
  { href: "/m/financeiro/dre", label: "DRE", desc: "Demonstrativo de resultado", Icon: FileBarChart },
  { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", desc: "Extrato cronológico de lançamentos", Icon: BookOpen },
];

export default async function MobileFinanceiroHub() {
  const viewer = await getCurrentUser();
  const moduleEnabled = viewer ? (await getOfficeModules(viewer.officeId)).financeiro : false;
  const allowed = moduleEnabled && Boolean(viewer?.isAdmin || viewer?.financeAccess);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-tx">Financeiro</h1>
        <p className="text-sm text-tx-2">Contas, relatórios e caixa do escritório</p>
      </div>

      {!allowed ? (
        <Card className="p-4 flex items-start gap-3">
          <span className="h-9 w-9 rounded-lg bg-aviso-bg text-aviso flex items-center justify-center shrink-0">
            <ShieldAlert size={17} />
          </span>
          <div>
            <p className="text-sm font-semibold text-tx">{moduleEnabled ? "Acesso restrito" : "Módulo não disponível"}</p>
            <p className="text-xs text-tx-2 mt-0.5">
              {moduleEnabled
                ? "Você não tem acesso ao módulo Financeiro. Fale com um administrador se precisar."
                : "O módulo Financeiro não está incluído no plano deste escritório."}
            </p>
          </div>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
