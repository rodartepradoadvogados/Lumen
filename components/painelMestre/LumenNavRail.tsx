"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, CreditCard, Building2, Wallet, Users, Activity, ShieldCheck, Scale, Tag, Menu, X } from "lucide-react";
import LumenMark from "@/components/LumenMark";

type NavItem = { label: string; href: string; icon: LucideIcon; comingSoon?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// Financeiro Lúmen e Equipe Lúmen (Administração) ganharam página na Fase 2; os três itens de
// Operação ganharam a deles na Fase 3 (Produto e robôs, Cofre de acesso, Confiança e LGPD).
// Nenhum item deste rail tem mais comingSoon: true.
const GROUPS: NavGroup[] = [
  {
    label: "Negócio",
    items: [
      { label: "Cockpit", href: "/painel-mestre", icon: LayoutDashboard },
      { label: "Assinaturas", href: "/painel-mestre/assinaturas", icon: CreditCard },
      { label: "Escritórios", href: "/painel-mestre/escritorios", icon: Building2 },
      { label: "Preços", href: "/painel-mestre/precos", icon: Tag },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Financeiro Lúmen", href: "/painel-mestre/financeiro", icon: Wallet },
      { label: "Equipe Lúmen", href: "/painel-mestre/equipe", icon: Users },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Produto e robôs", href: "/painel-mestre/produto", icon: Activity },
      { label: "Cofre de acesso", href: "/painel-mestre/cofre", icon: ShieldCheck },
      { label: "Confiança e LGPD", href: "/painel-mestre/confianca", icon: Scale },
    ],
  },
];

export default function LumenNavRail() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha a gaveta ao navegar — mesmo padrão de components/Sidebar.tsx (o rail do lado
  // escritório), que já resolve isso do mesmo jeito para a versão estreita de tela.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center bg-grafite-800 text-white border border-white/10"
        aria-label="Abrir menu do Painel da Empresa"
      >
        <Menu size={18} />
      </button>

      {open && <div className="md:hidden fixed inset-0 z-40 bg-grafite-900/60" onClick={() => setOpen(false)} />}

      <nav
        className={`w-56 shrink-0 bg-grafite-800 border-r border-white/10 flex flex-col h-full fixed md:static top-0 left-0 z-50 overflow-y-auto scrollbar-thin transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-5 border-b border-white/10 relative">
          <button
            onClick={() => setOpen(false)}
            className="md:hidden absolute top-4 right-4 text-white/60 hover:text-white"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <LumenMark size={28} />
            <span className="text-lg font-semibold text-white">LÚMEN</span>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40 mt-1.5">
            Painel da Empresa
          </p>
        </div>

        <div className="flex-1 py-4 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-4 text-[10px] font-semibold uppercase tracking-wide text-white/35 mb-1.5">
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
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm border-l-2 transition-colors ${
                        active
                          ? "border-marca bg-white/5 text-white font-semibold"
                          : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.comingSoon && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-white/30">
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
    </>
  );
}
