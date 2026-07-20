import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { logout } from "@/lib/actions/auth";
import { Card } from "@/components/ui";
import { Phone, DollarSign, BarChart, Settings, ExternalLink, LogOut, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileMais() {
  const viewer = await getCurrentUser();
  const showFinance = Boolean(viewer?.isAdmin || viewer?.financeAccess);

  const items = [
    { href: "/atendimento", label: "Atendimento", Icon: Phone, show: true },
    { href: "/financeiro", label: "Financeiro", Icon: DollarSign, show: showFinance },
    { href: "/relatorios", label: "Relatórios", Icon: BarChart, show: true },
    { href: "/configuracoes", label: "Configurações", Icon: Settings, show: true },
    { href: "/", label: "Ver versão completa do site", Icon: ExternalLink, show: true },
  ].filter((i) => i.show);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900">Mais</h1>
        {viewer && <p className="text-sm text-navy-800/50">{viewer.name}</p>}
      </div>

      <Card>
        <div className="divide-y divide-navy-800/5">
          {items.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="h-9 w-9 rounded-lg bg-navy-900/5 text-navy-800 flex items-center justify-center shrink-0">
                <Icon size={17} />
              </span>
              <span className="flex-1 text-sm font-medium text-navy-900">{label}</span>
              <ChevronRight size={16} className="text-navy-800/30" />
            </Link>
          ))}
        </div>
      </Card>

      <form action={logout}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 bg-white border border-navy-800/10 text-red-600 font-semibold text-sm py-3 rounded-xl"
        >
          <LogOut size={16} /> Sair
        </button>
      </form>
    </div>
  );
}
