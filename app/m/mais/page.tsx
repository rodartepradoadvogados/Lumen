import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { logout } from "@/lib/actions/auth";
import { Card } from "@/components/ui";
import MobileInstallMenuItem from "@/components/mobile/MobileInstallMenuItem";
import { Phone, DollarSign, BarChart, Settings, LogOut, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileMais() {
  const viewer = await getCurrentUser();
  const modules = viewer ? await getOfficeModules(viewer.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(viewer?.isAdmin || viewer?.financeAccess);

  const items = [
    { href: "/m/atendimento", label: "Atendimento", Icon: Phone, show: modules.atendimento },
    { href: "/m/financeiro", label: "Financeiro", Icon: DollarSign, show: showFinance },
    { href: "/m/relatorios", label: "Relatórios", Icon: BarChart, show: true },
    { href: "/m/configuracoes", label: "Configurações", Icon: Settings, show: true },
  ].filter((i) => i.show);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Mais</h1>
        {viewer && <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{viewer.name}</p>}
      </div>

      <Card>
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {items.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center shrink-0">
                <Icon size={17} />
              </span>
              <span className="flex-1 text-sm font-medium text-navy-900 dark:text-cream-50">{label}</span>
              <ChevronRight size={16} className="text-navy-800/30 dark:text-cream-50/30" />
            </Link>
          ))}
          <MobileInstallMenuItem />
        </div>
      </Card>

      <form action={logout}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-navy-900 border border-navy-800/10 dark:border-white/10 text-bordo-600 dark:text-bordo-400 font-semibold text-sm py-3 rounded-xl"
        >
          <LogOut size={16} /> Sair
        </button>
      </form>
    </div>
  );
}
