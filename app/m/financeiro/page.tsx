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
  { href: "/m/financeiro/contas-a-pagar", label: "Contas a Pagar", desc: "Lançamentos pendentes, atrasados e pagos", Icon: Wallet },
  { href: "/m/financeiro/contas-a-receber", label: "Contas a Receber", desc: "Recebimentos pendentes, atrasados e pagos", Icon: Wallet },
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
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Financeiro</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Contas, relatórios e caixa do escritório</p>
      </div>

      {!allowed ? (
        <Card className="p-4 flex items-start gap-3">
          <span className="h-9 w-9 rounded-lg bg-bordo-500/15 dark:bg-bordo-400/10 text-bordo-600 dark:text-bordo-400 flex items-center justify-center shrink-0">
            <ShieldAlert size={17} />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{moduleEnabled ? "Acesso restrito" : "Módulo não disponível"}</p>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">
              {moduleEnabled
                ? "Você não tem acesso ao módulo Financeiro. Fale com um administrador se precisar."
                : "O módulo Financeiro não está incluído no plano deste escritório."}
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {FINANCE_ITEMS.map(({ href, label, desc, Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
                <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center shrink-0">
                  <Icon size={17} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{label}</p>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 truncate">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
