"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, CreditCard, Building2, Wallet, Users, Activity, ShieldCheck, Scale } from "lucide-react";
import LumenMark from "@/components/LumenMark";

type NavItem = { label: string; href: string; icon: LucideIcon; comingSoon?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// Os itens de Administração e Operação apontam para rotas sem page.tsx nesta fase (Fases 2/3)
// — clicar neles hoje resulta num 404 honesto, de propósito (ver spec: preferível a uma tela
// fingindo estar pronta). O rótulo "em breve" é só um aviso visual, não bloqueia o clique.
const GROUPS: NavGroup[] = [
  {
    label: "Negócio",
    items: [
      { label: "Cockpit", href: "/painel-mestre", icon: LayoutDashboard },
      { label: "Assinaturas", href: "/painel-mestre/assinaturas", icon: CreditCard },
      { label: "Escritórios", href: "/painel-mestre/escritorios", icon: Building2 },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Financeiro Lúmen", href: "/painel-mestre/financeiro", icon: Wallet, comingSoon: true },
      { label: "Equipe Lúmen", href: "/painel-mestre/equipe", icon: Users, comingSoon: true },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Produto e robôs", href: "/painel-mestre/produto", icon: Activity, comingSoon: true },
      { label: "Cofre de acesso", href: "/painel-mestre/cofre", icon: ShieldCheck, comingSoon: true },
      { label: "Confiança e LGPD", href: "/painel-mestre/confianca", icon: Scale, comingSoon: true },
    ],
  },
];

export default function LumenNavRail() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 bg-navy-900 dark:bg-navy-900 border-r border-white/10 flex flex-col overflow-y-auto scrollbar-thin">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <LumenMark size={28} />
          <span className="font-serif text-lg font-semibold text-navy-900 dark:text-cream-50">LÚMEN</span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-800/40 dark:text-cream-50/40 mt-1.5">
          Painel da Empresa
        </p>
      </div>

      <div className="flex-1 py-4 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-4 text-[10px] font-semibold uppercase tracking-wide text-navy-800/35 dark:text-cream-50/35 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm border-l-2 transition-colors ${
                      active
                        ? "border-gold-400 bg-white/5 text-navy-900 dark:text-cream-50 font-semibold"
                        : "border-transparent text-navy-800/60 dark:text-cream-50/60 hover:bg-white/5 hover:text-navy-900 dark:hover:text-cream-50"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.comingSoon && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-navy-800/30 dark:text-cream-50/30">
                        em breve
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
