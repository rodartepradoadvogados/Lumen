"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Briefcase,
  Wallet,
  Users,
  Newspaper,
  Bell,
  Settings,
  Headset,
  Trophy,
  BarChart3,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

// Menu reorganizado em categorias: visão geral do dia a dia primeiro, depois
// atendimento ao cliente, depois o núcleo jurídico/financeiro e por fim gestão
// interna do escritório.
const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      { href: "/kanban", label: "Kanban", icon: Kanban },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { href: "/alertas", label: "Alertas", icon: Bell },
      { href: "/publicacoes", label: "Publicações", icon: Newspaper },
      { href: "/atendimento", label: "Atendimento", icon: Headset },
    ],
  },
  {
    label: "Jurídico",
    items: [
      { href: "/processos", label: "Processos e Casos", icon: Briefcase },
      { href: "/contatos", label: "Contatos", icon: Users },
      { href: "/financeiro", label: "Financeiro", icon: Wallet, adminOnly: true },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { href: "/produtividade", label: "Produtividade", icon: Trophy },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export default function Sidebar({
  hasFinanceAccess = true,
  unreadPublications = 0,
}: {
  hasFinanceAccess?: boolean;
  unreadPublications?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || hasFinanceAccess),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center rounded-lg bg-navy-900 text-cream-50 shadow-pop"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-navy-950/50" onClick={() => setOpen(false)} />
      )}

      <aside
        className={clsx(
          "w-64 shrink-0 bg-navy-900 text-cream-100 flex flex-col h-full fixed md:static top-0 left-0 z-50 transition-transform duration-200 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-6 py-6 border-b border-white/10 relative">
          <button
            onClick={() => setOpen(false)}
            className="md:hidden absolute top-4 right-4 text-cream-100/60 hover:text-cream-50"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="h-px flex-1 bg-gold-500/60" />
            <span className="h-1 w-1 rounded-full bg-gold-500" />
            <span className="h-px flex-1 bg-gold-500/60" />
          </div>
          <h1 className="font-serif text-xl font-bold tracking-wide text-center leading-tight">
            RODARTE PRADO
          </h1>
          <p className="text-center text-[11px] tracking-[0.3em] text-gold-500 font-medium mt-0.5">
            ADVOGADOS
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? "principal"} className={groupIndex === 0 ? "space-y-0.5" : "space-y-0.5 mt-4"}>
              {group.label && (
                <p className="text-[10px] font-semibold tracking-widest uppercase px-3 mb-1 text-cream-100/40">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border-l-2 transition-colors",
                      active
                        ? "bg-gold-500/12 text-gold-300 font-semibold border-gold-400"
                        : "text-cream-100/80 font-medium border-transparent hover:bg-white/5 hover:text-cream-50"
                    )}
                  >
                    <Icon size={18} strokeWidth={2} />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/publicacoes" && unreadPublications > 0 && (
                      <span className="bg-gold-600 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                        {unreadPublications > 99 ? "99+" : unreadPublications}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 text-[11px] text-cream-100/50">
          Sistema Interno · v0.1
        </div>
      </aside>
    </>
  );
}
